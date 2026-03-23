-- ============================================================
-- Migration 004 — Tabela de Departamentos
-- Permite padronizar os departamentos dos usuários RADIUS.
-- Idempotente: usa CREATE TABLE IF NOT EXISTS.
-- ============================================================
USE radius;

CREATE TABLE IF NOT EXISTS schema_migrations (
    version     VARCHAR(64) NOT NULL,
    applied_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (version)
);

CREATE TABLE IF NOT EXISTS departments (
    id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name        VARCHAR(128) NOT NULL,
    description VARCHAR(255) DEFAULT NULL,
    active      TINYINT(1) NOT NULL DEFAULT 1,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY name (name)
);

INSERT IGNORE INTO schema_migrations (version) VALUES ('004_add_departments');
