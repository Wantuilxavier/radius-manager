-- ============================================================
-- Migration 005 — Tabela de Configurações do Sistema
-- Armazena configurações globais como VLAN padrão para
-- usuários não cadastrados.
-- Idempotente.
-- ============================================================
USE radius;

CREATE TABLE IF NOT EXISTS schema_migrations (
    version     VARCHAR(64) NOT NULL,
    applied_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (version)
);

CREATE TABLE IF NOT EXISTS system_settings (
    `key`       VARCHAR(64) NOT NULL,
    `value`     TEXT DEFAULT NULL,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`key`)
);

-- Valores padrão
INSERT IGNORE INTO system_settings (`key`, `value`) VALUES
('default_vlan_enabled', '0'),
('default_vlan_group',   NULL);

INSERT IGNORE INTO schema_migrations (version) VALUES ('005_add_system_settings');
