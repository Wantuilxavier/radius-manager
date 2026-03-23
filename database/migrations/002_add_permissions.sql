-- ============================================================
-- Migration 002 — Sistema de Permissões Granulares
-- Idempotente: verifica schema_migrations antes de executar.
-- Para aplicar manualmente:
--   mariadb -u root radius < database/migrations/002_add_permissions.sql
-- ============================================================
USE radius;

-- Garante que a tabela de controle exista (caso esta migration seja
-- aplicada em um banco anterior à introdução do schema_migrations)
CREATE TABLE IF NOT EXISTS schema_migrations (
    version     VARCHAR(64) NOT NULL,
    applied_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (version)
);

-- Só executa se ainda não foi aplicada
SET @already_applied = (SELECT COUNT(*) FROM schema_migrations WHERE version = '002_add_permissions');

-- Cria tabela de permissões
CREATE TABLE IF NOT EXISTS admin_permissions (
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    admin_id   INT UNSIGNED NOT NULL,
    resource   VARCHAR(32) NOT NULL,
    action     VARCHAR(16) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_perm (admin_id, resource, action),
    CONSTRAINT fk_perm_admin
        FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE CASCADE
);

-- Permissões padrão para admins do tipo 'admin'
INSERT IGNORE INTO admin_permissions (admin_id, resource, action)
SELECT a.id, r.resource, r.action
FROM admin_users a
CROSS JOIN (
  SELECT 'dashboard' AS resource, 'view'   AS action UNION ALL
  SELECT 'users',    'view'    UNION ALL
  SELECT 'users',    'create'  UNION ALL
  SELECT 'users',    'edit'    UNION ALL
  SELECT 'users',    'delete'  UNION ALL
  SELECT 'users',    'toggle'  UNION ALL
  SELECT 'groups',   'view'    UNION ALL
  SELECT 'groups',   'create'  UNION ALL
  SELECT 'groups',   'edit'    UNION ALL
  SELECT 'groups',   'delete'  UNION ALL
  SELECT 'nas',      'view'    UNION ALL
  SELECT 'nas',      'create'  UNION ALL
  SELECT 'nas',      'edit'    UNION ALL
  SELECT 'nas',      'delete'  UNION ALL
  SELECT 'sessions', 'view'    UNION ALL
  SELECT 'audit',    'view'
) r
WHERE a.role = 'admin';

-- Permissão de visualização para viewers
INSERT IGNORE INTO admin_permissions (admin_id, resource, action)
SELECT a.id, r.resource, 'view'
FROM admin_users a
CROSS JOIN (
  SELECT 'dashboard' AS resource UNION ALL
  SELECT 'users'    UNION ALL
  SELECT 'groups'   UNION ALL
  SELECT 'nas'      UNION ALL
  SELECT 'sessions' UNION ALL
  SELECT 'audit'
) r
WHERE a.role = 'viewer';

-- Registra como aplicada
INSERT IGNORE INTO schema_migrations (version) VALUES ('002_add_permissions');
