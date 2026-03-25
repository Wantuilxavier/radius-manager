// ─── USERS PAGE ───────────────────────────────────────────────
let usersState = { page: 1, search: '', group: '', active: '', department: '', limit: 20 };

async function loadUsers(resetPage = true) {
  if (resetPage) usersState.page = 1;
  const el = document.getElementById('users-table-body');
  el.innerHTML = `<tr><td colspan="7" class="loading-overlay"><span class="spinner"></span></td></tr>`;

  try {
    const q = new URLSearchParams({
      page: usersState.page, limit: usersState.limit,
      ...(usersState.search     && { search:     usersState.search }),
      ...(usersState.group      && { group:      usersState.group }),
      ...(usersState.department && { department: usersState.department }),
      ...(usersState.active !== '' && { active:  usersState.active }),
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

  // Update department filter options
  const df = document.getElementById('filter-department');
  if (df && !df.dataset.loaded && _departmentsList.length) {
    const cur = usersState.department;
    df.innerHTML = '<option value="">Todos os departamentos</option>' + _departmentsList.map(d =>
      `<option value="${d.name}" ${d.name === cur ? 'selected' : ''}>${d.name}</option>`
    ).join('');
    df.dataset.loaded = '1';
  }
}

// ─── Device helpers ────────────────────────────────────────────
function fmtMac(mac) {
  if (!mac) return '—';
  return mac.toUpperCase();
}

function deviceIcon(vendor) {
  const v = (vendor || '').toLowerCase();
  if (v.includes('apple'))    return '🍎';
  if (v.includes('samsung'))  return '📱';
  if (v.includes('xiaomi'))   return '📱';
  if (v.includes('google'))   return '📱';
  if (v.includes('raspberry')) return '🖥️';
  if (v.includes('vmware'))   return '💻';
  return '📡';
}

function fmtConnectionType(ct) {
  if (!ct) return '—';
  // Unifi envia: "CONNECT 300Mbps 802.11n", "CONNECT 867Mbps 802.11ac" etc.
  return ct.replace('CONNECT ', '').trim();
}

function renderDevicesSection(devices, username) {
  if (!devices || !devices.length) {
    return `<div style="background:var(--bg-hover);border-radius:var(--radius-sm);padding:16px;text-align:center;color:var(--text-muted);font-size:13px">
              Nenhum dispositivo conectado no momento
            </div>`;
  }

  const rows = devices.map((d, i) => `
    <tr>
      <td style="font-size:18px;text-align:center;width:36px">${deviceIcon(d.vendor)}</td>
      <td>
        <div style="font-family:var(--font-mono);font-size:12px;font-weight:600">${fmtMac(d.mac)}</div>
        ${d.vendor ? `<div style="font-size:11px;color:var(--text-muted)">${d.vendor}</div>` : ''}
      </td>
      <td>
        <div style="font-size:12px">${d.ap_name || d.ap_ip || '—'}</div>
        ${d.ssid ? `<div style="font-size:11px;color:var(--text-muted)">SSID: ${d.ssid}</div>` : ''}
      </td>
      <td style="font-family:var(--font-mono);font-size:12px">${d.device_ip || '—'}</td>
      <td style="font-size:12px">${fmtConnectionType(d.connection_type)}</td>
      <td style="font-size:12px;color:var(--text-muted)">${fmtDuration(d.session_seconds ? Math.round(d.session_seconds / 60) : null)}</td>
    </tr>`).join('');

  return `
    <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:8px">
      ${devices.length} dispositivo${devices.length !== 1 ? 's' : ''} conectado${devices.length !== 1 ? 's' : ''}
    </div>
    <div class="table-wrapper" style="font-size:12px">
      <table>
        <thead>
          <tr>
            <th></th>
            <th>MAC / Fabricante</th>
            <th>Access Point</th>
            <th>IP</th>
            <th>Conexão</th>
            <th>Tempo</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// ─── User actions ─────────────────────────────────────────────
async function viewUser(username) {
  try {
    const [u, devData] = await Promise.all([
      api.get(`/users/${username}`),
      api.get(`/users/${username}/devices`).catch(() => ({ devices: [] })),
    ]);

    const simLabel = u.simultaneous_connections
      ? `${u.simultaneous_connections} dispositivo${u.simultaneous_connections !== 1 ? 's' : ''}`
      : 'Ilimitado';

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
        <div class="info-item"><label>Conexões simultâneas</label><span>${simLabel}</span></div>
      </div>
      ${u.notes ? `<div style="background:var(--bg-hover);padding:12px;border-radius:var(--radius-sm);font-size:13px;color:var(--text-secondary);margin-bottom:20px"><strong>Observações:</strong><br>${u.notes.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/\n/g,'<br>')}</div>` : ''}

      <div style="font-size:13px;font-weight:600;margin-bottom:10px">Dispositivos conectados agora</div>
      ${renderDevicesSection(devData.devices, username)}

      ${u.sessions?.length ? `
        <div style="font-size:13px;font-weight:600;margin:20px 0 10px">Últimas sessões</div>
        <div class="table-wrapper" style="font-size:12px">
          <table>
            <thead><tr><th>Início</th><th>IP</th><th>AP</th><th>SSID</th><th>Duração</th></tr></thead>
            <tbody>${u.sessions.map(s => {
              const ssidPart = s.calledstationid
                ? (() => { const lc = s.calledstationid.lastIndexOf(':'); return lc > 11 ? s.calledstationid.substring(lc + 1) : '—'; })()
                : '—';
              return `<tr>
                <td style="font-family:var(--font-mono)">${fmtDate(s.acctstarttime)}</td>
                <td style="font-family:var(--font-mono)">${s.framedipaddress || '—'}</td>
                <td style="font-family:var(--font-mono)">${s.nasipaddress}</td>
                <td style="font-size:11px">${ssidPart}</td>
                <td>${fmtDuration(s.acctsessiontime ? Math.round(s.acctsessiontime/60) : null)}</td>
              </tr>`;
            }).join('')}</tbody>
          </table>
        </div>` : '<p style="color:var(--text-muted);font-size:13px;margin-top:16px">Nenhuma sessão registrada</p>'}
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
    document.getElementById('edit-notes').value      = u.notes || '';
    document.getElementById('edit-expires').value    = u.expires_at ? u.expires_at.slice(0,16) : '';
    document.getElementById('edit-password').value   = '';
    document.getElementById('edit-simultaneous').value = u.simultaneous_connections != null ? String(u.simultaneous_connections) : '';
    document.getElementById('edit-department').value = u.department || '';
    const gs = document.getElementById('edit-group');
    gs.innerHTML = groupOptions(u.groupname);
    openModal('modal-edit-user');
  } catch (err) { toast(err.message, 'error'); }
}

async function submitEditUser() {
  const username = document.getElementById('edit-username-val').value;
  const body = {
    full_name:                document.getElementById('edit-fullname').value.trim() || null,
    email:                    document.getElementById('edit-email').value.trim() || null,
    phone:                    document.getElementById('edit-phone').value.trim() || null,
    department:               document.getElementById('edit-department').value.trim() || null,
    notes:                    document.getElementById('edit-notes').value.trim() || null,
    expires_at:               document.getElementById('edit-expires').value || null,
    groupname:                document.getElementById('edit-group').value,
    password:                 document.getElementById('edit-password').value || undefined,
    simultaneous_connections: document.getElementById('edit-simultaneous').value || null,
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

// ─── Username auto-generation ─────────────────────────────────
let _usernameAutoMode = true;
let _fullnameDebounceTimer = null;

const _STOP_WORDS = new Set(['da','de','do','das','dos','e','van','von','del','di','el']);

function _normalizePart(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function _generateUsernameCandidates(fullname) {
  const parts = fullname.trim().split(/\s+/)
    .map(_normalizePart)
    .filter(p => p.length > 0 && !_STOP_WORDS.has(p));

  if (!parts.length) return [];

  const first = parts[0];
  const last  = parts[parts.length - 1];
  const mid   = parts.length > 2 ? parts.slice(1, -1) : [];

  const candidates = [];

  if (parts.length === 1) {
    candidates.push(first);
    for (let i = 2; i <= 9; i++) candidates.push(`${first}${i}`);
    return candidates;
  }

  // Priority order
  candidates.push(`${first}.${last}`);
  if (mid.length) candidates.push(`${first}.${mid[0]}.${last}`);
  candidates.push(`${first}${last.charAt(0)}.${last}`);
  candidates.push(`${first.charAt(0)}.${last}`);
  if (mid.length) candidates.push(`${first}.${mid.map(m => m.charAt(0)).join('')}.${last}`);
  for (let i = 2; i <= 9; i++) candidates.push(`${first}.${last}${i}`);

  return candidates;
}

async function _checkUsernameAvailable(username) {
  try {
    await api.get(`/users/${username}`);
    return false; // 200 = exists
  } catch (err) {
    return true; // 404 = available
  }
}

async function _onFullnameInput(value) {
  clearTimeout(_fullnameDebounceTimer);
  if (!_usernameAutoMode) return;

  const badge = document.getElementById('new-username-auto-badge');

  if (!value.trim()) {
    document.getElementById('new-username').value = '';
    if (badge) badge.style.display = 'none';
    return;
  }

  _fullnameDebounceTimer = setTimeout(async () => {
    if (!_usernameAutoMode) return;
    const candidates = _generateUsernameCandidates(value);
    for (const candidate of candidates) {
      const available = await _checkUsernameAvailable(candidate);
      if (available) {
        if (!_usernameAutoMode) return; // user may have typed manually while checking
        document.getElementById('new-username').value = candidate;
        if (badge) badge.style.display = 'inline';
        return;
      }
    }
  }, 500);
}

function _onUsernameManualEdit() {
  _usernameAutoMode = false;
  const badge = document.getElementById('new-username-auto-badge');
  if (badge) badge.style.display = 'none';
}

function _toggleNewPassword() {
  const inp = document.getElementById('new-password');
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

async function createUser() {
  _usernameAutoMode = true;
  clearTimeout(_fullnameDebounceTimer);
  document.getElementById('form-new-user').reset();
  document.getElementById('new-password').value = 'verbo@sede';
  document.getElementById('new-password').type = 'password';
  document.getElementById('new-simultaneous').value = '1';
  const badge = document.getElementById('new-username-auto-badge');
  if (badge) badge.style.display = 'none';
  const gs = document.getElementById('new-group');
  if (gs) gs.innerHTML = groupOptions('');
  document.getElementById('new-user-error').style.display = 'none';
  openModal('modal-new-user');
}

async function submitNewUser() {
  const errorEl = document.getElementById('new-user-error');
  errorEl.style.display = 'none';

  const body = {
    username:                 document.getElementById('new-username').value.trim(),
    password:                 document.getElementById('new-password').value,
    groupname:                document.getElementById('new-group').value,
    full_name:                document.getElementById('new-fullname').value.trim() || null,
    email:                    document.getElementById('new-email').value.trim() || null,
    phone:                    document.getElementById('new-phone').value.trim() || null,
    department:               document.getElementById('new-department').value.trim() || null,
    notes:                    document.getElementById('new-notes').value.trim() || null,
    expires_at:               document.getElementById('new-expires').value || null,
    simultaneous_connections: document.getElementById('new-simultaneous').value || null,
  };

  if (!body.username || !body.password || !body.groupname) {
    errorEl.textContent = 'Usuário, senha e grupo são obrigatórios';
    errorEl.style.display = 'block';
    return;
  }
  if (body.password.length < 6) {
    errorEl.textContent = 'A senha deve ter no mínimo 6 caracteres';
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
  const deptFilter = document.getElementById('filter-department');
  if (deptFilter) deptFilter.addEventListener('change', e => { usersState.department = e.target.value; loadUsers(); });
}
