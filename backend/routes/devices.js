const router = require('express').Router();
const { pool } = require('../db/connection');
const { authMiddleware, requirePermission } = require('../middleware/auth');

router.use(authMiddleware);

// ─── Helpers ─────────────────────────────────────────────────

async function auditLog(pool, admin, action, targetName, details, ip) {
  await pool.query(
    'INSERT INTO audit_log (admin_user, action, target_type, target_name, details, ip_address) VALUES (?,?,?,?,?,?)',
    [admin, action, 'device', targetName, details ? JSON.stringify(details) : null, ip]
  );
}

/**
 * Normaliza qualquer formato de MAC para aa:bb:cc:dd:ee:ff (lowercase, colons).
 * Aceita: aa:bb:cc:dd:ee:ff / AA-BB-CC-DD-EE-FF / aabbccddeeff
 * Retorna null se inválido.
 */
function normalizeMac(mac) {
  if (!mac) return null;
  const clean = mac.replace(/[^0-9a-fA-F]/g, '');
  if (clean.length !== 12) return null;
  return clean.toLowerCase().match(/.{2}/g).join(':');
}

function isValidMac(mac) {
  return normalizeMac(mac) !== null;
}

// ─── GET /api/devices ─────────────────────────────────────────
router.get('/', requirePermission('devices', 'view'), async (req, res) => {
  try {
    const { search, device_type, active } = req.query;
    let where = ['1=1'];
    let params = [];

    if (search) {
      where.push('(dp.mac LIKE ? OR dp.alias LIKE ? OR dp.description LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (device_type) { where.push('dp.device_type = ?'); params.push(device_type); }
    if (active !== undefined && active !== '') { where.push('dp.active = ?'); params.push(parseInt(active)); }

    const [rows] = await pool.query(
      `SELECT dp.*, vp.vlan_id, vp.color as vlan_color, rug.groupname
       FROM device_profiles dp
       LEFT JOIN radusergroup rug ON rug.username = dp.mac
       LEFT JOIN vlan_profiles vp ON vp.groupname = rug.groupname
       WHERE ${where.join(' AND ')}
       ORDER BY dp.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar dispositivos' });
  }
});

// ─── POST /api/devices ────────────────────────────────────────
router.post('/', requirePermission('devices', 'create'), async (req, res) => {
  const { mac, alias, device_type, description, groupname } = req.body;

  if (!mac || !groupname)
    return res.status(400).json({ error: 'MAC address e grupo são obrigatórios' });

  const normalizedMac = normalizeMac(mac);
  if (!normalizedMac)
    return res.status(400).json({ error: 'MAC address inválido. Use o formato AA:BB:CC:DD:EE:FF' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Verifica se MAC já existe
    const [[existing]] = await conn.query('SELECT mac FROM device_profiles WHERE mac = ?', [normalizedMac]);
    if (existing) {
      await conn.rollback();
      return res.status(409).json({ error: 'Dispositivo com este MAC já cadastrado' });
    }

    // Verifica se o grupo existe e está ativo
    const [[group]] = await conn.query('SELECT groupname FROM vlan_profiles WHERE groupname = ? AND active = 1', [groupname]);
    if (!group) {
      await conn.rollback();
      return res.status(400).json({ error: 'Grupo/VLAN não encontrado ou inativo' });
    }

    // Insere credenciais no FreeRADIUS (MAB: username=MAC, password=MAC)
    await conn.query(
      "INSERT INTO radcheck (username, attribute, op, value) VALUES (?, 'Cleartext-Password', ':=', ?)",
      [normalizedMac, normalizedMac]
    );

    // Associa ao grupo/VLAN
    await conn.query(
      'INSERT INTO radusergroup (username, groupname, priority) VALUES (?, ?, 1)',
      [normalizedMac, groupname]
    );

    // Perfil do dispositivo
    await conn.query(
      `INSERT INTO device_profiles (mac, alias, device_type, description, active, created_by)
       VALUES (?, ?, ?, ?, 1, ?)`,
      [normalizedMac, alias || null, device_type || 'other', description || null, req.admin.username]
    );

    await conn.commit();
    await auditLog(pool, req.admin.username, 'CREATE_DEVICE', normalizedMac, { alias, groupname, device_type }, req.ip);

    res.status(201).json({ message: 'Dispositivo cadastrado com sucesso', mac: normalizedMac });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Erro ao cadastrar dispositivo' });
  } finally {
    conn.release();
  }
});

// ─── PUT /api/devices/:mac ────────────────────────────────────
router.put('/:mac', requirePermission('devices', 'edit'), async (req, res) => {
  const normalizedMac = normalizeMac(req.params.mac);
  if (!normalizedMac)
    return res.status(400).json({ error: 'MAC address inválido' });

  const { alias, device_type, description, groupname } = req.body;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[existing]] = await conn.query('SELECT mac FROM device_profiles WHERE mac = ?', [normalizedMac]);
    if (!existing) {
      await conn.rollback();
      return res.status(404).json({ error: 'Dispositivo não encontrado' });
    }

    // Atualiza perfil
    await conn.query(
      'UPDATE device_profiles SET alias=?, device_type=?, description=? WHERE mac=?',
      [alias || null, device_type || 'other', description || null, normalizedMac]
    );

    // Atualiza grupo se informado
    if (groupname) {
      const [[group]] = await conn.query('SELECT groupname FROM vlan_profiles WHERE groupname = ? AND active = 1', [groupname]);
      if (!group) {
        await conn.rollback();
        return res.status(400).json({ error: 'Grupo/VLAN não encontrado ou inativo' });
      }
      await conn.query('DELETE FROM radusergroup WHERE username = ?', [normalizedMac]);
      await conn.query('INSERT INTO radusergroup (username, groupname, priority) VALUES (?, ?, 1)', [normalizedMac, groupname]);
    }

    await conn.commit();
    await auditLog(pool, req.admin.username, 'UPDATE_DEVICE', normalizedMac, { alias, groupname, device_type }, req.ip);

    res.json({ message: 'Dispositivo atualizado com sucesso' });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar dispositivo' });
  } finally {
    conn.release();
  }
});

// ─── PATCH /api/devices/:mac/toggle ──────────────────────────
router.patch('/:mac/toggle', requirePermission('devices', 'toggle'), async (req, res) => {
  const normalizedMac = normalizeMac(req.params.mac);
  if (!normalizedMac)
    return res.status(400).json({ error: 'MAC address inválido' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[device]] = await conn.query('SELECT mac, active, alias FROM device_profiles WHERE mac = ?', [normalizedMac]);
    if (!device) {
      await conn.rollback();
      return res.status(404).json({ error: 'Dispositivo não encontrado' });
    }

    const newActive = device.active ? 0 : 1;
    await conn.query('UPDATE device_profiles SET active = ? WHERE mac = ?', [newActive, normalizedMac]);

    if (newActive === 0) {
      // Bloqueia: adiciona Auth-Type := Reject
      await conn.query("DELETE FROM radcheck WHERE username = ? AND attribute = 'Auth-Type'", [normalizedMac]);
      await conn.query(
        "INSERT INTO radcheck (username, attribute, op, value) VALUES (?, 'Auth-Type', ':=', 'Reject')",
        [normalizedMac]
      );
    } else {
      // Desbloqueia: remove o Reject
      await conn.query("DELETE FROM radcheck WHERE username = ? AND attribute = 'Auth-Type'", [normalizedMac]);
    }

    await conn.commit();
    const action = newActive ? 'ENABLE_DEVICE' : 'DISABLE_DEVICE';
    await auditLog(pool, req.admin.username, action, normalizedMac, null, req.ip);

    res.json({ message: `Dispositivo ${newActive ? 'habilitado' : 'bloqueado'}`, active: newActive });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Erro ao alterar status do dispositivo' });
  } finally {
    conn.release();
  }
});

// ─── DELETE /api/devices/:mac ─────────────────────────────────
router.delete('/:mac', requirePermission('devices', 'delete'), async (req, res) => {
  const normalizedMac = normalizeMac(req.params.mac);
  if (!normalizedMac)
    return res.status(400).json({ error: 'MAC address inválido' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[existing]] = await conn.query('SELECT mac FROM device_profiles WHERE mac = ?', [normalizedMac]);
    if (!existing) {
      await conn.rollback();
      return res.status(404).json({ error: 'Dispositivo não encontrado' });
    }

    await conn.query('DELETE FROM radcheck WHERE username = ?', [normalizedMac]);
    await conn.query('DELETE FROM radreply WHERE username = ?', [normalizedMac]);
    await conn.query('DELETE FROM radusergroup WHERE username = ?', [normalizedMac]);
    await conn.query('DELETE FROM device_profiles WHERE mac = ?', [normalizedMac]);

    await conn.commit();
    await auditLog(pool, req.admin.username, 'DELETE_DEVICE', normalizedMac, null, req.ip);

    res.json({ message: 'Dispositivo removido com sucesso' });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Erro ao remover dispositivo' });
  } finally {
    conn.release();
  }
});

module.exports = router;
