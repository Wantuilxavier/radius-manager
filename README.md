# 📡 Radius Manager

Sistema web de gerenciamento do **FreeRADIUS** com suporte a VLANs dinâmicas via 802.1Q.  
Permite criar, editar, habilitar e desabilitar usuários WiFi, atribuindo-os a grupos que determinam em qual VLAN eles serão colocados após a autenticação.

![Node.js](https://img.shields.io/badge/Node.js-20%2B-green?logo=node.js)
![MariaDB](https://img.shields.io/badge/MariaDB-10.11%2B-blue?logo=mariadb)
![FreeRADIUS](https://img.shields.io/badge/FreeRADIUS-3.x-orange)
![Debian](https://img.shields.io/badge/Debian-13-red?logo=debian)
![License](https://img.shields.io/badge/license-MIT-lightgrey)

---

## 🧱 Arquitetura

```
┌──────────────────────────────────────────────────────────┐
│                     Cliente WiFi                         │
└────────────────────┬─────────────────────────────────────┘
                     │ 802.1X / WPA2-Enterprise
┌────────────────────▼─────────────────────────────────────┐
│           Access Point / Switch gerenciável              │
│                (NAS — Network Access Server)             │
└────────────────────┬─────────────────────────────────────┘
                     │ RADIUS (UDP 1812 auth / 1813 acct)
┌────────────────────▼─────────────────────────────────────┐
│                  FreeRADIUS 3.x                          │
│     autenticação → consulta MariaDB → retorna VLAN       │
└────────────────────┬─────────────────────────────────────┘
                     │ SQL TCP 3306
┌────────────────────▼─────────────────────────────────────┐
│                    MariaDB 10.11+                        │
│   radcheck · radreply · radusergroup · radgroupreply     │
│   + user_profiles · vlan_profiles · audit_log            │
└────────────────────┬─────────────────────────────────────┘
                     │ REST API :3000 (interno)
┌────────────────────▼─────────────────────────────────────┐
│         Radius Manager — Node.js + Express               │
│              Frontend SPA + Backend API                  │
└────────────────────┬─────────────────────────────────────┘
                     │ HTTP :80 / HTTPS :443
┌────────────────────▼─────────────────────────────────────┐
│                    Nginx (proxy reverso)                 │
└──────────────────────────────────────────────────────────┘
```

---

## 🗂️ Estrutura do repositório

```
radius-manager/
├── install.sh                  # Instalação automatizada (Debian 13 / root)
├── backend/
│   ├── server.js               # Entry point Express
│   ├── ecosystem.config.js     # PM2 config
│   ├── .env.example            # Template de variáveis de ambiente
│   ├── db/connection.js        # Pool de conexão MariaDB
│   ├── middleware/auth.js      # Middleware JWT
│   └── routes/
│       ├── auth.js             # Login / me / change-password
│       ├── users.js            # CRUD usuários RADIUS
│       ├── groups.js           # CRUD grupos / VLANs
│       └── dashboard.js        # Stats, sessões, audit log
├── frontend/
│   ├── index.html              # SPA — página principal
│   ├── css/style.css           # Design system (tema escuro)
│   └── js/
│       ├── utils.js            # API client e helpers
│       ├── app.js              # Login, navegação, dashboard
│       ├── users.js            # Página de usuários
│       └── groups-sessions.js  # Grupos, sessões ativas, auditoria
├── database/
│   └── schema.sql              # Schema completo + dados iniciais
├── freeradius/
│   ├── sql.conf                # Configuração do módulo SQL
│   └── sites-default           # sites-available/default com SQL ativo
└── nginx/
    └── radius-manager.conf     # Proxy reverso Nginx
```

---

## ⚙️ Pré-requisitos

| Componente | Versão mínima |
|---|---|
| Debian | 13 (Trixie) |
| Node.js | 20 LTS |
| MariaDB | 10.11 |
| FreeRADIUS | 3.0 |
| Nginx | 1.24+ |

> O script `install.sh` instala e configura tudo automaticamente.

---

## 🚀 Instalação (automatizada)

```bash
# 1. Clone o repositório
git clone https://github.com/seu-usuario/radius-manager.git
cd radius-manager

# 2. Execute o instalador como root
chmod +x install.sh
./install.sh
```

O script realiza automaticamente:
- Instalação e configuração do Node.js 20, PM2, MariaDB, FreeRADIUS e Nginx
- Criação do banco de dados e importação do schema
- Geração aleatória de senha do banco e JWT secret
- Configuração do proxy reverso Nginx
- Configuração do firewall (UFW) com as portas necessárias
- Inicialização da aplicação com PM2 e autostart no boot

---

## 🔧 Instalação manual (passo a passo)

### 1. Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
```

### 2. MariaDB

```bash
apt-get install -y mariadb-server mariadb-client
systemctl enable --now mariadb

mysql -u root <<EOF
CREATE DATABASE radius CHARACTER SET utf8mb4;
CREATE USER 'radius'@'localhost' IDENTIFIED BY 'SENHA_FORTE';
GRANT ALL PRIVILEGES ON radius.* TO 'radius'@'localhost';
FLUSH PRIVILEGES;
EOF

mysql -u radius -p radius < database/schema.sql
```

### 3. FreeRADIUS

```bash
apt-get install -y freeradius freeradius-mysql

# Ativa o módulo SQL
ln -s /etc/freeradius/3.0/mods-available/sql \
      /etc/freeradius/3.0/mods-enabled/sql

# Copia as configurações
cp freeradius/sql.conf /etc/freeradius/3.0/mods-available/sql
# Edite SUA_SENHA_AQUI em /etc/freeradius/3.0/mods-available/sql

cp freeradius/sites-default /etc/freeradius/3.0/sites-available/default

chown freerad:freerad /etc/freeradius/3.0/mods-available/sql
systemctl enable --now freeradius

# Teste em modo verbose:
freeradius -X
```

### 4. Aplicação Node.js

```bash
mkdir -p /opt/radius-manager
cp -r . /opt/radius-manager/
cd /opt/radius-manager/backend

cp .env.example .env
nano .env   # Preencha as credenciais

npm install --omit=dev
```

### 5. PM2

```bash
npm install -g pm2
mkdir -p /var/log/radius-manager

pm2 start /opt/radius-manager/backend/ecosystem.config.js --env production
pm2 save
pm2 startup systemd -u root --hp /root | tail -1 | bash
```

### 6. Nginx

```bash
apt-get install -y nginx

cp nginx/radius-manager.conf /etc/nginx/sites-available/radius-manager
sed -i 's/APP_PORT/3000/' /etc/nginx/sites-available/radius-manager

ln -s /etc/nginx/sites-available/radius-manager \
      /etc/nginx/sites-enabled/radius-manager
rm -f /etc/nginx/sites-enabled/default

nginx -t && systemctl enable --now nginx
```

### 7. Firewall

```bash
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 1812/udp   # RADIUS Auth
ufw allow 1813/udp   # RADIUS Accounting
ufw enable
```

---

## 🔑 Primeiro acesso

| Campo | Valor padrão |
|---|---|
| URL | `http://IP_DO_SERVIDOR` |
| Usuário | `admin` |
| Senha | `Admin@123` |

> ⚠️ **Troque a senha imediatamente após o primeiro login.**

---

## 🔒 HTTPS com Let's Encrypt (recomendado para produção)

```bash
apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d radius.suadominio.com
```

---

## 📡 Configuração do Access Point

Configure seu AP/switch com WPA2-Enterprise / 802.1X:

| Parâmetro | Valor |
|---|---|
| Servidor RADIUS Auth | IP do servidor, porta **1812** UDP |
| Servidor RADIUS Acct | IP do servidor, porta **1813** UDP |
| Secret compartilhado | Cadastrado na tabela `nas` do banco |
| Atributo de VLAN | `Tunnel-Private-Group-Id` (retornado dinamicamente) |

Atributos VLAN retornados por grupo:
```
Tunnel-Type             = VLAN (13)
Tunnel-Medium-Type      = IEEE-802 (6)
Tunnel-Private-Group-Id = <vlan_id>
```

---

## 🔁 API REST

Todos os endpoints (exceto `/api/auth/login`) exigem `Authorization: Bearer <token>`.

| Método | Endpoint | Descrição |
|---|---|---|
| POST | `/api/auth/login` | Login do administrador |
| GET | `/api/auth/me` | Dados do admin logado |
| POST | `/api/auth/change-password` | Troca de senha |
| GET | `/api/users` | Lista usuários (filtros + paginação) |
| POST | `/api/users` | Cria usuário |
| GET | `/api/users/:username` | Detalhe + sessões do usuário |
| PUT | `/api/users/:username` | Atualiza usuário |
| PATCH | `/api/users/:username/toggle` | Ativa / bloqueia usuário |
| DELETE | `/api/users/:username` | Remove usuário permanentemente |
| GET | `/api/groups` | Lista grupos/VLANs |
| POST | `/api/groups` | Cria grupo |
| PUT | `/api/groups/:groupname` | Atualiza grupo |
| DELETE | `/api/groups/:groupname` | Remove grupo |
| GET | `/api/dashboard/stats` | Estatísticas gerais |
| GET | `/api/dashboard/sessions` | Sessões ativas |
| GET | `/api/dashboard/audit` | Log de auditoria |

---

## 🛠️ Comandos úteis (pós-instalação)

```bash
# Status da aplicação
pm2 status

# Logs em tempo real
pm2 logs radius-manager

# Reiniciar aplicação
pm2 restart radius-manager

# Status do FreeRADIUS
systemctl status freeradius

# Testar autenticação RADIUS manualmente
radtest usuario senha localhost 0 secret_do_nas

# Verificar configuração do FreeRADIUS
freeradius -X
```

---

## 🔒 Segurança

- O arquivo `.env` **nunca** deve ser commitado (está no `.gitignore`)
- O JWT secret deve ter no mínimo 64 caracteres aleatórios: `openssl rand -hex 64`
- Em produção, use sempre HTTPS via certbot
- Restrinja as portas RADIUS (1812/1813) apenas aos IPs dos APs no firewall
- Considere PEAP/MSCHAPv2 em vez de PAP para proteger credenciais em trânsito

---

## 📄 Licença

MIT — veja o arquivo [LICENSE](LICENSE) para detalhes.
