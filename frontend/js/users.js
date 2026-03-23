// ─── USERS PAGE ───────────────────────────────────────────────
let usersState = { page: 1, search: '', group: '', active: '', limit: 20 };

async function loadUsers(resetPage = true) {
  if (resetPage) usersState.page = 1;
  const el = document.getElementById('users-table-body');
  el.innerHTML = `<tr><td colspan="7" class="loading-overlay"><span class="spinner"></span></td></tr>`;

  try {
    const q = new URLSearchParams({
      page: usersState.page, limit: usersState.limit,
      ...(usersState.search && { search: usersState.search }),
      ...(usersState.group  && { group:  usersState.group  }),
      ...(usersState.active !== '' && { active: usersState.active }),
    });
    const data = await api.get(`/users?${q}`);
    renderUsersTable(data);
  } catch (err) {
    el.innerHTML = `<tr><td colspan="7" style="color:var(--red);padding:24px;text-align:center">Erro: ${err.message}</td></tr>`;
  }
}

function renderUsersTable({ users, total, page, limit }) {
  const tbody = document.getElementById('users-table-body');
  if (!users.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><span class="icon">👤</span><p>Nenhum usuário encontrado</p></div></td></tr>`;
  } else {
    tbody.innerHTML = users.map(u => {
      const initials = (u.full_name || u.username).charAt(0).toUpperCase();
      const statusBadge = u.active
        ? '<span class="badge badge-green"><span class="badge-dot badge-dot-pulse"></span>Ativo</span>'
        : '<span class="badge badge-red">Bloqueado</span>';
      return `
      <tr>
        <td>
          <div class="user-cell">
            <div class="user-cell-avatar">${initials}</div>
            <div class="user-cell-info">
              <div class="primary">${u.username}</div>
              ${u.full_name ? `<div class="secondary">${u.full_name}</div>` : ''}
            </div>
          </div>
        </td>
        <td style="font-size:13px;color:var(--text-secondary)">${u.email || '—'}</td>
        <td style="font-size:13px">${u.department || '—'}</td>
        <td>${vlanBadge(u.groupname, u.vlan_color, u.vlan_id)}</td>
        <td>${statusBadge}</td>
        <td style="font-size:12px;color:var(--text-muted);font-family:var(--font-mono)">${fmtDate(u.created_at)}</td>
        <td>
          <div style="display:flex;gap:4px">
            <button class="btn btn-ghost btn-sm btn-icon" title="Ver detalhes" onclick="viewUser('${u.username}')">
              <svg><use href="#ic-eye"/></svg>
            </button>
            ${hasPermission('users','edit') ? `
            <button class="btn btn-ghost btn-sm btn-icon" title="Editar" onclick="editUser('${u.username}')">
              <svg><use href="#ic-edit"/></svg>
            </button>` : ''}
            ${hasPermission('users','toggle') ? `
            <button class="btn btn-sm btn-icon ${u.active ? 'btn-danger' : 'btn-success'}" title="${u.active ? 'Bloquear' : 'Ativar'}" onclick="toggleUser('${u.username}', ${u.active})">
              <svg><use href="#ic-power"/></svg>
            </button>` : ''}
            ${hasPermission('users','delete') ? `
            <button class="btn btn-danger btn-sm btn-icon" title="Remover" onclick="deleteUser('${u.username}')">
              <svg><use href="#ic-trash"/></svg>
            </button>` : ''}
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  renderPagination('users-pagination', page, total, limit, p => { usersState.page = p; loadUsers(false); });
  document.getElementById('users-count').textContent = `${total} usuário${total !== 1 ? 's' : ''}`;

  // Update group filter options
  const gf = document.getElementById('filter-group');
  if (gf && !gf.dataset.loaded) {
    gf.innerHTML = '<option value="">Todos os grupos</option>' + groups.map(g =>
      `<option value="${g.groupname}">${g.groupname} — VLAN ${g.vlan_id}</option>`
    ).join('');
    gf.dataset.loaded = '1';
  }
}

// ─── User actions ─────────────────────────────────────────────
async function viewUser(username) {
  try {
    const u = await api.get(`/users/${username}`);
    document.getElementById('view-user-title').textContent = u.username;
    document.getElementById('view-user-body').innerHTML = `
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:24px">
        <div style="width:56px;height:56px;background:linear-gradient(135deg,var(--accent),var(--purple));border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:700;color:white;flex-shrink:0">
          ${(u.full_name || u.username).charAt(0).toUpperCase()}
        </div>
        <div>
          <div style="font-size:18px;font-weight:700">${u.full_name || u.username}</div>
          <div style="font-family:var(--font-mono);color:var(--text-secondary);font-size:13px">@${u.username}</div>
          <div style="margin-top:6px">${vlanBadge(u.groupname, u.vlan_color, u.vlan_id)}</div>
        </div>
        <div style="margin-left:auto">
          <span class="badge ${u.active ? 'badge-green' : 'badge-red'}">${u.active ? '● Ativo' : '● Inativo'}</span>
        </div>
      </div>
      <div class="info-grid" style="margin-bottom:20px">
        <div class="info-item"><label>Email</label><span>${u.email || '—'}</span></div>
        <div class="info-item"><label>Telefone</label><span>${u.phone || '—'}</span></div>
        <div class="info-item"><label>Departamento</label><span>${u.department || '—'}</span></div>
        <div class="info-item"><label>Expira em</label><span>${u.expires_at ? fmtDate(u.expires_at) : 'Nunca'}</span></div>
        <div class="info-item"><label>Criado em</label><span>${fmtDate(u.created_at)}</span></div>
        <div class="info-item"><label>Criado por</label><span>${u.created_by || '—'}</span></div>
      </div>
      ${u.notes ? `<div style="background:var(--bg-hover);padding:12px;border-radius:var(--radius-sm);font-size:13px;color:var(--text-secondary);margin-bottom:20px"><strong>Observações:</strong><br>${u.notes}</div>` : ''}
      ${u.sessions?.length ? `
        <div style="font-size:13px;font-weight:600;margin-bottom:10px">Últimas sessões</div>
        <div class="table-wrapper" style="font-size:12px">
          <table>
            <thead><tr><th>Início</th><th>IP</th><th>AP</th><th>Duração</th></tr></thead>
            <tbody>${u.sessions.map(s => `<tr>
              <td style="font-family:var(--font-mono)">${fmtDate(s.acctstarttime)}</td>
              <td style="font-family:var(--font-mono)">${s.framedipaddress || '—'}</td>
              <td style="font-family:var(--font-mono)">${s.nasipaddress}</td>
              <td>${fmtDuration(s.acctsessiontime ? Math.round(s.acctsessiontime/60) : null)}</td>
            </tr>`).join('')}</tbody>
          </table>
        </div>` : '<p style="color:var(--text-muted);font-size:13px">Nenhuma sessão registrada</p>'}
    `;
    openModal('modal-view-user');
  } catch (err) { toast(err.message, 'error'); }
}

async function editUser(username) {
  try {
    const u = await api.get(`/users/${username}`);
    document.getElementById('edit-user-title').textContent = `Editar: ${username}`;
    document.getElementById('edit-username-val').value = username;
    document.getElementById('edit-fullname').value   = u.full_name || '';
    document.getElementById('edit-email').value      = u.email || '';
    document.getElementById('edit-phone').value      = u.phone || '';
    document.getElementById('edit-department').value = u.department || '';
    document.getElementById('edit-notes').value      = u.notes || '';
    document.getElementById('edit-expires').value    = u.expires_at ? u.expires_at.slice(0,16) : '';
    document.getElementById('edit-password').value   = '';
    const gs = document.getElementById('edit-group');
    gs.innerHTML = groupOptions(u.groupname);
    openModal('modal-edit-user');
  } catch (err) { toast(err.message, 'error'); }
}

async function submitEditUser() {
  const username = document.getElementById('edit-username-val').value;
  const body = {
    full_name:  document.getElementById('edit-fullname').value.trim() || null,
    email:      document.getElementById('edit-email').value.trim() || null,
    phone:      document.getElementById('edit-phone').value.trim() || null,
    department: document.getElementById('edit-department').value.trim() || null,
    notes:      document.getElementById('edit-notes').value.trim() || null,
    expires_at: document.getElementById('edit-expires').value || null,
    groupname:  document.getElementById('edit-group').value,
    password:   document.getElementById('edit-password').value || undefined,
  };
  if (!body.password) delete body.password;

  const btn = document.getElementById('btn-save-edit');
  btn.disabled = true; btn.textContent = 'Salvando...';
  try {
    await api.put(`/users/${username}`, body);
    toast('Usuário atualizado com sucesso', 'success');
    closeModal('modal-edit-user');
    loadUsers(false);
  } catch (err) { toast(err.message, 'error'); }
  finally { btn.disabled = false; btn.textContent = 'Salvar'; }
}

async function toggleUser(username, currentActive) {
  if (currentActive && !confirm(`Bloquear ${username}? O usuário não conseguirá autenticar.`)) return;
  try {
    const r = await api.patch(`/users/${username}/toggle`, {});
    toast(`Usuário ${r.active ? 'habilitado' : 'bloqueado'} com sucesso`, r.active ? 'success' : 'info');
    loadUsers(false);
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteUser(username) {
  if (!confirm(`Remover usuário "${username}" permanentemente? Esta ação não pode ser desfeita.`)) return;
  try {
    await api.delete(`/users/${username}`);
    toast(`Usuário ${username} removido`, 'info');
    loadUsers(false);
  } catch (err) { toast(err.message, 'error'); }
}

async function createUser() {
  const gs = document.getElementById('new-group');
  gs.innerHTML = groupOptions('');
  document.getElementById('form-new-user').reset();
  document.getElementById('new-user-error').style.display = 'none';
  openModal('modal-new-user');
}

async function submitNewUser() {
  const errorEl = document.getElementById('new-user-error');
  errorEl.style.display = 'none';

  const body = {
    username:   document.getElementById('new-username').value.trim(),
    password:   document.getElementById('new-password').value,
    groupname:  document.getElementById('new-group').value,
    full_name:  document.getElementById('new-fullname').value.trim() || null,
    email:      document.getElementById('new-email').value.trim() || null,
    phone:      document.getElementById('new-phone').value.trim() || null,
    department: document.getElementById('new-department').value.trim() || null,
    notes:      document.getElementById('new-notes').value.trim() || null,
    expires_at: document.getElementById('new-expires').value || null,
  };

  if (!body.username || !body.password || !body.groupname) {
    errorEl.textContent = 'Usuário, senha e grupo são obrigatórios';
    errorEl.style.display = 'block';
    return;
  }

  const btn = document.getElementById('btn-create-user');
  btn.disabled = true; btn.textContent = 'Criando...';
  try {
    await api.post('/users', body);
    toast(`Usuário ${body.username} criado com sucesso`, 'success');
    closeModal('modal-new-user');
    loadUsers();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  } finally {
    btn.disabled = false; btn.textContent = 'Criar Usuário';
  }
}

// ─── Filters ─────────────────────────────────────────────────
function initUserFilters() {
  const searchInput = document.getElementById('search-users');
  if (searchInput) {
    let t;
    searchInput.addEventListener('input', e => {
      clearTimeout(t);
      t = setTimeout(() => { usersState.search = e.target.value; loadUsers(); }, 350);
    });
  }
  const groupFilter = document.getElementById('filter-group');
  if (groupFilter) groupFilter.addEventListener('change', e => { usersState.group = e.target.value; loadUsers(); });
  const activeFilter = document.getElementById('filter-active');
  if (activeFilter) activeFilter.addEventListener('change', e => { usersState.active = e.target.value; loadUsers(); });
}
