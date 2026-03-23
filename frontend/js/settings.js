// ─── SETTINGS PAGE ────────────────────────────────────────────
async function loadSettings() {
  await Promise.all([
    loadAdminsList(),
    loadDefaultVlanSection(),
  ]);
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
      <div class="admin-item">
        <div class="admin-avatar">
          ${(a.full_name || a.username).charAt(0).toUpperCase()}
        </div>
        <div class="admin-info">
          <div class="name" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span>${a.username}</span>
            <span class="badge ${roleColor[a.role] || 'badge-gray'}">${roleLabel[a.role] || a.role}</span>
            ${!a.active ? '<span class="badge badge-red">Inativo</span>' : ''}
            ${String(a.id) === String(currentUser()?.id) ? '<span style="font-size:11px;color:var(--accent)">(você)</span>' : ''}
          </div>
          <div class="meta">
            ${a.full_name || ''}${a.email ? ` · ${a.email}` : ''}
            ${a.last_login ? ` · Último acesso: ${fmtDate(a.last_login)}` : ' · Nunca acessou'}
          </div>
        </div>
        ${String(a.id) !== String(currentUser()?.id) ? `
        <div class="admin-actions">
          ${a.role !== 'superadmin' ? `
          <button class="btn btn-ghost btn-sm btn-icon" title="Gerenciar permissões" onclick="openPermissionsModal(${a.id}, '${a.username}', '${a.role}')">
            <svg><use href="#ic-shield"/></svg>
          </button>` : ''}
          <button class="btn btn-ghost btn-sm btn-icon" title="Editar" onclick='openEditAdminModal(${JSON.stringify(a)})'>
            <svg><use href="#ic-edit"/></svg>
          </button>
          <button class="btn btn-sm btn-icon ${a.active ? 'btn-danger' : 'btn-success'}" title="${a.active ? 'Desativar' : 'Ativar'}"
            onclick="toggleAdmin(${a.id}, ${a.active})">
            <svg><use href="#ic-power"/></svg>
          </button>
          <button class="btn btn-danger btn-sm btn-icon" title="Remover" onclick="deleteAdmin(${a.id}, '${a.username}')">
            <svg><use href="#ic-trash"/></svg>
          </button>
        </div>` : ''}
      </div>`).join('');

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

// ─── Edit Admin ───────────────────────────────────────────────
function openEditAdminModal(a) {
  document.getElementById('modal-new-admin').querySelector('.modal-title').textContent = `Editar: ${a.username}`;
  document.getElementById('new-admin-username').value = a.username;
  document.getElementById('new-admin-username').disabled = true;
  document.getElementById('new-admin-password').value = '';
  document.getElementById('new-admin-password').placeholder = 'Deixe em branco para não alterar';
  document.getElementById('new-admin-fullname').value = a.full_name || '';
  document.getElementById('new-admin-email').value    = a.email || '';
  document.getElementById('new-admin-role').value     = a.role;
  document.getElementById('new-admin-error').style.display = 'none';

  const btn = document.getElementById('btn-create-admin');
  btn.textContent = 'Salvar';
  btn.onclick = () => submitEditAdminFromModal(a.id);

  openModal('modal-new-admin');
}

async function submitEditAdminFromModal(id) {
  const errEl = document.getElementById('new-admin-error');
  errEl.style.display = 'none';

  const pw   = document.getElementById('new-admin-password').value;
  const body = {
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

// ─── Toggle/Delete Admin ──────────────────────────────────────
async function toggleAdmin(id, currentActive) {
  try {
    await api.put(`/settings/admins/${id}`, { active: currentActive ? 0 : 1 });
    toast(`Admin ${currentActive ? 'desativado' : 'ativado'}`, currentActive ? 'info' : 'success');
    loadAdminsList();
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteAdmin(id, username) {
  if (!confirm(`Remover o administrador "${username}" permanentemente?`)) return;
  try {
    await api.delete(`/settings/admins/${id}`);
    toast(`Admin ${username} removido`, 'info');
    loadAdminsList();
  } catch (err) { toast(err.message, 'error'); }
}

// Restaura modal quando fechado
document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('modal-new-admin');
  if (overlay) {
    const observer = new MutationObserver(() => {
      if (!overlay.classList.contains('open')) _resetAdminModal();
    });
    observer.observe(overlay, { attributes: true, attributeFilter: ['class'] });
  }
});

// ═══════════════════════════════════════════════════════════════
//  MODAL DE PERMISSÕES
// ═══════════════════════════════════════════════════════════════

// Labels amigáveis
const RESOURCE_LABELS = {
  dashboard:   'Dashboard',
  users:       'Usuários',
  groups:      'Grupos / VLANs',
  nas:         'Dispositivos NAS',
  sessions:    'Sessões Ativas',
  audit:       'Log de Auditoria',
  departments: 'Departamentos',
};
const ACTION_LABELS = {
  view:   'Visualizar',
  create: 'Criar',
  edit:   'Editar',
  delete: 'Excluir',
  toggle: 'Ativar/Bloquear',
};
const ACTION_ICONS = {
  view:   '#ic-eye',
  create: '#ic-plus',
  edit:   '#ic-edit',
  delete: '#ic-trash',
  toggle: '#ic-power',
};

let _permAdminId   = null;
let _permAvailable = {};

async function openPermissionsModal(adminId, username, role) {
  _permAdminId = adminId;

  const modal = document.getElementById('modal-permissions');
  modal.querySelector('.modal-title').textContent = `Permissões — ${username}`;
  modal.querySelector('#perm-role-badge').textContent = role;
  modal.querySelector('#perm-role-badge').className =
    `badge ${role === 'admin' ? 'badge-blue' : 'badge-gray'}`;

  const body = modal.querySelector('#perm-matrix-body');
  body.innerHTML = '<div class="loading-overlay"><span class="spinner"></span></div>';
  openModal('modal-permissions');

  try {
    const data = await api.get(`/settings/admins/${adminId}/permissions`);
    _permAvailable = data.available;
    _renderPermMatrix(body, data.granted, data.available);
  } catch (err) {
    body.innerHTML = `<p style="color:var(--red);padding:16px">${err.message}</p>`;
  }
}

function _renderPermMatrix(container, granted, available) {
  const resources = Object.keys(available);

  container.innerHTML = `
    <div style="padding:4px 0 16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
      <span style="font-size:13px;color:var(--text-secondary)">Marque as permissões que este usuário deve ter.</span>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost btn-sm" onclick="_permSelectAll(true)">Marcar todos</button>
        <button class="btn btn-ghost btn-sm" onclick="_permSelectAll(false)">Desmarcar todos</button>
      </div>
    </div>
    <div class="perm-matrix">
      ${resources.map(resource => {
        const actions = available[resource];
        return `
          <div class="perm-resource-row">
            <div class="perm-resource-name">
              <svg style="width:14px;height:14px;color:var(--accent)"><use href="#ic-shield"/></svg>
              ${RESOURCE_LABELS[resource] || resource}
            </div>
            <div class="perm-actions-wrap">
              ${actions.map(action => {
                const checked = (granted[resource] || []).includes(action);
                return `
                  <label class="perm-checkbox-label ${checked ? 'perm-checked' : ''}" id="perm-lbl-${resource}-${action}">
                    <input type="checkbox" class="perm-cb" data-resource="${resource}" data-action="${action}"
                      ${checked ? 'checked' : ''}
                      onchange="_permToggleLabel(this)">
                    <svg style="width:13px;height:13px"><use href="${ACTION_ICONS[action] || '#ic-check'}"/></svg>
                    ${ACTION_LABELS[action] || action}
                  </label>`;
              }).join('')}
            </div>
          </div>`;
      }).join('')}
    </div>`;
}

function _permToggleLabel(checkbox) {
  const label = checkbox.closest('.perm-checkbox-label');
  label.classList.toggle('perm-checked', checkbox.checked);
}

function _permSelectAll(checked) {
  document.querySelectorAll('#modal-permissions .perm-cb').forEach(cb => {
    cb.checked = checked;
    _permToggleLabel(cb);
  });
}

async function savePermissions_modal() {
  const checkboxes = document.querySelectorAll('#modal-permissions .perm-cb');
  const permissions = [];
  checkboxes.forEach(cb => {
    if (cb.checked) permissions.push({ resource: cb.dataset.resource, action: cb.dataset.action });
  });

  const btn = document.getElementById('btn-save-permissions');
  btn.disabled = true; btn.textContent = 'Salvando...';

  try {
    const result = await api.put(`/settings/admins/${_permAdminId}/permissions`, { permissions });
    toast(result.message || 'Permissões salvas', 'success');
    closeModal('modal-permissions');
    loadAdminsList();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Salvar Permissões';
  }
}

// ═══════════════════════════════════════════════════════════════
//  VLAN PADRÃO PARA USUÁRIOS NÃO CADASTRADOS
// ═══════════════════════════════════════════════════════════════

async function loadDefaultVlanSection() {
  const el  = document.getElementById('default-vlan-body');
  const u   = currentUser();
  const card = document.getElementById('default-vlan-card');

  if (!u || u.role !== 'superadmin') {
    if (card) card.style.display = 'none';
    return;
  }

  el.innerHTML = '<div class="loading-overlay"><span class="spinner"></span></div>';

  try {
    const cfg = await api.get('/settings/default-vlan');
    _renderDefaultVlan(el, cfg);
  } catch (err) {
    el.innerHTML = `<p style="color:var(--red);font-size:13px">${err.message}</p>`;
  }
}

function _renderDefaultVlan(el, cfg) {
  const activeGroups = typeof groups !== 'undefined'
    ? groups.filter(g => g.active)
    : [];

  const groupOptions = activeGroups
    .map(g => `<option value="${g.groupname}" ${cfg.group === g.groupname ? 'selected' : ''}>${g.groupname} — VLAN ${g.vlan_id}</option>`)
    .join('');

  el.innerHTML = `
    <div id="default-vlan-alert" class="${cfg.enabled ? 'alert-error' : ''}" style="display:${cfg.enabled ? 'flex' : 'none'};margin-bottom:16px;background:rgba(251,191,36,.12);border:1px solid rgba(251,191,36,.3);border-radius:var(--radius-sm);padding:10px 14px;font-size:13px;color:var(--yellow);gap:10px;align-items:flex-start">
      <svg style="width:16px;height:16px;flex-shrink:0;margin-top:1px"><use href="#ic-alert"/></svg>
      <span><strong>Atenção:</strong> Com esta política ativa, dispositivos <strong>não cadastrados</strong> poderão autenticar e receber acesso à rede. Use apenas em redes isoladas ou de visitantes.</span>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap">
      <div style="display:flex;align-items:center;gap:12px">
        <label class="form-label" style="margin:0;white-space:nowrap">Grupo padrão</label>
        <select id="default-vlan-group" class="form-select" style="width:220px" ${!cfg.enabled ? '' : ''}>
          <option value="">— Selecione —</option>
          ${groupOptions}
        </select>
      </div>
      <div style="display:flex;align-items:center;gap:12px">
        <span style="font-size:13px;color:var(--text-secondary)">
          Status: <strong style="color:${cfg.enabled ? 'var(--yellow)' : 'var(--text-muted)'}">${cfg.enabled ? 'Ativo — não cadastrados são aceitos' : 'Inativo — somente usuários cadastrados'}</strong>
        </span>
        <button class="btn ${cfg.enabled ? 'btn-danger' : 'btn-primary'} btn-sm" onclick="toggleDefaultVlan(${cfg.enabled})">
          ${cfg.enabled ? 'Desativar' : 'Ativar política'}
        </button>
      </div>
    </div>`;
}

async function toggleDefaultVlan(currentEnabled) {
  const groupSel = document.getElementById('default-vlan-group');
  const group    = groupSel?.value;
  const enabling = !currentEnabled;

  if (enabling && !group) {
    toast('Selecione um grupo/VLAN antes de ativar', 'error');
    groupSel?.focus();
    return;
  }

  const confirmMsg = enabling
    ? `Ativar VLAN padrão para grupo "${group}"?\n\nUsuários NÃO cadastrados poderão autenticar. Confirmar?`
    : 'Desativar VLAN padrão? Apenas usuários cadastrados poderão autenticar.';

  if (!confirm(confirmMsg)) return;

  try {
    const result = await api.put('/settings/default-vlan', {
      enabled: enabling,
      group: enabling ? group : null,
    });
    toast(result.message, enabling ? 'info' : 'success');
    loadDefaultVlanSection();
  } catch (err) { toast(err.message, 'error'); }
}
