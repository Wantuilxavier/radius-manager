const jwt  = require('jsonwebtoken');
const { pool } = require('../db/connection');

// ─── Valida o JWT e popula req.admin ──────────────────────────
function authMiddleware(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }
  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

// ─── Exige role superadmin ────────────────────────────────────
function requireSuperAdmin(req, res, next) {
  if (req.admin.role !== 'superadmin') {
    return res.status(403).json({ error: 'Permissão insuficiente — requer superadmin' });
  }
  next();
}

// ─── Exige permissão granular (resource + action) ─────────────
// Superadmin sempre passa; outros consultam admin_permissions.
// Uso: router.post('/', requirePermission('users','create'), handler)
function requirePermission(resource, action) {
  return async (req, res, next) => {
    // superadmin bypassa todas as verificações
    if (req.admin?.role === 'superadmin') return next();

    try {
      const [[perm]] = await pool.query(
        `SELECT id FROM admin_permissions
         WHERE admin_id = ? AND resource = ? AND action = ?`,
        [req.admin.id, resource, action]
      );
      if (!perm) {
        return res.status(403).json({
          error: `Permissão negada — você não tem acesso a [${resource}:${action}]`,
        });
      }
      next();
    } catch (err) {
      console.error('Erro ao verificar permissões:', err);
      res.status(500).json({ error: 'Erro ao verificar permissões' });
    }
  };
}

module.exports = { authMiddleware, requireSuperAdmin, requirePermission };
