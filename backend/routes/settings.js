const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const { pool } = require('../db/connection');
const { authMiddleware, requireSuperAdmin } = require('../middleware/auth');

router.use(authMiddleware);

// ─── Recursos e ações disponíveis ────────────────────────────
const RESOURCES = ['dashboard', 'users', 'groups', 'nas', 'sessions', 'audit'];
const ACTIONS   = {
  dashboard: ['view'],
  users:     ['view', 'create', 'edit', 'delete', 'toggle'],
  groups:    ['view', 'create', 'edit', 'delete'],
  nas:       ['view', 'create', 'edit', 'delete'],
  sessions:  ['view'],
  audit:     ['view'],
};

// Permissões padrão por role (aplicadas ao criar novo admin)
const DEFAULT_PERMISSIONS = {
  admin: [
    { resource: 'dashboard', action: 'view'   },
    { resource: 'users',     action: 'view'   },
    { resource: 'users',     action: 'create' },
    { resource: 'users',     action: 'edit'   },
    { resource: 'users',     action: 'delete' },
    { resource: 'users',     action: 'toggle' },
    { resource: 'groups',    action: 'view'   },
    { resource: 'groups',    action: 'create' },
    { resource: 'groups',    action: 'edit'   },
    { resource: 'groups',    action: 'delete' },
    { resource: 'nas',       action: 'view'   },
    { resource: 'nas',       action: 'create' },
    { resource: 'nas',       action: 'edit'   },
    { resource: 'nas',       action: 'delete' },
    { resource: 'sessions',  action: 'view'   },
    { resource: 'audit',     action: 'view'   },
  ],
  viewer: [
    { resource: 'dashboard', action: 'view' },
    { resource: 'users',     action: 'view' },
    { resource: 'groups',    action: 'view' },
    { resource: 'nas',       action: 'view' },
    { resource: 'sessions',  action: 'view' },
    { resource: 'audit',     action: 'view' },
  ],
};

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
  if (!['superadmin', 'admin', 'viewer'].includes(role))
    return res.status(400).json({ error: 'Role inválida' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const hash = await bcrypt.hash(password, 12);
    const [result] = await conn.query(
      'INSERT INTO admin_users (username, password, full_name, email, role) VALUES (?,?,?,?,?)',
      [username, hash, full_name || null, email || null, role || 'admin']
    );
    const adminId = result.insertId;

    // Aplica permissões padrão para a role (superadmin não tem entradas)
    const defaults = DEFAULT_PERMISSIONS[role] || [];
    for (const p of defaults) {
      await conn.query(
        'INSERT IGNORE INTO admin_permissions (admin_id, resource, action) VALUES (?,?,?)',
        [adminId, p.resource, p.action]
      );
    }

    await conn.commit();
    res.status(201).json({ message: 'Administrador criado com sucesso', id: adminId });
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ error: 'Nome de usuário já existe' });
    res.status(500).json({ error: 'Erro ao criar administrador' });
  } finally {
    conn.release();
  }
});

// ─── PUT /api/settings/admins/:id ────────────────────────────
router.put('/admins/:id', requireSuperAdmin, async (req, res) => {
  const { full_name, email, role, password, active } = req.body;
  try {
    const [[existing]] = await pool.query('SELECT id FROM admin_users WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Admin não encontrado' });

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

// ─── GET /api/settings/admins/:id/permissions ────────────────
// Retorna permissões atuais do admin + mapa completo de recursos/ações
router.get('/admins/:id/permissions', requireSuperAdmin, async (req, res) => {
  try {
    const [[admin]] = await pool.query(
      'SELECT id, username, role FROM admin_users WHERE id = ?', [req.params.id]
    );
    if (!admin) return res.status(404).json({ error: 'Admin não encontrado' });

    const [rows] = await pool.query(
      'SELECT resource, action FROM admin_permissions WHERE admin_id = ?', [req.params.id]
    );

    // Monta objeto { resource: [actions] }
    const granted = {};
    rows.forEach(({ resource, action }) => {
      if (!granted[resource]) granted[resource] = [];
      granted[resource].push(action);
    });

    res.json({ admin, granted, available: ACTIONS });
  } catch {
    res.status(500).json({ error: 'Erro ao buscar permissões' });
  }
});

// ─── PUT /api/settings/admins/:id/permissions ────────────────
// Substitui TODAS as permissões do admin pelo array recebido
// Body: { permissions: [{ resource, action }] }
router.put('/admins/:id/permissions', requireSuperAdmin, async (req, res) => {
  const { permissions } = req.body;
  if (!Array.isArray(permissions))
    return res.status(400).json({ error: 'permissions deve ser um array' });

  // Valida cada entrada
  for (const p of permissions) {
    if (!RESOURCES.includes(p.resource) || !(ACTIONS[p.resource] || []).includes(p.action))
      return res.status(400).json({ error: `Permissão inválida: ${p.resource}:${p.action}` });
  }

  const [[admin]] = await pool.query('SELECT id, role FROM admin_users WHERE id = ?', [req.params.id]);
  if (!admin) return res.status(404).json({ error: 'Admin não encontrado' });
  if (admin.role === 'superadmin')
    return res.status(400).json({ error: 'Superadmin tem acesso total — não é necessário definir permissões' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // Remove todas as permissões atuais
    await conn.query('DELETE FROM admin_permissions WHERE admin_id = ?', [req.params.id]);
    // Insere as novas
    for (const p of permissions) {
      await conn.query(
        'INSERT INTO admin_permissions (admin_id, resource, action) VALUES (?,?,?)',
        [req.params.id, p.resource, p.action]
      );
    }
    await conn.commit();
    res.json({ message: `${permissions.length} permissão(ões) salva(s) com sucesso` });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: 'Erro ao salvar permissões' });
  } finally {
    conn.release();
  }
});

// ─── GET /api/settings/resources ─────────────────────────────
// Retorna o mapa de recursos/ações disponíveis (para o frontend)
router.get('/resources', async (req, res) => {
  res.json({ resources: RESOURCES, actions: ACTIONS });
});

module.exports = router;
