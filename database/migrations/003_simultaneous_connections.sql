-- ============================================================
-- Migration 003: Conexões simultâneas por usuário
-- ============================================================
-- Adiciona coluna simultaneous_connections em user_profiles.
-- NULL = ilimitado | 1..N = limite de dispositivos simultâneos
-- O FreeRADIUS usa o atributo "Simultaneous-Use" em radcheck
-- para impor o limite nativamente.
-- ============================================================

USE radius;

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS simultaneous_connections TINYINT UNSIGNED DEFAULT NULL
  COMMENT 'Limite de conexões simultâneas (NULL = ilimitado). Sincronizado com radcheck.Simultaneous-Use';
