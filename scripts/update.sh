#!/bin/bash
# ============================================================
# update.sh — Atualiza o Radius Manager a partir do GitHub
# Execute como root: bash /opt/radius-manager/scripts/update.sh
# ============================================================
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

info()    { echo -e "${CYAN}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC}   $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
error()   { echo -e "${RED}[ERRO]${NC} $1"; exit 1; }
step()    { echo -e "\n${BOLD}${BLUE}▶ $1${NC}"; }

INSTALL_DIR="/opt/radius-manager"
BACKUP_DIR="/opt/radius-manager-backups"
DATE="$(date +%Y%m%d_%H%M%S)"

if [ "$(id -u)" -ne 0 ]; then
  error "Execute como root."
fi

cd "${INSTALL_DIR}" || error "Diretório ${INSTALL_DIR} não encontrado."

# ─── Carrega credenciais do banco a partir do .env ───────────
ENV_FILE="${INSTALL_DIR}/backend/.env"
if [ ! -f "${ENV_FILE}" ]; then
  error "Arquivo .env não encontrado em ${ENV_FILE}. Instalação incompleta?"
fi

DB_NAME=$(grep '^DB_NAME=' "${ENV_FILE}" | cut -d= -f2-)
DB_USER=$(grep '^DB_USER=' "${ENV_FILE}" | cut -d= -f2-)
DB_PASS=$(grep '^DB_PASS=' "${ENV_FILE}" | cut -d= -f2-)

# ─── Função: aplica migrations pendentes ─────────────────────
run_pending_migrations() {
  local mig_dir="${INSTALL_DIR}/database/migrations"
  if [ ! -d "${mig_dir}" ]; then
    return 0
  fi

  # Garante que a tabela de controle existe no banco
  mariadb -u root "${DB_NAME}" -e "
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    VARCHAR(64) NOT NULL,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (version)
    );" 2>/dev/null

  local found_new=0
  # Processa os arquivos em ordem lexicográfica (001, 002, 003, ...)
  for mig_file in $(ls "${mig_dir}"/*.sql 2>/dev/null | sort); do
    local version
    version=$(basename "${mig_file}" .sql)

    # Verifica se já foi aplicada
    local applied
    applied=$(mariadb -u root "${DB_NAME}" -sN \
      -e "SELECT COUNT(*) FROM schema_migrations WHERE version = '${version}';" 2>/dev/null || echo 0)

    if [ "${applied}" -eq 0 ]; then
      info "Aplicando migration: ${version}"
      if mariadb -u root "${DB_NAME}" < "${mig_file}"; then
        success "Migration aplicada: ${version}"
        found_new=1
      else
        error "Falha ao aplicar migration ${version}. Verifique o banco antes de prosseguir."
      fi
    fi
  done

  if [ "${found_new}" -eq 0 ]; then
    info "Banco de dados já está atualizado (nenhuma migration pendente)"
  fi
}

# ─── 1. Verifica se é um repositório git ─────────────────────
if [ ! -d ".git" ]; then
  error "Diretório não é um repositório git. Execute o setup-github.sh primeiro."
fi

step "Verificando atualizações no GitHub"
git fetch origin main

# ─── Detecta se o repositório local tem commits ───────────────
if ! git rev-parse HEAD > /dev/null 2>&1; then
  info "Repositório local sem commits — aplicando pull inicial..."

  mkdir -p "${BACKUP_DIR}"
  if [ -f "${INSTALL_DIR}/backend/.env" ]; then
    cp "${INSTALL_DIR}/backend/.env" "${BACKUP_DIR}/.env.${DATE}.bak"
    info "Backup do .env salvo em ${BACKUP_DIR}/.env.${DATE}.bak"
  fi

  git reset --hard
  git clean -fd
  git pull origin main

  if [ -f "${BACKUP_DIR}/.env.${DATE}.bak" ]; then
    cp "${BACKUP_DIR}/.env.${DATE}.bak" "${INSTALL_DIR}/backend/.env"
    chmod 600 "${INSTALL_DIR}/backend/.env"
    success ".env restaurado do backup"
  fi

  success "Pull inicial concluído"

  step "Aplicando migrations pendentes"
  run_pending_migrations

  cd "${INSTALL_DIR}/backend"
  npm install --omit=dev
  export PATH="/root/.npm-global/bin:${PATH}"
  pm2 restart radius-manager 2>/dev/null || pm2 start "${INSTALL_DIR}/backend/ecosystem.config.js" --env production
  pm2 save
  success "Aplicação reiniciada"
  echo ""
  echo -e "${GREEN}${BOLD}✅ Servidor sincronizado: $(git rev-parse --short HEAD)${NC}"
  echo -e "   $(git log -1 --pretty='%s')"
  echo ""
  exit 0
fi

# ─── Fluxo normal: repositório já tem commits ─────────────────
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" = "$REMOTE" ]; then
  # Mesmo na versão atual, verifica se há migrations pendentes
  # (útil quando aplicadas manualmente fora do ciclo de update)
  step "Verificando migrations pendentes"
  run_pending_migrations
  success "Já está na versão mais recente (${LOCAL:0:8})"
  exit 0
fi

info "Nova versão disponível: ${LOCAL:0:8} → ${REMOTE:0:8}"
git log --oneline HEAD..origin/main

echo ""
read -rp "Aplicar atualização? [S/n] " CONFIRM
[[ "$CONFIRM" =~ ^[Nn]$ ]] && { echo "Cancelado."; exit 0; }

# ─── 2. Backup do .env ───────────────────────────────────────
step "Fazendo backup"
mkdir -p "${BACKUP_DIR}"
cp "${INSTALL_DIR}/backend/.env" "${BACKUP_DIR}/.env.${DATE}.bak"
success "Backup salvo em ${BACKUP_DIR}/.env.${DATE}.bak"

# ─── 3. Puxa as mudanças ─────────────────────────────────────
step "Aplicando atualização"
git pull origin main
success "Código atualizado"

# ─── 4. Garante que o .env existe após o pull ────────────────
if [ ! -f "${INSTALL_DIR}/backend/.env" ]; then
  warn ".env não encontrado após pull — restaurando backup"
  cp "${BACKUP_DIR}/.env.${DATE}.bak" "${INSTALL_DIR}/backend/.env"
  chmod 600 "${INSTALL_DIR}/backend/.env"
fi

# ─── 5. Aplica migrations de banco pendentes ─────────────────
step "Aplicando migrations de banco de dados"
run_pending_migrations

# ─── 6. Atualiza arquivos de configuração do FreeRADIUS ──────
step "Atualizando configurações do FreeRADIUS"

FREERADIUS_SQL_CONF="/etc/freeradius/3.0/mods-available/sql"
FREERADIUS_QUERIES_CONF="/etc/freeradius/3.0/mods-config/sql/main/mysql/queries.conf"
FREERADIUS_SITES_DEFAULT="/etc/freeradius/3.0/sites-available/default"

FREERADIUS_UPDATED=0

# Verifica se o queries.conf mudou em relação ao que está instalado
if [ -f "${INSTALL_DIR}/freeradius/queries.conf" ]; then
  if ! cmp -s "${INSTALL_DIR}/freeradius/queries.conf" "${FREERADIUS_QUERIES_CONF}" 2>/dev/null; then
    info "Atualizando queries.conf do FreeRADIUS..."
    cp "${INSTALL_DIR}/freeradius/queries.conf" "${FREERADIUS_QUERIES_CONF}"
    chown freerad:freerad "${FREERADIUS_QUERIES_CONF}"
    chmod 640 "${FREERADIUS_QUERIES_CONF}"
    success "queries.conf atualizado"
    FREERADIUS_UPDATED=1
  else
    info "queries.conf já está atualizado"
  fi
fi

# Verifica se o sites-default mudou
if [ -f "${INSTALL_DIR}/freeradius/sites-default" ]; then
  if ! cmp -s "${INSTALL_DIR}/freeradius/sites-default" "${FREERADIUS_SITES_DEFAULT}" 2>/dev/null; then
    info "Atualizando sites-available/default do FreeRADIUS..."
    cp "${INSTALL_DIR}/freeradius/sites-default" "${FREERADIUS_SITES_DEFAULT}"
    success "sites-available/default atualizado"
    FREERADIUS_UPDATED=1
  else
    info "sites-available/default já está atualizado"
  fi
fi

if [ "${FREERADIUS_UPDATED}" -eq 1 ]; then
  info "Reiniciando FreeRADIUS para aplicar configurações..."
  systemctl restart freeradius
  success "FreeRADIUS reiniciado"
fi

# ─── 7. Atualiza dependências se package.json mudou ──────────
step "Verificando dependências Node.js"
cd "${INSTALL_DIR}/backend"

if git diff HEAD@{1} HEAD --name-only 2>/dev/null | grep -q "package.json"; then
  info "package.json modificado — atualizando dependências..."
  npm install --omit=dev
  success "Dependências atualizadas"
else
  info "Sem mudanças em dependências"
fi

# ─── 8. Reinicia a aplicação ─────────────────────────────────
step "Reiniciando aplicação"
export PATH="/root/.npm-global/bin:${PATH}"
pm2 restart radius-manager
success "Aplicação reiniciada"

echo ""
echo -e "${GREEN}${BOLD}✅ Atualização concluída: $(git rev-parse --short HEAD)${NC}"
echo -e "   $(git log -1 --pretty='%s')"
echo ""
