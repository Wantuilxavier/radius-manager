const router = require('express').Router();
const { pool } = require('../db/connection');
const { authMiddleware, requirePermission } = require('../middleware/auth');

router.use(authMiddleware);

// ─── Helpers ─────────────────────────────────────────────────
async function auditLog(pool, admin, action, targetType, targetName, details, ip) {
  await pool.query(
    'INSERT INTO audit_log (admin_user, action, target_type, target_name, details, ip_address) VALUES (?,?,?,?,?,?)',
    [admin, action, targetType, targetName, details ? JSON.stringify(details) : null, ip]
  );
}

async function getUserFull(username) {
  const [[profile]] = await pool.query(
    `SELECT up.*, vp.vlan_id, vp.color as vlan_color, rug.groupname,
            (SELECT value FROM radcheck WHERE username = up.username AND attribute = 'Simultaneous-Use' LIMIT 1) as simultaneous_use_raw
     FROM user_profiles up
     LEFT JOIN radusergroup rug ON rug.username = up.username
     LEFT JOIN vlan_profiles vp ON vp.groupname = rug.groupname
     WHERE up.username = ?`, [username]
  );
  return profile;
}

/**
 * Sincroniza o atributo Simultaneous-Use no radcheck.
 * value = null → remove o atributo (ilimitado)
 * value >= 1   → insere/atualiza com o número informado
 */
async function syncSimultaneousUse(conn, username, value) {
  await conn.query("DELETE FROM radcheck WHERE username = ? AND attribute = 'Simultaneous-Use'", [username]);
  if (value != null && parseInt(value) >= 1) {
    await conn.query(
      "INSERT INTO radcheck (username, attribute, op, value) VALUES (?, 'Simultaneous-Use', ':=', ?)",
      [username, String(parseInt(value))]
    );
  }
}

// Identifica o fabricante pelo OUI (3 primeiros octetos do MAC)
const OUI_MAP = {
  '00:50:56': 'VMware', '00:0c:29': 'VMware', '00:1a:11': 'Google',
  'b8:27:eb': 'Raspberry Pi', 'dc:a6:32': 'Raspberry Pi',
  'f4:5c:89': 'Apple', '3c:22:fb': 'Apple', 'a4:83:e7': 'Apple',
  '8c:85:90': 'Apple', '00:17:f2': 'Apple', 'ac:bc:32': 'Apple',
  '34:36:3b': 'Apple', '70:3e:ac': 'Apple', '60:f4:45': 'Apple',
  '08:66:98': 'Apple', 'b0:be:83': 'Apple', 'e8:d0:fc': 'Apple',
  '78:4f:43': 'Samsung', '00:12:47': 'Samsung', 'b0:72:bf': 'Samsung',
  'f4:42:8f': 'Samsung', '4c:bc:a5': 'Samsung', '00:26:37': 'Samsung',
  '18:67:b0': 'Xiaomi', '28:6c:07': 'Xiaomi', '64:b4:73': 'Xiaomi',
  'a4:c3:f0': 'Xiaomi', 'fc:64:ba': 'Xiaomi',
  '50:76:af': 'Ubiquiti', '24:a4:3c': 'Ubiquiti', '78:8a:20': 'Ubiquiti',
  '00:27:22': 'Ubiquiti', 'b4:fb:e4': 'Ubiquiti',
};

function macVendor(mac) {
  if (!mac) return null;
  const normalized = mac.toLowerCase().replace(/-/g, ':');
  const oui = normalized.substring(0, 8);
  return OUI_MAP[oui] || null;
}

function parseCalledStation(calledStationId) {
  if (!calledStationId) return { ap_mac: null, ssid: null };
  // Formato Unifi: "AA:BB:CC:DD:EE:FF:NomeSSID" ou "AA-BB-CC-DD-EE-FF:NomeSSID"
  const lastColon = calledStationId.lastIndexOf(':');
  if (lastColon > 0 && lastColon < calledStationId.length - 1) {
    // Verifica se antes do último ':' temos o padrão de MAC (>=14 chars)
    const possibleMac = calledStationId.substring(0, lastColon);
    if (possibleMac.length >= 11) {
      return {
        ap_mac: possibleMac,
        ssid: calledStationId.substring(lastColon + 1),
      };
    }
  }
  return { ap_mac: calledStationId, ssid: null };
}

// ─── GET /api/users ───────────────────────────────────────────────────────────
router.get('/', requirePermission('users', 'view'), async (req, res) => {
  try {
    const { search, group, active, department, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = ['1=1'];
    let params = [];

    if (search)     { where.push('(up.username LIKE ? OR up.full_name LIKE ? OR up.email LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    if (group)      { where.push('rug.groupname = ?'); params.push(group); }
    if (department) { where.push('up.department = ?'); params.push(department); }
    if (active !== undefined && active !== '') { where.push('up.active = ?'); params.push(parseInt(active)); }

    const whereStr = where.join(' AND ');

    const [rows] = await pool.query(
      `SELECT up.username, up.full_name, up.email, up.department, up.active,
              up.expires_at, up.created_at, up.created_by, up.simultaneous_connections,
              rug.groupname, vp.vlan_id, vp.color as vlan_color, vp.description as vlan_desc
       FROM user_profiles up
       LEFT JOIN radusergroup rug ON rug.username = up.username
       LEFT JOIN vlan_profiles vp ON vp.groupname = rug.groupname
       WHERE ${whereStr}
       ORDER BY up.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM user_profiles up
       LEFT JOIN radusergroup rug ON rug.username = up.username
       WHERE ${whereStr}`, params
    );

    res.json({ users: rows, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar usuários' });
  }
});

// ─── GET /api/users/:username ─────────────────────────────────────────────────
router.get('/:username', requirePermission('users', 'view'), async (req, res) => {
  try {
    const user = await getUserFull(req.params.username);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    const [sessions] = await pool.query(
      `SELECT acctstarttime, acctstoptime, acctsessiontime, framedipaddress,
              nasipaddress, callingstationid, calledstationid, connectinfo_start,
              acctterminatecause
       FROM radacct WHERE username = ?
       ORDER BY acctstarttime DESC LIMIT 10`, [req.params.username]
    );

    res.json({ ...user, sessions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ─── GET /api/users/:username/devices ────────────────────────────────────────
// Retorna os dispositivos atualmente conectados do usuário,
// enriquecidos com informações do Access Point Unifi via radacct + nas.
router.get('/:username/devices', requirePermission('users', 'view'), async (req, res) => {
  try {
    const { username } = req.params;

    const [user] = await pool.query('SELECT username FROM user_profiles WHERE username = ?', [username]);
    if (!user.length) return res.status(404).json({ error: 'Usuário não encontrado' });

    const [rows] = await pool.query(
      `SELECT
         ra.radacctid,
         ra.acctsessionid,
         ra.callingstationid   AS mac,
         ra.calledstationid    AS called_station,
         ra.nasipaddress       AS ap_ip,
         ra.framedipaddress    AS device_ip,
         ra.connectinfo_start  AS connection_type,
         ra.acctstarttime      AS connected_at,
         ra.acctupdatetime     AS last_seen,
         TIMESTAMPDIFF(SECOND, ra.acctstarttime, NOW()) AS session_seconds,
         n.shortname           AS ap_name,
         n.description         AS ap_description
       FROM radacct ra
       LEFT JOIN nas n ON n.nasname = ra.nasipaddress
       WHERE ra.username = ? AND ra.acctstoptime IS NULL
       ORDER BY ra.acctstarttime ASC`,
      [username]
    );

    const devices = rows.map(r => {
      const { ap_mac, ssid } = parseCalledStation(r.called_station);
      return {
        ...r,
        ap_mac,
        ssid,
        vendor: macVendor(r.mac),
      };
    });

    res.json({ devices, count: devices.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar dispositivos' });
  }
});

// ─── POST /api/users ──────────────────────────────────────────────────────────
router.post('/', requirePermission('users', 'create'), async (req, res) => {
  const { username, password, groupname, full_name, email, phone, department, notes, expires_at, simultaneous_connections } = req.body;

  if (!username || !password || !groupname)
    return res.status(400).json({ error: 'username, password e groupname são obrigatórios' });

  if (password.length < 6)
    return res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres' });

  const simConn = (simultaneous_connections != null && simultaneous_connections !== '') ? parseInt(simultaneous_connections) : null;
  if (simConn !== null && (isNaN(simConn) || simConn < 1 || simConn > 20))
    return res.status(400).json({ error: 'Conexões simultâneas deve ser entre 1 e 20, ou vazio para ilimitado' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[existing]] = await conn.query('SELECT username FROM user_profiles WHERE username = ?', [username]);
    if (existing) {
      await conn.rollback();
      return res.status(409).json({ error: 'Usuário já existe' });
    }

    const [[group]] = await conn.query('SELECT groupname FROM vlan_profiles WHERE groupname = ? AND active = 1', [groupname]);
    if (!group) {
      await conn.rollback();
      return res.status(400).json({ error: 'Grupo/VLAN não encontrado ou inativo' });
    }

    await conn.query(
      "INSERT INTO radcheck (username, attribute, op, value) VALUES (?, 'Cleartext-Password', ':=', ?)",
      [username, password]
    );
    await conn.query(
      'INSERT INTO radusergroup (username, groupname, priority) VALUES (?, ?, 1)',
      [username, groupname]
    );
    await conn.query(
      `INSERT INTO user_profiles (username, full_name, email, phone, department, notes, active, expires_at, created_by, simultaneous_connections)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      [username, full_name || null, email || null, phone || null, department || null, notes || null, expires_at || null, req.admin.username, simConn]
    );

    await syncSimultaneousUse(conn, username, simConn);

    await conn.commit();
    await auditLog(pool, req.admin.username, 'CREATE_USER', 'user', username, { groupname, simultaneous_connections: simConn }, req.ip);

    res.status(201).json({ message: 'Usuário criado com sucesso', username });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar usuário' });
  } finally {
    conn.release();
  }
});

// ─── PUT /api/users/:username ─────────────────────────────────────────────────
router.put('/:username', requirePermission('users', 'edit'), async (req, res) => {
  const { username } = req.params;
  const { password, groupname, full_name, email, phone, department, notes, expires_at, simultaneous_connections } = req.body;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[existing]] = await conn.query('SELECT username FROM user_profiles WHERE username = ?', [username]);
    if (!existing) {
      await conn.rollback();
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    if (password) {
      if (password.length < 6) { await conn.rollback(); return res.status(400).json({ error: 'Senha mínima: 6 caracteres' }); }
      await conn.query("UPDATE radcheck SET value = ? WHERE username = ? AND attribute = 'Cleartext-Password'", [password, username]);
    }

    if (groupname) {
      const [[group]] = await conn.query('SELECT groupname FROM vlan_profiles WHERE groupname = ? AND active = 1', [groupname]);
      if (!group) { await conn.rollback(); return res.status(400).json({ error: 'Grupo não encontrado' }); }
      await conn.query('DELETE FROM radusergroup WHERE username = ?', [username]);
      await conn.query('INSERT INTO radusergroup (username, groupname, priority) VALUES (?, ?, 1)', [username, groupname]);
    }

    // Simultaneous-Use: se o campo vier no body, sincroniza
    let simConn = undefined;
    if ('simultaneous_connections' in req.body) {
      simConn = (simultaneous_connections != null && simultaneous_connections !== '') ? parseInt(simultaneous_connections) : null;
      if (simConn !== null && (isNaN(simConn) || simConn < 1 || simConn > 20)) {
        await conn.rollback();
        return res.status(400).json({ error: 'Conexões simultâneas deve ser entre 1 e 20, ou vazio para ilimitado' });
      }
      await syncSimultaneousUse(conn, username, simConn);
      await conn.query(
        'UPDATE user_profiles SET full_name=?, email=?, phone=?, department=?, notes=?, expires_at=?, simultaneous_connections=? WHERE username=?',
        [full_name || null, email || null, phone || null, department || null, notes || null, expires_at || null, simConn, username]
      );
    } else {
      await conn.query(
        'UPDATE user_profiles SET full_name=?, email=?, phone=?, department=?, notes=?, expires_at=? WHERE username=?',
        [full_name || null, email || null, phone || null, department || null, notes || null, expires_at || null, username]
      );
    }

    await conn.commit();
    await auditLog(pool, req.admin.username, 'UPDATE_USER', 'user', username, { groupname, simultaneous_connections: simConn }, req.ip);
    res.json({ message: 'Usuário atualizado com sucesso' });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar usuário' });
  } finally {
    conn.release();
  }
});

// ─── PATCH /api/users/:username/toggle ───────────────────────────────────────
router.patch('/:username/toggle', requirePermission('users', 'toggle'), async (req, res) => {
  const { username } = req.params;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[user]] = await conn.query('SELECT active FROM user_profiles WHERE username = ?', [username]);
    if (!user) { await conn.rollback(); return res.status(404).json({ error: 'Usuário não encontrado' }); }

    const newActive = user.active ? 0 : 1;
    await conn.query('UPDATE user_profiles SET active = ? WHERE username = ?', [newActive, username]);

    if (newActive === 0) {
      await conn.query("DELETE FROM radcheck WHERE username = ? AND attribute = 'Auth-Type'", [username]);
      await conn.query("INSERT INTO radcheck (username, attribute, op, value) VALUES (?, 'Auth-Type', ':=', 'Reject')", [username]);
    } else {
      await conn.query("DELETE FROM radcheck WHERE username = ? AND attribute = 'Auth-Type'", [username]);
    }

    await conn.commit();
    const action = newActive ? 'ENABLE_USER' : 'DISABLE_USER';
    await auditLog(pool, req.admin.username, action, 'user', username, null, req.ip);
    res.json({ message: `Usuário ${newActive ? 'habilitado' : 'desabilitado'}`, active: newActive });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: 'Erro ao alterar status' });
  } finally {
    conn.release();
  }
});

// ─── DELETE /api/users/:username ─────────────────────────────────────────────
router.delete('/:username', requirePermission('users', 'delete'), async (req, res) => {
  const { username } = req.params;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM radcheck WHERE username = ?', [username]);
    await conn.query('DELETE FROM radreply WHERE username = ?', [username]);
    await conn.query('DELETE FROM radusergroup WHERE username = ?', [username]);
    await conn.query('DELETE FROM user_profiles WHERE username = ?', [username]);
    await conn.commit();
    await auditLog(pool, req.admin.username, 'DELETE_USER', 'user', username, null, req.ip);
    res.json({ message: 'Usuário removido com sucesso' });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: 'Erro ao remover usuário' });
  } finally {
    conn.release();
  }
});

module.exports = router;
