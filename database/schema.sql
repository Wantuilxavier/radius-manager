-- ============================================================
-- FreeRADIUS + RadiusManager — Schema completo para MariaDB
-- Versão: consolidada (inclui todas as features até migration 003)
-- ============================================================

CREATE DATABASE IF NOT EXISTS radius CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE radius;

-- ============================================================
-- CONTROLE DE MIGRATIONS
-- Registra quais migrations já foram aplicadas no banco.
-- O update.sh verifica esta tabela antes de aplicar qualquer
-- arquivo de migration, tornando o processo idempotente.
-- ============================================================
CREATE TABLE IF NOT EXISTS schema_migrations (
    version     VARCHAR(64) NOT NULL,
    applied_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (version)
);

-- ============================================================
-- TABELAS NATIVAS DO FREERADIUS
-- ============================================================

-- Atributos de autenticação dos usuários
-- Exemplos de atributos: Cleartext-Password, Auth-Type, Simultaneous-Use
CREATE TABLE IF NOT EXISTS radcheck (
    id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    username    VARCHAR(64) NOT NULL DEFAULT '',
    attribute   VARCHAR(64) NOT NULL DEFAULT '',
    op          CHAR(2) NOT NULL DEFAULT '==',
    value       VARCHAR(253) NOT NULL DEFAULT '',
    PRIMARY KEY (id),
    KEY username (username(32))
);

-- Atributos de resposta por usuário (ex.: endereço IP fixo)
CREATE TABLE IF NOT EXISTS radreply (
    id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    username    VARCHAR(64) NOT NULL DEFAULT '',
    attribute   VARCHAR(64) NOT NULL DEFAULT '',
    op          CHAR(2) NOT NULL DEFAULT '=',
    value       VARCHAR(253) NOT NULL DEFAULT '',
    PRIMARY KEY (id),
    KEY username (username(32))
);

-- Associação usuário ↔ grupo
CREATE TABLE IF NOT EXISTS radusergroup (
    username    VARCHAR(64) NOT NULL DEFAULT '',
    groupname   VARCHAR(64) NOT NULL DEFAULT '',
    priority    INT NOT NULL DEFAULT 1,
    KEY username (username(32))
);

-- Atributos de check por grupo
CREATE TABLE IF NOT EXISTS radgroupcheck (
    id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    groupname   VARCHAR(64) NOT NULL DEFAULT '',
    attribute   VARCHAR(64) NOT NULL DEFAULT '',
    op          CHAR(2) NOT NULL DEFAULT '==',
    value       VARCHAR(253) NOT NULL DEFAULT '',
    PRIMARY KEY (id),
    KEY groupname (groupname(32))
);

-- Atributos de reply por grupo (VLAN 802.1Q, etc.)
CREATE TABLE IF NOT EXISTS radgroupreply (
    id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    groupname   VARCHAR(64) NOT NULL DEFAULT '',
    attribute   VARCHAR(64) NOT NULL DEFAULT '',
    op          CHAR(2) NOT NULL DEFAULT '=',
    value       VARCHAR(253) NOT NULL DEFAULT '',
    PRIMARY KEY (id),
    KEY groupname (groupname(32))
);

-- Accounting: registra cada sessão de conexão dos usuários
-- O campo calledstationid guarda AP-MAC:SSID nos Access Points Unifi
CREATE TABLE IF NOT EXISTS radacct (
    radacctid           BIGINT NOT NULL AUTO_INCREMENT,
    acctsessionid       VARCHAR(64) NOT NULL DEFAULT '',
    acctuniqueid        VARCHAR(32) NOT NULL DEFAULT '',
    username            VARCHAR(64) NOT NULL DEFAULT '',
    realm               VARCHAR(64) DEFAULT '',
    nasipaddress        VARCHAR(15) NOT NULL DEFAULT '',
    nasportid           VARCHAR(15) DEFAULT NULL,
    nasporttype         VARCHAR(32) DEFAULT NULL,
    acctstarttime       DATETIME DEFAULT NULL,
    acctupdatetime      DATETIME DEFAULT NULL,
    acctstoptime        DATETIME DEFAULT NULL,
    acctinterval        INT DEFAULT NULL,
    acctsessiontime     INT UNSIGNED DEFAULT NULL,
    acctauthentic       VARCHAR(32) DEFAULT NULL,
    connectinfo_start   VARCHAR(50) DEFAULT NULL,
    connectinfo_stop    VARCHAR(50) DEFAULT NULL,
    acctinputoctets     BIGINT DEFAULT NULL,
    acctoutputoctets    BIGINT DEFAULT NULL,
    calledstationid     VARCHAR(50) NOT NULL DEFAULT '',
    callingstationid    VARCHAR(50) NOT NULL DEFAULT '',
    acctterminatecause  VARCHAR(32) NOT NULL DEFAULT '',
    servicetype         VARCHAR(32) DEFAULT NULL,
    framedprotocol      VARCHAR(32) DEFAULT NULL,
    framedipaddress     VARCHAR(15) NOT NULL DEFAULT '',
    PRIMARY KEY (radacctid),
    UNIQUE KEY acctuniqueid (acctuniqueid),
    KEY username (username),
    KEY acctsessionid (acctsessionid),
    KEY acctstarttime (acctstarttime),
    KEY acctstoptime (acctstoptime),
    KEY nasipaddress (nasipaddress)
);

-- NAS / Access Points que se comunicam com o FreeRADIUS
CREATE TABLE IF NOT EXISTS nas (
    id          INT NOT NULL AUTO_INCREMENT,
    nasname     VARCHAR(128) NOT NULL,
    shortname   VARCHAR(32),
    type        VARCHAR(30) DEFAULT 'other',
    ports       INT,
    secret      VARCHAR(60) NOT NULL DEFAULT 'secret',
    server      VARCHAR(64),
    community   VARCHAR(50),
    description VARCHAR(200),
    PRIMARY KEY (id),
    KEY nasname (nasname)
);

-- Log de autenticações (necessário para a seção post-auth do FreeRADIUS)
CREATE TABLE IF NOT EXISTS radpostauth (
    id          BIGINT NOT NULL AUTO_INCREMENT,
    username    VARCHAR(64) NOT NULL DEFAULT '',
    pass        VARCHAR(64) NOT NULL DEFAULT '',
    reply       VARCHAR(32) NOT NULL DEFAULT '',
    authdate    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY username (username),
    KEY authdate (authdate)
);

-- ============================================================
-- TABELAS CUSTOMIZADAS DO RADIUS MANAGER
-- ============================================================

-- Administradores do painel web (separados dos usuários RADIUS)
CREATE TABLE IF NOT EXISTS admin_users (
    id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    username    VARCHAR(64) NOT NULL,
    password    VARCHAR(255) NOT NULL,  -- bcrypt hash
    full_name   VARCHAR(128),
    email       VARCHAR(128),
    role        ENUM('superadmin','admin','viewer') NOT NULL DEFAULT 'admin',
    active      TINYINT(1) NOT NULL DEFAULT 1,
    last_login  DATETIME DEFAULT NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY username (username)
);

-- Permissões granulares por administrador
-- superadmin ignora esta tabela (tem acesso total)
CREATE TABLE IF NOT EXISTS admin_permissions (
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    admin_id   INT UNSIGNED NOT NULL,
    resource   VARCHAR(32) NOT NULL,   -- dashboard, users, groups, nas, sessions, audit
    action     VARCHAR(16) NOT NULL,   -- view, create, edit, delete, toggle
    PRIMARY KEY (id),
    UNIQUE KEY uniq_perm (admin_id, resource, action),
    CONSTRAINT fk_perm_admin
        FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE CASCADE
);

-- Perfis de VLAN por grupo (metadados para UI e para o FreeRADIUS)
CREATE TABLE IF NOT EXISTS vlan_profiles (
    id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    groupname   VARCHAR(64) NOT NULL,
    vlan_id     SMALLINT UNSIGNED NOT NULL,
    description VARCHAR(200),
    color       VARCHAR(7) DEFAULT '#6366f1',
    active      TINYINT(1) NOT NULL DEFAULT 1,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY groupname (groupname),
    UNIQUE KEY vlan_id (vlan_id)
);

-- Perfis estendidos dos usuários RADIUS
-- simultaneous_connections: NULL = ilimitado | 1..N = máximo de sessões ativas
-- O FreeRADIUS usa o atributo "Simultaneous-Use" em radcheck para o enforcement.
-- O Radius Manager mantém os dois sincronizados automaticamente.
CREATE TABLE IF NOT EXISTS user_profiles (
    id                       INT UNSIGNED NOT NULL AUTO_INCREMENT,
    username                 VARCHAR(64) NOT NULL,
    full_name                VARCHAR(128),
    email                    VARCHAR(128),
    phone                    VARCHAR(32),
    department               VARCHAR(128),
    notes                    TEXT,
    active                   TINYINT(1) NOT NULL DEFAULT 1,
    expires_at               DATETIME DEFAULT NULL,
    simultaneous_connections TINYINT UNSIGNED DEFAULT NULL
        COMMENT 'NULL = ilimitado. Sincronizado com radcheck.Simultaneous-Use',
    created_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_by               VARCHAR(64),
    PRIMARY KEY (id),
    UNIQUE KEY username (username)
);

-- Log de ações administrativas
CREATE TABLE IF NOT EXISTS audit_log (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    admin_user  VARCHAR(64) NOT NULL,
    action      VARCHAR(64) NOT NULL,
    target_type VARCHAR(32),   -- 'user', 'group', 'nas', 'vlan'
    target_name VARCHAR(128),
    details     TEXT,
    ip_address  VARCHAR(45),
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY admin_user (admin_user),
    KEY created_at (created_at)
);

-- ============================================================
-- DADOS INICIAIS
-- ============================================================

-- Admin padrão: admin / Admin@123
-- O install.sh regenera este hash via bcryptjs logo após importar o schema,
-- garantindo que o hash seja compatível com a versão exata da lib instalada.
INSERT IGNORE INTO admin_users (username, password, full_name, role)
VALUES ('admin', '$2b$12$wTRSZhsojF0/D16ZdZDYKe7gJqgdfmg0/vBburcfH/OqXSEC3FyGu', 'Administrador', 'superadmin');

-- VLANs de exemplo (ajuste conforme a rede)
INSERT IGNORE INTO vlan_profiles (groupname, vlan_id, description, color) VALUES
('funcionarios',  10, 'Rede Funcionários',   '#10b981'),
('gestores',      20, 'Rede Gestores',        '#6366f1'),
('visitantes',    30, 'Rede Visitantes',      '#f59e0b'),
('ti',            40, 'Rede TI',              '#3b82f6'),
('bloqueados',    99, 'Sem acesso / Bloq.',   '#ef4444');

-- Attributes 802.1Q de VLAN por grupo
INSERT IGNORE INTO radgroupreply (groupname, attribute, op, value) VALUES
('funcionarios',  'Tunnel-Type',             ':=', '13'),
('funcionarios',  'Tunnel-Medium-Type',      ':=', '6'),
('funcionarios',  'Tunnel-Private-Group-Id', ':=', '10'),
('gestores',      'Tunnel-Type',             ':=', '13'),
('gestores',      'Tunnel-Medium-Type',      ':=', '6'),
('gestores',      'Tunnel-Private-Group-Id', ':=', '20'),
('visitantes',    'Tunnel-Type',             ':=', '13'),
('visitantes',    'Tunnel-Medium-Type',      ':=', '6'),
('visitantes',    'Tunnel-Private-Group-Id', ':=', '30'),
('ti',            'Tunnel-Type',             ':=', '13'),
('ti',            'Tunnel-Medium-Type',      ':=', '6'),
('ti',            'Tunnel-Private-Group-Id', ':=', '40');

-- NAS de exemplo — substitua pelo IP real dos seus APs Unifi
INSERT IGNORE INTO nas (nasname, shortname, type, secret, description) VALUES
('192.168.1.1', 'AP-Principal', 'other', 'secret_radius_123', 'Access Point Principal (Unifi)');

-- Marca todas as migrations como já aplicadas nesta instalação limpa
-- (o schema já as incorpora; não precisam ser re-executadas)
INSERT IGNORE INTO schema_migrations (version) VALUES
('002_add_permissions'),
('003_simultaneous_connections');
