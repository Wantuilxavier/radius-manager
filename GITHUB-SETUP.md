# 🐙 Publicar no GitHub e sincronizar o servidor

---

## Parte 1 — Publicar no GitHub (do seu computador)

### 1.1 Crie o repositório no GitHub

1. Acesse [github.com/new](https://github.com/new)
2. Preencha:
   - **Repository name:** `radius-manager`
   - **Visibility:** Private ← recomendado (contém configs de rede)
   - **NÃO** marque "Add a README" nem ".gitignore"
3. Clique em **Create repository**
4. Copie a **URL SSH** exibida:
   ```
   git@github.com:seu-usuario/radius-manager.git
   ```

### 1.2 Envie o código do seu computador

```bash
# Dentro da pasta radius-manager que você baixou
cd radius-manager

git init
git add .
git commit -m "feat: initial release — FreeRADIUS web manager"
git branch -M main
git remote add origin git@github.com:seu-usuario/radius-manager.git
git push -u origin main
```

> Se ainda não tem chave SSH no seu computador local:
> ```bash
> ssh-keygen -t ed25519 -C "seu@email.com"
> cat ~/.ssh/id_ed25519.pub   # copie e adicione em github.com/settings/keys
> ```

---

## Parte 2 — Conectar o servidor ao GitHub

O servidor **não precisa de IP público**. Ele só precisa de saída para a internet (porta 443/22 para github.com), o que qualquer servidor tem.

A autenticação é feita por **Deploy Key SSH** — uma chave exclusiva para este servidor, com permissão apenas de leitura no repositório.

### 2.1 Execute o script de configuração no servidor

```bash
bash /opt/radius-manager/scripts/setup-github.sh
```

O script vai:
1. Gerar uma chave SSH Ed25519 exclusiva para o servidor
2. Exibir a chave pública para você adicionar no GitHub
3. Testar a conexão
4. Inicializar o git e configurar o remote

### 2.2 O que você verá na tela

```
▶ Gerando chave SSH de deploy

━━━━━━━━ COPIE ESTA CHAVE PÚBLICA ━━━━━━━━
ssh-ed25519 AAAAC3Nza... radius-manager-deploy@servidor
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Pressione ENTER após adicionar a chave no GitHub...
```

Enquanto o script aguarda, acesse:
```
https://github.com/seu-usuario/radius-manager/settings/keys
```
→ **Add deploy key** → cole a chave → **NÃO** marque "Allow write access" → **Add key**

Depois pressione ENTER no servidor.

---

## Parte 3 — Atualizar o servidor no futuro

Sempre que fizer mudanças e quiser aplicar no servidor:

**No seu computador:**
```bash
git add .
git commit -m "fix: descrição da mudança"
git push
```

**No servidor:**
```bash
bash /opt/radius-manager/scripts/update.sh
```

O script de atualização:
- Verifica se há commits novos no GitHub
- Mostra o que vai ser atualizado antes de aplicar
- Faz backup do `.env` automaticamente
- Aplica o `git pull`
- Reinstala dependências se o `package.json` mudou
- Reinicia o PM2

### Fluxo completo de uma atualização

```
[Seu computador]          [GitHub]            [Servidor]
      │                      │                     │
      │── git push ─────────►│                     │
      │                      │◄── git fetch ───────│
      │                      │     (verifica)       │
      │                      │── git pull ─────────►│
      │                      │                     │── npm install
      │                      │                     │── pm2 restart
      │                      │                     │✅ atualizado
```

---

## Comandos úteis no servidor

```bash
# Ver versão atual instalada
cd /opt/radius-manager && git log -1 --oneline

# Ver histórico de atualizações
cd /opt/radius-manager && git log --oneline -10

# Verificar se há atualizações sem aplicar
cd /opt/radius-manager && git fetch && git status

# Reverter para a versão anterior se algo der errado
cd /opt/radius-manager
git log --oneline        # veja o hash da versão anterior
git checkout <hash>      # aplica aquela versão
pm2 restart radius-manager

# Status da aplicação
pm2 status
pm2 logs radius-manager --lines 50
```

---

## Arquivos que o git NUNCA envia (protegidos pelo .gitignore)

| Arquivo | Motivo |
|---|---|
| `backend/.env` | Contém senhas do banco e JWT secret |
| `node_modules/` | Dependências — geradas pelo `npm install` |
| `*.log` | Logs de execução |

O `.env` do servidor fica **apenas** em `/opt/radius-manager/backend/.env` e tem backup automático em `/opt/radius-manager-backups/` a cada atualização.
