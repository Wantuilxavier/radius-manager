const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const { pool } = require('../db/connection');
const { authMiddleware, requireSuperAdmin, requirePermission } = require('../middleware/auth');

router.use(authMiddleware);

async function auditLog(admin, action, targetType, targetName, details, ip) {
  await pool.query(
    'INSERT INTO audit_log (admin_user, action, target_type, target_name, details, ip_address) VALUES (?,?,?,?,?,?)',
    [admin, action, targetType, targetName, details ? JSON.stringify(details) : null, ip]
  );
}

// ─── Recursos e ações disponíveis ────────────────────────────
const RESOURCES = ['dashboard', 'users', 'groups', 'nas', 'sessions', 'audit', 'departments', 'devices'];
const ACTIONS   = {
  dashboard:   ['view'],
  users:       ['view', 'create', 'edit', 'delete', 'toggle', 'export'],
  groups:      ['view', 'create', 'edit', 'delete'],
  nas:         ['view', 'create', 'edit', 'delete'],
  sessions:    ['view'],
  audit:       ['view'],
  departments: ['view', 'create', 'edit', 'delete'],
  devices:     ['view', 'create', 'edit', 'delete', 'toggle'],
};

// Permissões padrão por role (aplicadas ao criar novo admin)
const DEFAULT_PERMISSIONS = {
  admin: [
    { resource: 'dashboard',   action: 'view'   },
    { resource: 'users',       action: 'view'   },
    { resource: 'users',       action: 'create' },
    { resource: 'users',       action: 'edit'   },
    { resource: 'users',       action: 'delete' },
    { resource: 'users',       action: 'toggle' },
    { resource: 'users',       action: 'export' },
    { resource: 'groups',      action: 'view'   },
    { resource: 'groups',      action: 'create' },
    { resource: 'groups',      action: 'edit'   },
    { resource: 'groups',      action: 'delete' },
    { resource: 'nas',         action: 'view'   },
    { resource: 'nas',         action: 'create' },
    { resource: 'nas',         action: 'edit'   },
    { resource: 'nas',         action: 'delete' },
    { resource: 'sessions',    action: 'view'   },
    { resource: 'audit',       action: 'view'   },
    { resource: 'departments', action: 'view'   },
    { resource: 'departments', action: 'create' },
    { resource: 'departments', action: 'edit'   },
    { resource: 'departments', action: 'delete' },
    { resource: 'devices',     action: 'view'   },
    { resource: 'devices',     action: 'create' },
    { resource: 'devices',     action: 'edit'   },
    { resource: 'devices',     action: 'delete' },
    { resource: 'devices',     action: 'toggle' },
  ],
  viewer: [
    { resource: 'dashboard',   action: 'view' },
    { resource: 'users',       action: 'view' },
    { resource: 'groups',      action: 'view' },
    { resource: 'nas',         action: 'view' },
    { resource: 'sessions',    action: 'view' },
    { resource: 'audit',       action: 'view' },
    { resource: 'departments', action: 'view' },
    { resource: 'devices',     action: 'view' },
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
    await auditLog(req.admin.username, 'admin_create', 'admin', username, { role, full_name, email }, req.ip);
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
    const changed = updates.map(u => u.split('=')[0]);
    await auditLog(req.admin.username, 'admin_update', 'admin', req.params.id, { changed }, req.ip);
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
    const [[target]] = await pool.query('SELECT username FROM admin_users WHERE id = ?', [req.params.id]);
    if (!target) return res.status(404).json({ error: 'Admin não encontrado' });
    const [r] = await pool.query('DELETE FROM admin_users WHERE id = ?', [req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Admin não encontrado' });
    await auditLog(req.admin.username, 'admin_delete', 'admin', target.username, { id: req.params.id }, req.ip);
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
    await auditLog(req.admin.username, 'admin_permissions_update', 'admin', req.params.id, { count: permissions.length }, req.ip);
    res.json({ message: `${permissions.length} permissão(ões) salva(s) com sucesso` });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: 'Erro ao salvar permissões' });
  } finally {
    conn.release();
  }
});

// ─── GET /api/settings/resources ─────────────────────────────
router.get('/resources', async (req, res) => {
  res.json({ resources: RESOURCES, actions: ACTIONS });
});

// ─── GET /api/settings/default-vlan ──────────────────────────
// Retorna a configuração atual de VLAN padrão para usuários não cadastrados
router.get('/default-vlan', requireSuperAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT `key`, `value` FROM system_settings WHERE `key` IN ('default_vlan_enabled','default_vlan_group')"
    );
    const settings = Object.fromEntries(rows.map(r => [r.key, r.value]));
    res.json({
      enabled: settings['default_vlan_enabled'] === '1',
      group:   settings['default_vlan_group'] || null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar configuração de VLAN padrão' });
  }
});

// ─── PUT /api/settings/default-vlan ──────────────────────────
// Ativa/desativa VLAN padrão e sincroniza entradas DEFAULT no FreeRADIUS
router.put('/default-vlan', requireSuperAdmin, async (req, res) => {
  const { enabled, group } = req.body;

  if (enabled && !group)
    return res.status(400).json({ error: 'Selecione um grupo/VLAN para a política padrão' });

  if (enabled) {
    const [[grp]] = await pool.query(
      'SELECT groupname FROM vlan_profiles WHERE groupname = ? AND active = 1', [group]
    );
    if (!grp)
      return res.status(400).json({ error: 'Grupo não encontrado ou inativo' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Persiste configuração
    await conn.query(
      "INSERT INTO system_settings (`key`,`value`) VALUES ('default_vlan_enabled',?) ON DUPLICATE KEY UPDATE `value`=?",
      [enabled ? '1' : '0', enabled ? '1' : '0']
    );
    await conn.query(
      "INSERT INTO system_settings (`key`,`value`) VALUES ('default_vlan_group',?) ON DUPLICATE KEY UPDATE `value`=?",
      [group || null, group || null]
    );

    // Remove entradas DEFAULT anteriores do FreeRADIUS
    await conn.query("DELETE FROM radcheck WHERE username = 'DEFAULT'");
    await conn.query("DELETE FROM radusergroup WHERE username = 'DEFAULT'");

    // Se habilitado, insere novas entradas DEFAULT
    if (enabled) {
      await conn.query(
        "INSERT INTO radcheck (username, attribute, op, value) VALUES ('DEFAULT', 'Auth-Type', ':=', 'Accept')"
      );
      await conn.query(
        "INSERT INTO radusergroup (username, groupname, priority) VALUES ('DEFAULT', ?, 1)", [group]
      );
    }

    await conn.commit();
    await auditLog(req.admin.username, 'default_vlan_update', 'settings', 'default_vlan', { enabled, group }, req.ip);
    res.json({
      message: enabled
        ? `VLAN padrão ativada: usuários não cadastrados entrarão no grupo "${group}"`
        : 'VLAN padrão desativada: apenas usuários cadastrados poderão autenticar',
    });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Erro ao salvar configuração de VLAN padrão' });
  } finally {
    conn.release();
  }
});

// ─── GET /api/users/export ────────────────────────────────────
// Retorna todos os usuários (sem paginação) respeitando os filtros,
// para uso exclusivo na geração do PDF no frontend.
router.get('/users-export', requirePermission('users', 'export'), async (req, res) => {

  try {
    const { search, group, active, department, include_password } = req.query;
    const withPasswords = include_password === '1';

    let where = ['1=1'];
    let params = [];

    if (search) {
      where.push('(up.username LIKE ? OR up.full_name LIKE ? OR up.email LIKE ? OR up.department LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (group)      { where.push('rug.groupname = ?'); params.push(group); }
    if (department) { where.push('up.department = ?'); params.push(department); }
    if (active !== undefined && active !== '') { where.push('up.active = ?'); params.push(parseInt(active)); }

    const passwordJoin = withPasswords
      ? `LEFT JOIN radcheck rc ON rc.username = up.username AND rc.attribute = 'Cleartext-Password'`
      : '';
    const passwordSelect = withPasswords ? ', rc.value AS password' : '';

    const [rows] = await pool.query(
      `SELECT up.username, up.full_name, up.email, up.phone, up.department,
              up.active, up.expires_at, up.simultaneous_connections,
              up.created_at, up.created_by,
              rug.groupname, vp.vlan_id, vp.color AS vlan_color
              ${passwordSelect}
       FROM user_profiles up
       LEFT JOIN radusergroup rug ON rug.username = up.username
       LEFT JOIN vlan_profiles vp ON vp.groupname = rug.groupname
       ${passwordJoin}
       WHERE ${where.join(' AND ')}
       ORDER BY up.created_at DESC`,
      params
    );

    await auditLog(req.admin.username, 'users_export', 'users', null, { total: rows.length, with_passwords: withPasswords, filters: { search, group, active, department } }, req.ip);
    res.json({ users: rows, total: rows.length, exported_at: new Date().toISOString() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao exportar usuários' });
  }
});

module.exports = router;
