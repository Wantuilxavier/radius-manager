#!/bin/bash
# ============================================================
# install.sh — Radius Manager
# Instalação automatizada para Debian 13 (root)
# ============================================================
set -e

# ─── Cores ───────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

info()    { echo -e "${CYAN}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC}   $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
error()   { echo -e "${RED}[ERRO]${NC} $1"; exit 1; }
step()    { echo -e "\n${BOLD}${BLUE}▶ $1${NC}"; }

# ─── Verificações iniciais ────────────────────────────────────
if [ "$(id -u)" -ne 0 ]; then
  error "Este script deve ser executado como root."
fi

if ! grep -qi "debian" /etc/os-release 2>/dev/null; then
  warn "Sistema não identificado como Debian. Continuando mesmo assim..."
fi

# Resolve o diretório real do script (funciona mesmo com symlinks)
SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"

echo -e "\n${BOLD}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║        Radius Manager — Instalação       ║${NC}"
echo -e "${BOLD}║     FreeRADIUS + MariaDB + Node.js       ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════╝${NC}\n"

# ─── Variáveis configuráveis ─────────────────────────────────
INSTALL_DIR="/opt/radius-manager"
DB_NAME="radius"
DB_USER="radius"
APP_PORT="3000"

# Gera senha do banco e JWT aleatórios se não definidos
DB_PASS="${DB_PASS:-$(openssl rand -hex 20)}"
JWT_SECRET="${JWT_SECRET:-$(openssl rand -hex 64)}"

echo -e "${YELLOW}Configurações que serão usadas:${NC}"
echo "  Diretório de instalação : $INSTALL_DIR"
echo "  Banco de dados          : $DB_NAME"
echo "  Usuário do banco        : $DB_USER"
echo "  Porta da aplicação      : $APP_PORT"
echo ""
read -rp "Continuar? [S/n] " CONFIRM
[[ "$CONFIRM" =~ ^[Nn]$ ]] && { echo "Instalação cancelada."; exit 0; }

# ─── 1. Atualiza sistema e pacotes base ──────────────────────
step "Atualizando pacotes do sistema"
apt-get update -qq
apt-get upgrade -y -qq

# Pacotes base disponíveis no Debian 13 (sem software-properties-common,
# que é exclusivo do Ubuntu)
apt-get install -y -qq \
  curl \
  wget \
  gnupg2 \
  ca-certificates \
  lsb-release \
  apt-transport-https \
  openssl \
  ufw \
  nginx

success "Pacotes base instalados"

# ─── 2. Node.js 20 LTS via NodeSource ────────────────────────
step "Instalando Node.js 20 LTS"
if ! command -v node &>/dev/null; then
  info "Baixando script de configuração do NodeSource..."
  curl -fsSL https://deb.nodesource.com/setup_20.x -o /tmp/nodesource_setup.sh
  bash /tmp/nodesource_setup.sh
  rm -f /tmp/nodesource_setup.sh
  apt-get install -y nodejs
fi

NODE_VER=$(node --version)
NPM_VER=$(npm --version)
success "Node.js $NODE_VER / npm $NPM_VER instalados"

# Configura diretório global do npm em ~/.npm-global (padrão no Debian 13 com root)
# Isso evita conflitos com pacotes do sistema e garante PATH previsível
NPM_GLOBAL="/root/.npm-global"
mkdir -p "${NPM_GLOBAL}"
npm config set prefix "${NPM_GLOBAL}"

# Instala PM2 globalmente
npm install -g pm2

# Exporta o PATH com o diretório global do npm
export PATH="${NPM_GLOBAL}/bin:${PATH}"

# Persiste no .bashrc para sessões futuras
if ! grep -q "npm-global" /root/.bashrc 2>/dev/null; then
  echo "export PATH=\"${NPM_GLOBAL}/bin:\$PATH\"" >> /root/.bashrc
fi

# Persiste no /etc/environment para ser disponível ao systemd/pm2 startup
if ! grep -q "npm-global" /etc/environment 2>/dev/null; then
  # Adiciona ao PATH existente no /etc/environment
  current_path=$(grep '^PATH=' /etc/environment | cut -d= -f2- | tr -d '"' || echo '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin')
  sed -i '/^PATH=/d' /etc/environment
  echo "PATH=\"${NPM_GLOBAL}/bin:${current_path}\"" >> /etc/environment
fi

# Verifica que pm2 está acessível
hash -r
if ! command -v pm2 > /dev/null 2>&1; then
  error "pm2 não encontrado em ${NPM_GLOBAL}/bin. Verifique: ls ${NPM_GLOBAL}/bin/"
fi
success "PM2 instalado: $(pm2 --version) em ${NPM_GLOBAL}/bin/pm2"

# ─── 3. MariaDB ───────────────────────────────────────────────
step "Instalando MariaDB"
apt-get install -y mariadb-server mariadb-client
systemctl enable mariadb
systemctl start mariadb

# Aguarda o socket do MariaDB ficar disponível (até 15s)
info "Aguardando MariaDB inicializar..."
for i in $(seq 1 15); do
  if mariadb -u root -e "SELECT 1;" > /dev/null 2>&1; then
    break
  fi
  sleep 1
done

# Verifica se o MariaDB respondeu
if ! mariadb -u root -e "SELECT 1;" > /dev/null 2>&1; then
  error "MariaDB não respondeu após 15 segundos. Verifique: systemctl status mariadb"
fi
success "MariaDB em execução"

# Configura banco e usuário
# No Debian 13 o root do MariaDB usa unix_socket — sem senha.
# Usamos -e para cada comando, evitando problemas com heredoc e escape de caracteres.
info "Configurando banco de dados..."

# Grava a senha em arquivo temporário seguro para evitar exposição em ps/log
# e para usar no arquivo de opções do mariadb (evita interpolação problemática)
DB_PASS_FILE="$(mktemp)"
chmod 600 "${DB_PASS_FILE}"
printf '%s' "${DB_PASS}" > "${DB_PASS_FILE}"

mariadb -u root -e "CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# CREATE OR REPLACE garante que senha seja redefinida mesmo em reinstalação
mariadb -u root -e "CREATE OR REPLACE USER '${DB_USER}'@'localhost' IDENTIFIED BY '$(cat ${DB_PASS_FILE})';"

mariadb -u root -e "GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'localhost';"

mariadb -u root -e "FLUSH PRIVILEGES;"

# Verifica conectividade usando arquivo de opções (evita senha na linha de comando)
DB_OPT_FILE="$(mktemp)"
chmod 600 "${DB_OPT_FILE}"
printf '[client]
user=%s
password=%s
' "${DB_USER}" "${DB_PASS}" > "${DB_OPT_FILE}"

if ! mariadb --defaults-extra-file="${DB_OPT_FILE}" "${DB_NAME}" -e "SELECT 1;" > /dev/null 2>&1; then
  warn "Diagnóstico — usuário no MariaDB:"
  mariadb -u root -e "SELECT user, host, plugin FROM mysql.user WHERE user='${DB_USER}';"
  rm -f "${DB_PASS_FILE}" "${DB_OPT_FILE}"
  error "Falha ao autenticar usuário '${DB_USER}'. Verifique o log acima."
fi

rm -f "${DB_PASS_FILE}" "${DB_OPT_FILE}"
success "Banco '${DB_NAME}' e usuário '${DB_USER}' criados e verificados"

# ─── 4. FreeRADIUS ───────────────────────────────────────────
step "Instalando FreeRADIUS"
apt-get install -y freeradius freeradius-mysql freeradius-utils
systemctl stop freeradius 2>/dev/null || true

# Ativa módulo SQL
if [ ! -L /etc/freeradius/3.0/mods-enabled/sql ]; then
  ln -s /etc/freeradius/3.0/mods-available/sql \
        /etc/freeradius/3.0/mods-enabled/sql
  info "Módulo SQL ativado"
fi

# Copia e configura sql.conf (substitui placeholder de senha)
info "Configurando módulo SQL do FreeRADIUS..."
cp "${SCRIPT_DIR}/freeradius/sql.conf" /etc/freeradius/3.0/mods-available/sql
# Usa python para substituir a senha no sql.conf — evita problema com caracteres
# especiais no sed (barras, etc.)
python3 -c "
import sys
with open('/etc/freeradius/3.0/mods-available/sql', 'r') as f:
    c = f.read()
c = c.replace('SUA_SENHA_AQUI', sys.argv[1])
with open('/etc/freeradius/3.0/mods-available/sql', 'w') as f:
    f.write(c)
" "${DB_PASS}"

# Copia sites-available/default já configurado com sql nas seções corretas
cp "${SCRIPT_DIR}/freeradius/sites-default" /etc/freeradius/3.0/sites-available/default

# Copia e ativa inner-tunnel (necessário para PEAP/MSCHAPv2)
cp "${SCRIPT_DIR}/freeradius/inner-tunnel" /etc/freeradius/3.0/sites-available/inner-tunnel
chown freerad:freerad /etc/freeradius/3.0/sites-available/inner-tunnel
chmod 640 /etc/freeradius/3.0/sites-available/inner-tunnel
if [ ! -L /etc/freeradius/3.0/sites-enabled/inner-tunnel ]; then
  ln -s /etc/freeradius/3.0/sites-available/inner-tunnel \
        /etc/freeradius/3.0/sites-enabled/inner-tunnel
  info "Site inner-tunnel ativado"
fi

# Copia queries.conf customizado (suporte a usuário DEFAULT para VLAN padrão)
info "Configurando queries SQL do FreeRADIUS (com suporte a DEFAULT)..."
cp "${SCRIPT_DIR}/freeradius/queries.conf" \
   /etc/freeradius/3.0/mods-config/sql/main/mysql/queries.conf
chown freerad:freerad /etc/freeradius/3.0/mods-config/sql/main/mysql/queries.conf
chmod 640 /etc/freeradius/3.0/mods-config/sql/main/mysql/queries.conf

# Ajusta permissões (FreeRADIUS roda como freerad)
chown freerad:freerad /etc/freeradius/3.0/mods-available/sql
chmod 640 /etc/freeradius/3.0/mods-available/sql

# Importa schema no banco (usa root via socket para garantir acesso)
info "Importando schema do banco de dados..."
mariadb -u root "${DB_NAME}" < "${SCRIPT_DIR}/database/schema.sql"
success "Schema importado com sucesso"

systemctl enable freeradius
systemctl start freeradius
success "FreeRADIUS instalado e configurado"

# ─── 5. Radius Manager (aplicação Node.js) ───────────────────
step "Instalando Radius Manager"

# Copia arquivos para /opt/radius-manager
if [ "$SCRIPT_DIR" != "$INSTALL_DIR" ]; then
  mkdir -p "$INSTALL_DIR"
  cp -r "${SCRIPT_DIR}/." "$INSTALL_DIR/"
  info "Arquivos copiados para $INSTALL_DIR"
fi

# A partir daqui, sempre ler arquivos do INSTALL_DIR
# (garante que cp/mysql usem o caminho correto independente de onde o script foi chamado)
SCRIPT_DIR="$INSTALL_DIR"

# Cria diretório de logs
mkdir -p /var/log/radius-manager

# Gera .env com as credenciais geradas
cat > "${INSTALL_DIR}/backend/.env" <<ENV
PORT=${APP_PORT}
NODE_ENV=production

DB_HOST=localhost
DB_PORT=3306
DB_USER=${DB_USER}
DB_PASS=${DB_PASS}
DB_NAME=${DB_NAME}

JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=8h

CORS_ORIGIN=*
ENV

chmod 600 "${INSTALL_DIR}/backend/.env"
info "Arquivo .env gerado"

# Instala dependências Node.js (somente produção)
cd "${INSTALL_DIR}/backend"
npm install --omit=dev
success "Dependências Node.js instaladas"

# Redefine a senha do admin padrão via Node.js/bcryptjs
# Garante que o hash no banco seja gerado pela mesma lib usada pela aplicação
info "Definindo senha do admin padrão..."
node -e "
const bcrypt = require('./node_modules/bcryptjs');
const mysql  = require('./node_modules/mysql2/promise');
require('dotenv').config();

(async () => {
  const hash = await bcrypt.hash('Admin@123', 12);
  const db = await mysql.createConnection({
    host:     process.env.DB_HOST,
    port:     process.env.DB_PORT,
    user:     process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
  });
  await db.execute(
    'INSERT INTO admin_users (username, password, full_name, role) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE password = VALUES(password)',
    ['admin', hash, 'Administrador', 'superadmin']
  );
  await db.end();
  console.log('Senha admin definida com sucesso');
})().catch(e => { console.error(e.message); process.exit(1); });
"
success "Admin padrão configurado (admin / Admin@123)"

# Inicia aplicação com PM2
pm2 delete radius-manager 2>/dev/null || true
pm2 start "${INSTALL_DIR}/backend/ecosystem.config.js" --env production
pm2 save

# Configura PM2 para iniciar no boot via systemd
pm2 startup systemd -u root --hp /root 2>/dev/null | grep "^sudo\|^systemctl\|^env" | bash || true
success "Aplicação iniciada com PM2"

# ─── 6. Nginx como proxy reverso ─────────────────────────────
step "Configurando Nginx"

cp "${SCRIPT_DIR}/nginx/radius-manager.conf" /etc/nginx/sites-available/radius-manager

# Substitui APP_PORT pelo valor real
sed -i "s/APP_PORT/${APP_PORT}/g" /etc/nginx/sites-available/radius-manager

# Ativa o site e desativa o default
ln -sf /etc/nginx/sites-available/radius-manager /etc/nginx/sites-enabled/radius-manager
rm -f /etc/nginx/sites-enabled/default

# Testa e (re)inicia nginx
nginx -t
systemctl enable nginx
systemctl restart nginx
success "Nginx configurado como proxy reverso"

# ─── 7. Firewall UFW ─────────────────────────────────────────
step "Configurando firewall (UFW)"
ufw --force reset > /dev/null 2>&1
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp    comment 'HTTP Radius Manager'
ufw allow 443/tcp   comment 'HTTPS Radius Manager'
ufw allow 1812/udp  comment 'RADIUS Auth'
ufw allow 1813/udp  comment 'RADIUS Accounting'
ufw --force enable
success "Firewall configurado"

# ─── Resumo final ────────────────────────────────────────────
SERVER_IP=$(hostname -I | awk '{print $1}')

echo ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║     ✅  Instalação concluída com sucesso!    ║${NC}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}Painel web:${NC}        http://${SERVER_IP}"
echo -e "  ${BOLD}Login padrão:${NC}      admin / Admin@123"
echo -e "  ${BOLD}Diretório:${NC}         $INSTALL_DIR"
echo ""
echo -e "  ${BOLD}Banco de dados:${NC}"
echo -e "    Host    : localhost"
echo -e "    Banco   : $DB_NAME"
echo -e "    Usuário : $DB_USER"
echo -e "    Senha   : ${YELLOW}${DB_PASS}${NC}"
echo ""
echo -e "  ${BOLD}Onde consultar a senha depois:${NC}"
echo -e "    cat ${INSTALL_DIR}/backend/.env"
echo -e "    grep DB_PASS ${INSTALL_DIR}/backend/.env"
echo ""
# Salva as credenciais num arquivo de referência fora do projeto
CRED_FILE="/root/radius-manager-credenciais.txt"
cat > "${CRED_FILE}" << CREDS
Radius Manager — Credenciais de instalação
Gerado em: $(date)

Painel web : http://$(hostname -I | awk '{print $1}')
Login admin: admin
Senha admin: Admin@123  ← TROQUE IMEDIATAMENTE

Banco de dados MariaDB:
  Host    : localhost
  Banco   : ${DB_NAME}
  Usuário : ${DB_USER}
  Senha   : ${DB_PASS}

JWT Secret: ${JWT_SECRET}

Arquivo .env completo: ${INSTALL_DIR}/backend/.env
CREDS
chmod 600 "${CRED_FILE}"
echo -e "  ${BOLD}Credenciais salvas em:${NC} ${YELLOW}${CRED_FILE}${NC}"
echo ""
echo -e "  ${BOLD}JWT Secret${NC} salvo em: ${YELLOW}${INSTALL_DIR}/backend/.env${NC}"
echo ""
echo -e "${YELLOW}⚠️  Troque a senha do admin após o primeiro acesso!${NC}"
echo -e "${YELLOW}⚠️  Para HTTPS em produção:${NC}"
echo -e "     apt install certbot python3-certbot-nginx"
echo -e "     certbot --nginx -d seu.dominio.com"
echo ""
