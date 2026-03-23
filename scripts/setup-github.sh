#!/bin/bash
# ============================================================
# setup-github.sh — Conecta o servidor ao repositório GitHub
# usando Deploy Key (SSH) — funciona sem IP público
# Execute como root: bash /opt/radius-manager/scripts/setup-github.sh
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
KEY_FILE="/root/.ssh/radius-manager-deploy"

if [ "$(id -u)" -ne 0 ]; then
  error "Execute como root."
fi

echo -e "\n${BOLD}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   Radius Manager — Configurar GitHub     ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════╝${NC}\n"

# ─── Solicita URL do repositório ─────────────────────────────
echo -e "Informe a URL SSH do seu repositório GitHub."
echo -e "Exemplo: ${CYAN}git@github.com:seu-usuario/radius-manager.git${NC}"
echo ""
read -rp "URL SSH do repositório: " REPO_URL

if [ -z "$REPO_URL" ]; then
  error "URL não pode ser vazia."
fi

# Extrai owner/repo para exibição
REPO_SLUG=$(echo "$REPO_URL" | sed 's/.*github.com[:/]//' | sed 's/\.git$//')

# ─── 1. Instala git ──────────────────────────────────────────
step "Verificando dependências"
if ! command -v git &>/dev/null; then
  apt-get install -y git
fi
success "git disponível: $(git --version)"

# ─── 2. Gera chave SSH de deploy (Ed25519, sem passphrase) ───
step "Gerando chave SSH de deploy"
mkdir -p /root/.ssh
chmod 700 /root/.ssh

if [ -f "${KEY_FILE}" ]; then
  warn "Chave já existe em ${KEY_FILE} — reutilizando."
else
  ssh-keygen -t ed25519 -C "radius-manager-deploy@$(hostname)" \
    -f "${KEY_FILE}" -N ""
  success "Chave gerada: ${KEY_FILE}"
fi

# ─── 3. Configura o SSH para usar a chave neste repositório ──
step "Configurando SSH"
SSH_CONFIG="/root/.ssh/config"

# Remove bloco anterior para este host se existir
if [ -f "$SSH_CONFIG" ]; then
  python3 - << PYEOF
import re
with open('${SSH_CONFIG}', 'r') as f:
    content = f.read()
# Remove bloco Host github-radius-manager
content = re.sub(
    r'\n?Host github-radius-manager\n(?:[ \t]+.*\n)*',
    '', content
)
with open('${SSH_CONFIG}', 'w') as f:
    f.write(content)
PYEOF
fi

cat >> "$SSH_CONFIG" << SSHCONF

Host github-radius-manager
  HostName github.com
  User git
  IdentityFile ${KEY_FILE}
  IdentitiesOnly yes
  StrictHostKeyChecking accept-new
SSHCONF

chmod 600 "$SSH_CONFIG"
success "SSH configurado"

# ─── 4. Exibe a chave pública para adicionar no GitHub ───────
echo ""
echo -e "${BOLD}${YELLOW}════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}${YELLOW}  AÇÃO NECESSÁRIA — Adicione a Deploy Key no GitHub${NC}"
echo -e "${BOLD}${YELLOW}════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "1. Acesse: ${CYAN}https://github.com/${REPO_SLUG}/settings/keys${NC}"
echo -e "2. Clique em ${BOLD}\"Add deploy key\"${NC}"
echo -e "3. Título: ${BOLD}radius-manager-server${NC}"
echo -e "4. Cole a chave abaixo no campo ${BOLD}\"Key\"${NC}:"
echo -e "5. Marque ${BOLD}\"Allow write access\"${NC} NÃO (somente leitura é suficiente)"
echo ""
echo -e "${GREEN}${BOLD}━━━━━━━━ COPIE ESTA CHAVE PÚBLICA ━━━━━━━━${NC}"
cat "${KEY_FILE}.pub"
echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
read -rp "Pressione ENTER após adicionar a chave no GitHub..."

# ─── 5. Testa a conexão SSH com GitHub ───────────────────────
step "Testando conexão com GitHub"
if ssh -T git@github.com -i "${KEY_FILE}" -o StrictHostKeyChecking=accept-new 2>&1 | grep -q "successfully authenticated"; then
  success "Conexão com GitHub OK"
else
  warn "A autenticação pode não ter sido confirmada, mas continuando..."
fi

# ─── 6. Inicializa git no INSTALL_DIR ou configura remote ────
step "Configurando repositório git em ${INSTALL_DIR}"
cd "${INSTALL_DIR}"

# Monta a URL SSH usando o alias do ~/.ssh/config
REPO_PATH=$(echo "$REPO_URL" | sed 's/git@github.com://')
SSH_ALIAS_URL="git@github-radius-manager:${REPO_PATH}"

if [ ! -d ".git" ]; then
  info "Inicializando repositório git..."
  git init
  git add .
  # Protege o .env de ser commitado
  if ! grep -q "^backend/.env$" .gitignore 2>/dev/null; then
    echo "backend/.env" >> .gitignore
  fi
  git commit -m "chore: initial commit from server setup"
  git branch -M main
  git remote add origin "${SSH_ALIAS_URL}"
  info "Fazendo push inicial para o GitHub..."
  git push -u origin main
  success "Repositório criado e código enviado para o GitHub"
else
  # Já tem .git — só atualiza o remote
  if git remote | grep -q "^origin$"; then
    git remote set-url origin "${SSH_ALIAS_URL}"
    info "Remote 'origin' atualizado para: ${SSH_ALIAS_URL}"
  else
    git remote add origin "${SSH_ALIAS_URL}"
    info "Remote 'origin' adicionado: ${SSH_ALIAS_URL}"
  fi
  success "Repositório git já existente — remote configurado"
fi

# ─── 7. Configura git para usuário root ──────────────────────
git config --global user.email "root@$(hostname)"
git config --global user.name "Radius Manager Server"
git config --global pull.rebase false

# ─── Resumo ───────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║     ✅  GitHub configurado com sucesso!      ║${NC}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}Repositório:${NC} https://github.com/${REPO_SLUG}"
echo -e "  ${BOLD}Chave SSH:${NC}   ${KEY_FILE}"
echo ""
echo -e "  ${BOLD}Para atualizar o servidor no futuro:${NC}"
echo -e "  ${CYAN}bash ${INSTALL_DIR}/scripts/update.sh${NC}"
echo ""
