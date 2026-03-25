-- Migration 008: Adiciona constraint UNIQUE em nas.nasname
-- Garante que não seja possível cadastrar dois NAS com o mesmo IP/hostname.
-- A aplicação já tratava ER_DUP_ENTRY, mas o banco não enforçava a unicidade.
--
-- Idempotente: DROP IF EXISTS evita erro se o índice não existe ou já é UNIQUE.
-- Compatível com MariaDB 10.1.4+.

ALTER TABLE nas DROP INDEX IF EXISTS nasname;
ALTER TABLE nas ADD UNIQUE KEY nasname (nasname);
