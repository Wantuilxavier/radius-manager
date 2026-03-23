-- ============================================================
-- Migration 003 — Conexões simultâneas por usuário
-- Idempotente: usa ADD COLUMN IF NOT EXISTS (MariaDB 10.3+).
-- Para aplicar manualmente em instalações existentes:
--   mariadb -u root radius < database/migrations/003_simultaneous_connections.sql
-- ============================================================
USE radius;

-- Garante que a tabela de controle exista
CREATE TABLE IF NOT EXISTS schema_migrations (
    version     VARCHAR(64) NOT NULL,
    applied_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (version)
);

-- Adiciona a coluna (sem erro se já existir)
ALTER TABLE user_profiles
    ADD COLUMN IF NOT EXISTS simultaneous_connections TINYINT UNSIGNED DEFAULT NULL
    COMMENT 'NULL = ilimitado. Sincronizado com radcheck.Simultaneous-Use pelo Radius Manager';

-- Registra como aplicada
INSERT IGNORE INTO schema_migrations (version) VALUES ('003_simultaneous_connections');
