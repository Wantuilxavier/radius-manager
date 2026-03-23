-- ============================================================
-- 006_add_export_permission.sql
-- Adiciona permissão "users.export" para admins existentes
-- que já possuem "users.view".
-- Idempotente: INSERT IGNORE não duplica registros.
-- ============================================================

-- Concede users.export para todos os admins que têm users.view
-- (exclui viewers — eles não têm view de users por padrão neste sistema,
--  mas a cláusula EXISTS garante que só admins que já têm view recebam export)
INSERT IGNORE INTO admin_permissions (admin_id, resource, action)
SELECT admin_id, 'users', 'export'
FROM admin_permissions
WHERE resource = 'users'
  AND action   = 'view'
  AND admin_id IN (
    SELECT id FROM admin_users WHERE role IN ('admin', 'superadmin')
  );

INSERT IGNORE INTO schema_migrations (version) VALUES ('006_add_export_permission');
