const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const { pool } = require('../db/connection');
const { authMiddleware, requireSuperAdmin } = require('../middleware/auth');

router.use(authMiddleware);

// ─── GET /api/settings/admins ─────────────────────────────────
router.get('/admins', requireSuperAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, username, full_name, email, role, active, last_login, created_at FROM admin_users ORDER BY created_at'
    );
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Erro ao buscar administradores' });
  }
});

// ─── POST /api/settings/admins ────────────────────────────────
router.post('/admins', requireSuperAdmin, async (req, res) => {
  const { username, password, full_name, email, role } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
  if (password.length < 8)
    return res.status(400).json({ error: 'Senha deve ter no mínimo 8 caracteres' });
  if (!['superadmin','admin','viewer'].includes(role))
    return res.status(400).json({ error: 'Role inválida' });

  try {
    const hash = await bcrypt.hash(password, 12);
    await pool.query(
      'INSERT INTO admin_users (username, password, full_name, email, role) VALUES (?,?,?,?,?)',
      [username, hash, full_name || null, email || null, role || 'admin']
    );
    res.status(201).json({ message: 'Administrador criado com sucesso' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ error: 'Nome de usuário já existe' });
    res.status(500).json({ error: 'Erro ao criar administrador' });
  }
});

// ─── PUT /api/settings/admins/:id ────────────────────────────
router.put('/admins/:id', requireSuperAdmin, async (req, res) => {
  const { full_name, email, role, password, active } = req.body;
  try {
    const [[existing]] = await pool.query('SELECT id FROM admin_users WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Admin não encontrado' });

    // Impede que o superadmin remova sua própria role/acesso
    if (String(req.admin.id) === String(req.params.id) && active === 0)
      return res.status(400).json({ error: 'Você não pode desativar sua própria conta' });

    const updates = [];
    const values  = [];

    if (full_name !== undefined) { updates.push('full_name=?'); values.push(full_name || null); }
    if (email     !== undefined) { updates.push('email=?');     values.push(email || null); }
    if (role      !== undefined) { updates.push('role=?');      values.push(role); }
    if (active    !== undefined) { updates.push('active=?');    values.push(active ? 1 : 0); }
    if (password) {
      if (password.length < 8)
        return res.status(400).json({ error: 'Senha deve ter no mínimo 8 caracteres' });
      const hash = await bcrypt.hash(password, 12);
      updates.push('password=?'); values.push(hash);
    }

    if (!updates.length)
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });

    values.push(req.params.id);
    await pool.query(`UPDATE admin_users SET ${updates.join(',')} WHERE id=?`, values);
    res.json({ message: 'Administrador atualizado com sucesso' });
  } catch {
    res.status(500).json({ error: 'Erro ao atualizar administrador' });
  }
});

// ─── DELETE /api/settings/admins/:id ─────────────────────────
router.delete('/admins/:id', requireSuperAdmin, async (req, res) => {
  if (String(req.admin.id) === String(req.params.id))
    return res.status(400).json({ error: 'Você não pode remover sua própria conta' });
  try {
    const [r] = await pool.query('DELETE FROM admin_users WHERE id = ?', [req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Admin não encontrado' });
    res.json({ message: 'Administrador removido' });
  } catch {
    res.status(500).json({ error: 'Erro ao remover administrador' });
  }
});

module.exports = router;
