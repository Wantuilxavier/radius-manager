-- Migration 008: Adiciona constraint UNIQUE em nas.nasname
-- Garante que não seja possível cadastrar dois NAS com o mesmo IP/hostname.
-- A aplicação já tratava ER_DUP_ENTRY, mas o banco não enforçava a unicidade.
--
-- Passo 1: Remove duplicatas mantendo apenas o registro de menor id por nasname.
-- Passo 2: Substitui o índice simples por UNIQUE (idempotente via IF EXISTS).

DELETE n1 FROM nas n1
INNER JOIN nas n2 ON n2.nasname = n1.nasname AND n2.id < n1.id;

ALTER TABLE nas DROP INDEX IF EXISTS nasname;
ALTER TABLE nas ADD UNIQUE KEY nasname (nasname);
