const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { pool } = require('../db/connection');
const { authMiddleware } = require('../middleware/auth');

// ─── Helper: busca permissões do admin no banco ───────────────
async function fetchPermissions(adminId, role) {
  if (role === 'superadmin') return null; // superadmin não precisa de mapa — bypass total

  const [rows] = await pool.query(
    'SELECT resource, action FROM admin_permissions WHERE admin_id = ?',
    [adminId]
  );
  const perms = {};
  rows.forEach(({ resource, action }) => {
    if (!perms[resource]) perms[resource] = [];
    perms[resource].push(action);
  });
  return perms;
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });

  try {
    const [rows] = await pool.query(
      'SELECT * FROM admin_users WHERE username = ? AND active = 1', [username]
    );
    if (!rows.length)
      return res.status(401).json({ error: 'Credenciais inválidas' });

    const admin = rows[0];
    const valid = await bcrypt.compare(password, admin.password);
    if (!valid)
      return res.status(401).json({ error: 'Credenciais inválidas' });

    await pool.query('UPDATE admin_users SET last_login = NOW() WHERE id = ?', [admin.id]);

    const token = jwt.sign(
      { id: admin.id, username: admin.username, role: admin.role, full_name: admin.full_name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    const permissions = await fetchPermissions(admin.id, admin.role);

    res.json({
      token,
      user: {
        id:        admin.id,
        username:  admin.username,
        full_name: admin.full_name,
        role:      admin.role,
      },
      permissions, // null para superadmin; objeto { resource: [actions] } para os demais
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const [[admin]] = await pool.query(
      'SELECT id, username, full_name, role, active FROM admin_users WHERE id = ?',
      [req.admin.id]
    );
    if (!admin || !admin.active)
      return res.status(401).json({ error: 'Conta inativa' });

    const permissions = await fetchPermissions(admin.id, admin.role);
    res.json({ user: admin, permissions });
  } catch {
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /api/auth/change-password
router.post('/change-password', authMiddleware, async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password || new_password.length < 8)
    return res.status(400).json({ error: 'Senha nova deve ter no mínimo 8 caracteres' });

  try {
    const [rows] = await pool.query('SELECT password FROM admin_users WHERE id = ?', [req.admin.id]);
    const valid = await bcrypt.compare(current_password, rows[0].password);
    if (!valid) return res.status(401).json({ error: 'Senha atual incorreta' });

    const hash = await bcrypt.hash(new_password, 12);
    await pool.query('UPDATE admin_users SET password = ? WHERE id = ?', [hash, req.admin.id]);
    res.json({ message: 'Senha alterada com sucesso' });
  } catch {
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
