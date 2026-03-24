-- ============================================================
-- 007_add_device_profiles.sql
-- Cria tabela device_profiles para cadastro de dispositivos
-- por MAC Address via MAC Authentication Bypass (MAB).
-- ============================================================

CREATE TABLE IF NOT EXISTS device_profiles (
    mac          VARCHAR(17)  NOT NULL,            -- formato aa:bb:cc:dd:ee:ff
    alias        VARCHAR(64),                      -- nome amigável (ex: "Impressora RH")
    device_type  VARCHAR(32)  NOT NULL DEFAULT 'other',
    description  VARCHAR(200),
    active       TINYINT(1)   NOT NULL DEFAULT 1,
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by   VARCHAR(64),
    PRIMARY KEY (mac)
);

-- Concede permissões de devices para admins que já têm 'nas.view'
INSERT IGNORE INTO admin_permissions (admin_id, resource, action)
SELECT admin_id, 'devices', 'view'
FROM admin_permissions
WHERE resource = 'nas' AND action = 'view'
  AND admin_id IN (SELECT id FROM admin_users WHERE role IN ('admin', 'superadmin'));

INSERT IGNORE INTO admin_permissions (admin_id, resource, action)
SELECT admin_id, 'devices', 'create'
FROM admin_permissions
WHERE resource = 'nas' AND action = 'create'
  AND admin_id IN (SELECT id FROM admin_users WHERE role = 'admin');

INSERT IGNORE INTO admin_permissions (admin_id, resource, action)
SELECT admin_id, 'devices', 'edit'
FROM admin_permissions
WHERE resource = 'nas' AND action = 'edit'
  AND admin_id IN (SELECT id FROM admin_users WHERE role = 'admin');

INSERT IGNORE INTO admin_permissions (admin_id, resource, action)
SELECT admin_id, 'devices', 'delete'
FROM admin_permissions
WHERE resource = 'nas' AND action = 'delete'
  AND admin_id IN (SELECT id FROM admin_users WHERE role = 'admin');

INSERT IGNORE INTO admin_permissions (admin_id, resource, action)
SELECT admin_id, 'devices', 'toggle'
FROM admin_permissions
WHERE resource = 'nas' AND action = 'edit'
  AND admin_id IN (SELECT id FROM admin_users WHERE role = 'admin');

-- Viewers recebem somente view
INSERT IGNORE INTO admin_permissions (admin_id, resource, action)
SELECT admin_id, 'devices', 'view'
FROM admin_permissions
WHERE resource = 'nas' AND action = 'view'
  AND admin_id IN (SELECT id FROM admin_users WHERE role = 'viewer');

INSERT IGNORE INTO schema_migrations (version) VALUES ('007_add_device_profiles');
