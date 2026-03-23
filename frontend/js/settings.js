// ─── SETTINGS PAGE ────────────────────────────────────────────
async function loadSettings() {
  await loadAdminsList();
}

// ─── Change Password ──────────────────────────────────────────
async function submitChangePassword() {
  const errEl  = document.getElementById('chpw-error');
  const okEl   = document.getElementById('chpw-success');
  errEl.style.display = 'none';
  okEl.style.display  = 'none';

  const current = document.getElementById('chpw-current').value;
  const nw      = document.getElementById('chpw-new').value;
  const confirm = document.getElementById('chpw-confirm').value;

  if (!current || !nw || !confirm) {
    errEl.textContent = 'Preencha todos os campos';
    errEl.style.display = 'block'; return;
  }
  if (nw.length < 8) {
    errEl.textContent = 'A nova senha deve ter no mínimo 8 caracteres';
    errEl.style.display = 'block'; return;
  }
  if (nw !== confirm) {
    errEl.textContent = 'As senhas não coincidem';
    errEl.style.display = 'block'; return;
  }

  try {
    await api.post('/auth/change-password', { current_password: current, new_password: nw });
    okEl.textContent = '✓ Senha alterada com sucesso!';
    okEl.style.display = 'block';
    document.getElementById('chpw-current').value = '';
    document.getElementById('chpw-new').value     = '';
    document.getElementById('chpw-confirm').value = '';
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  }
}

// ─── Admins List ──────────────────────────────────────────────
async function loadAdminsList() {
  const el  = document.getElementById('admins-list');
  const u   = currentUser();

  // Somente superadmin vê a lista
  if (!u || u.role !== 'superadmin') {
    document.getElementById('admins-card').style.display = 'none';
    return;
  }

  el.innerHTML = '<div class="loading-overlay"><span class="spinner"></span></div>';

  try {
    const admins = await api.get('/settings/admins');
    const roleColor = { superadmin: 'badge-purple', admin: 'badge-blue', viewer: 'badge-gray' };
    const roleLabel = { superadmin: 'Superadmin', admin: 'Admin', viewer: 'Viewer' };

    el.innerHTML = admins.map(a => `
      <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">
        <div style="width:34px;height:34px;background:linear-gradient(135deg,var(--accent),var(--purple));border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:white;flex-shrink:0">
          ${(a.full_name || a.username).charAt(0).toUpperCase()}
        </div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span style="font-weight:600;font-size:13.5px">${a.username}</span>
            <span class="badge ${roleColor[a.role] || 'badge-gray'}">${roleLabel[a.role] || a.role}</span>
            ${!a.active ? '<span class="badge badge-red">Inativo</span>' : ''}
            ${String(a.id) === String(currentUser()?.id) ? '<span style="font-size:11px;color:var(--accent)">(você)</span>' : ''}
          </div>
          <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">
            ${a.full_name || ''}${a.email ? ` · ${a.email}` : ''}
            ${a.last_login ? ` · Último acesso: ${fmtDate(a.last_login)}` : ' · Nunca acessou'}
          </div>
        </div>
        ${String(a.id) !== String(currentUser()?.id) ? `
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button class="btn btn-ghost btn-sm" onclick='openEditAdminModal(${JSON.stringify(a)})'>Editar</button>
          <button class="btn btn-sm ${a.active ? 'btn-danger' : 'btn-success'}"
            onclick="toggleAdmin(${a.id}, ${a.active})">
            ${a.active ? 'Desativar' : 'Ativar'}
          </button>
          <button class="btn btn-danger btn-sm" onclick="deleteAdmin(${a.id}, '${a.username}')">✕</button>
        </div>` : ''}
      </div>`).join('') +
      `<div style="padding-top:4px"></div>`;

  } catch (err) {
    el.innerHTML = `<p style="color:var(--red);font-size:13px">${err.message}</p>`;
  }
}

// ─── New Admin ────────────────────────────────────────────────
function openNewAdminModal() {
  document.getElementById('new-admin-username').value = '';
  document.getElementById('new-admin-password').value = '';
  document.getElementById('new-admin-fullname').value = '';
  document.getElementById('new-admin-email').value    = '';
  document.getElementById('new-admin-role').value     = 'admin';
  document.getElementById('new-admin-error').style.display = 'none';
  openModal('modal-new-admin');
}

async function submitNewAdmin() {
  const errEl = document.getElementById('new-admin-error');
  errEl.style.display = 'none';

  const body = {
    username:  document.getElementById('new-admin-username').value.trim(),
    password:  document.getElementById('new-admin-password').value,
    full_name: document.getElementById('new-admin-fullname').value.trim() || null,
    email:     document.getElementById('new-admin-email').value.trim() || null,
    role:      document.getElementById('new-admin-role').value,
  };

  if (!body.username || !body.password) {
    errEl.textContent = 'Usuário e senha são obrigatórios';
    errEl.style.display = 'block'; return;
  }

  const btn = document.getElementById('btn-create-admin');
  btn.disabled = true; btn.textContent = 'Criando...';

  try {
    await api.post('/settings/admins', body);
    toast(`Admin ${body.username} criado com sucesso`, 'success');
    closeModal('modal-new-admin');
    loadAdminsList();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false; btn.textContent = 'Criar Admin';
  }
}

// ─── Edit Admin (inline modal reutilizando new-admin) ─────────
function openEditAdminModal(a) {
  // Reutiliza o modal de novo admin como "editar"
  document.getElementById('modal-new-admin').querySelector('.modal-title').textContent = `Editar: ${a.username}`;
  document.getElementById('new-admin-username').value = a.username;
  document.getElementById('new-admin-username').disabled = true;
  document.getElementById('new-admin-password').value = '';
  document.getElementById('new-admin-password').placeholder = 'Deixe em branco para não alterar';
  document.getElementById('new-admin-fullname').value = a.full_name || '';
  document.getElementById('new-admin-email').value    = a.email || '';
  document.getElementById('new-admin-role').value     = a.role;
  document.getElementById('new-admin-error').style.display = 'none';

  // Troca o handler do botão
  const btn = document.getElementById('btn-create-admin');
  btn.textContent = 'Salvar';
  btn.onclick = () => submitEditAdminFromModal(a.id);

  openModal('modal-new-admin');
}

async function submitEditAdminFromModal(id) {
  const errEl = document.getElementById('new-admin-error');
  errEl.style.display = 'none';

  const pw       = document.getElementById('new-admin-password').value;
  const body     = {
    full_name: document.getElementById('new-admin-fullname').value.trim() || null,
    email:     document.getElementById('new-admin-email').value.trim() || null,
    role:      document.getElementById('new-admin-role').value,
  };
  if (pw) body.password = pw;

  const btn = document.getElementById('btn-create-admin');
  btn.disabled = true; btn.textContent = 'Salvando...';

  try {
    await api.put(`/settings/admins/${id}`, body);
    toast('Admin atualizado com sucesso', 'success');
    closeModal('modal-new-admin');
    // Restaura modal para o estado de "criar"
    _resetAdminModal();
    loadAdminsList();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false; btn.textContent = 'Salvar';
  }
}

function _resetAdminModal() {
  document.getElementById('modal-new-admin').querySelector('.modal-title').textContent = 'Novo Administrador';
  document.getElementById('new-admin-username').disabled = false;
  document.getElementById('new-admin-password').placeholder = 'Mínimo 8 caracteres';
  const btn = document.getElementById('btn-create-admin');
  btn.textContent = 'Criar Admin';
  btn.onclick = submitNewAdmin;
}

// ─── Toggle Admin ─────────────────────────────────────────────
async function toggleAdmin(id, currentActive) {
  try {
    await api.put(`/settings/admins/${id}`, { active: currentActive ? 0 : 1 });
    toast(`Admin ${currentActive ? 'desativado' : 'ativado'}`, currentActive ? 'info' : 'success');
    loadAdminsList();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ─── Delete Admin ─────────────────────────────────────────────
async function deleteAdmin(id, username) {
  if (!confirm(`Remover o administrador "${username}" permanentemente?`)) return;
  try {
    await api.delete(`/settings/admins/${id}`);
    toast(`Admin ${username} removido`, 'info');
    loadAdminsList();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// Restaura o modal quando fechado via X ou overlay
document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('modal-new-admin');
  if (overlay) {
    const observer = new MutationObserver(() => {
      if (!overlay.classList.contains('open')) _resetAdminModal();
    });
    observer.observe(overlay, { attributes: true, attributeFilter: ['class'] });
  }
});
