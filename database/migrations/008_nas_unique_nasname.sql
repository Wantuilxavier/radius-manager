-- Migration 008: Adiciona constraint UNIQUE em nas.nasname
-- Garante que não seja possível cadastrar dois NAS com o mesmo IP/hostname.
-- A aplicação já tratava ER_DUP_ENTRY, mas o banco não enforçava a unicidade.

-- Remove o índice simples e cria como UNIQUE (idempotente)
ALTER TABLE nas DROP INDEX nasname;
ALTER TABLE nas ADD UNIQUE KEY nasname (nasname);
