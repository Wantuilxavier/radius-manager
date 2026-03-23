const router = require('express').Router();
const bcrypt = require('bcryptjs');
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
    `SELECT up.*, vp.vlan_id, vp.color as vlan_color, rug.groupname
     FROM user_profiles up
     LEFT JOIN radusergroup rug ON rug.username = up.username
     LEFT JOIN vlan_profiles vp ON vp.groupname = rug.groupname
     WHERE up.username = ?`, [username]
  );
  return profile;
}

// ─── GET /api/users ───────────────────────────────────────────
router.get('/', requirePermission('users', 'view'), async (req, res) => {
  try {
    const { search, group, active, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = ['1=1'];
    let params = [];

    if (search) { where.push('(up.username LIKE ? OR up.full_name LIKE ? OR up.email LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    if (group)  { where.push('rug.groupname = ?'); params.push(group); }
    if (active !== undefined && active !== '') { where.push('up.active = ?'); params.push(parseInt(active)); }

    const whereStr = where.join(' AND ');

    const [rows] = await pool.query(
      `SELECT up.username, up.full_name, up.email, up.department, up.active,
              up.expires_at, up.created_at, up.created_by,
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

// ─── GET /api/users/:username ─────────────────────────────────
router.get('/:username', requirePermission('users', 'view'), async (req, res) => {
  try {
    const user = await getUserFull(req.params.username);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    const [sessions] = await pool.query(
      `SELECT acctstarttime, acctstoptime, acctsessiontime, framedipaddress,
              nasipaddress, callingstationid, acctterminatecause
       FROM radacct WHERE username = ?
       ORDER BY acctstarttime DESC LIMIT 10`, [req.params.username]
    );

    res.json({ ...user, sessions });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ─── POST /api/users ──────────────────────────────────────────
router.post('/', requirePermission('users', 'create'), async (req, res) => {
  const { username, password, groupname, full_name, email, phone, department, notes, expires_at } = req.body;

  if (!username || !password || !groupname)
    return res.status(400).json({ error: 'username, password e groupname são obrigatórios' });

  if (password.length < 6)
    return res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres' });

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
      `INSERT INTO user_profiles (username, full_name, email, phone, department, notes, active, expires_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [username, full_name || null, email || null, phone || null, department || null, notes || null, expires_at || null, req.admin.username]
    );

    await conn.commit();
    await auditLog(pool, req.admin.username, 'CREATE_USER', 'user', username, { groupname }, req.ip);

    res.status(201).json({ message: 'Usuário criado com sucesso', username });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar usuário' });
  } finally {
    conn.release();
  }
});

// ─── PUT /api/users/:username ─────────────────────────────────
router.put('/:username', requirePermission('users', 'edit'), async (req, res) => {
  const { username } = req.params;
  const { password, groupname, full_name, email, phone, department, notes, expires_at } = req.body;

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

    await conn.query(
      `UPDATE user_profiles SET full_name=?, email=?, phone=?, department=?, notes=?, expires_at=? WHERE username=?`,
      [full_name || null, email || null, phone || null, department || null, notes || null, expires_at || null, username]
    );

    await conn.commit();
    await auditLog(pool, req.admin.username, 'UPDATE_USER', 'user', username, { groupname }, req.ip);
    res.json({ message: 'Usuário atualizado com sucesso' });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: 'Erro ao atualizar usuário' });
  } finally {
    conn.release();
  }
});

// ─── PATCH /api/users/:username/toggle ───────────────────────
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

// ─── DELETE /api/users/:username ─────────────────────────────
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
