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

# ─── 1. Verifica se é um repositório git ─────────────────────
if [ ! -d ".git" ]; then
  error "Diretório não é um repositório git. Execute o setup-github.sh primeiro."
fi

step "Verificando atualizações no GitHub"
git fetch origin main

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" = "$REMOTE" ]; then
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

# ─── 5. Atualiza dependências se package.json mudou ──────────
step "Verificando dependências Node.js"
cd "${INSTALL_DIR}/backend"

if git diff HEAD@{1} HEAD --name-only 2>/dev/null | grep -q "package.json"; then
  info "package.json modificado — atualizando dependências..."
  npm install --omit=dev
  success "Dependências atualizadas"
else
  info "Sem mudanças em dependências"
fi

# ─── 6. Aviso se schema.sql mudou ────────────────────────────
if git diff HEAD@{1} HEAD --name-only 2>/dev/null | grep -q "database/schema.sql"; then
  warn "schema.sql foi modificado — revise antes de aplicar:"
  warn "  git diff HEAD@{1} HEAD -- database/schema.sql"
fi

# ─── 7. Reinicia a aplicação ─────────────────────────────────
step "Reiniciando aplicação"
export PATH="/root/.npm-global/bin:${PATH}"
pm2 restart radius-manager
success "Aplicação reiniciada"

echo ""
echo -e "${GREEN}${BOLD}✅ Atualização concluída: $(git rev-parse --short HEAD)${NC}"
echo -e "   $(git log -1 --pretty='%s')"
echo ""
