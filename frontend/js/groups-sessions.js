// ─── GROUPS PAGE ─────────────────────────────────────────────
async function loadGroupsPage() {
  const el = document.getElementById('groups-content');
  el.innerHTML = '<div class="loading-overlay"><span class="spinner"></span></div>';
  try {
    await loadGroups();
    el.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px">
        ${groups.map(g => renderGroupCard(g)).join('')}
        ${hasPermission('groups', 'create') ? `
        <div class="group-card group-card-add" onclick="openNewGroupModal()">
          <div>
            <div style="width:40px;height:40px;border-radius:var(--radius-sm);border:2px dashed var(--border-2);display:flex;align-items:center;justify-content:center;margin-bottom:12px;transition:border-color var(--transition),background var(--transition)">
              <svg style="width:20px;height:20px;color:var(--text-muted)"><use href="#ic-plus"/></svg>
            </div>
            <div style="font-size:14px;font-weight:600;color:var(--text-secondary)">Nova VLAN / Grupo</div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:4px">Adicionar novo grupo</div>
          </div>
        </div>` : ''}
      </div>`;
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><span class="icon">⚠️</span><p>${err.message}</p></div>`;
  }
}

function renderGroupCard(g) {
  const color = g.color || '#6366f1';
  const colorDim = hexToRgba(color, 0.12);
  const colorBorder = hexToRgba(color, 0.3);
  const statusBadge = g.active
    ? '<span class="badge badge-green">Ativo</span>'
    : '<span class="badge badge-red">Inativo</span>';
  const userLabel = `${g.user_count} usuário${g.user_count !== 1 ? 's' : ''}`;
  return `
    <div class="group-card">
      <div class="vlan-stripe" style="background:linear-gradient(90deg,${color},${hexToRgba(color,0.6)})"></div>
      <div class="group-card-head">
        <div class="group-card-info">
          <div class="group-card-name">${g.groupname}</div>
          <div class="group-card-desc">${g.description || 'Sem descrição'}</div>
        </div>
        ${statusBadge}
      </div>
      <div class="group-card-meta">
        <span style="display:inline-flex;align-items:center;gap:6px;background:${colorDim};border:1px solid ${colorBorder};color:${color};padding:3px 10px;border-radius:20px;font-size:11.5px;font-weight:700;font-family:var(--font-mono)">
          VLAN ${g.vlan_id}
        </span>
        <span style="display:inline-flex;align-items:center;gap:5px;color:var(--text-secondary);font-size:13px">
          <svg style="width:14px;height:14px;color:var(--text-muted)"><use href="#ic-users"/></svg>
          ${userLabel}
        </span>
      </div>
      <div class="group-card-actions">
        ${hasPermission('groups','edit') ? `
        <button class="btn btn-ghost btn-sm" style="flex:1;justify-content:center" onclick='editGroup(${JSON.stringify(g)})'>
          <svg><use href="#ic-edit"/></svg> Editar
        </button>` : ''}
        ${hasPermission('groups','delete') ? `
        <button class="btn btn-danger btn-sm" style="justify-content:center" title="Remover" onclick="deleteGroup('${g.groupname}', ${g.user_count})">
          <svg><use href="#ic-trash"/></svg>
        </button>` : ''}
        ${!hasPermission('groups','edit') && !hasPermission('groups','delete') ? `
        <span style="font-size:12px;color:var(--text-muted);padding:4px 0">Somente visualização</span>` : ''}
      </div>
    </div>`;
}

function openNewGroupModal() {
  document.getElementById('form-new-group').reset();
  document.getElementById('new-group-error').style.display = 'none';
  openModal('modal-new-group');
}

async function submitNewGroup() {
  const errorEl = document.getElementById('new-group-error');
  errorEl.style.display = 'none';
  const body = {
    groupname:   document.getElementById('ng-groupname').value.trim().toLowerCase().replace(/\s+/g, '_'),
    vlan_id:     parseInt(document.getElementById('ng-vlan').value),
    description: document.getElementById('ng-desc').value.trim() || null,
    color:       document.getElementById('ng-color').value,
  };
  if (!body.groupname || !body.vlan_id) {
    errorEl.textContent = 'Nome do grupo e VLAN ID são obrigatórios';
    errorEl.style.display = 'block'; return;
  }
  const btn = document.getElementById('btn-create-group');
  btn.disabled = true; btn.textContent = 'Criando...';
  try {
    await api.post('/groups', body);
    toast(`Grupo ${body.groupname} criado com sucesso`, 'success');
    closeModal('modal-new-group');
    loadGroupsPage();
  } catch (err) { errorEl.textContent = err.message; errorEl.style.display = 'block'; }
  finally { btn.disabled = false; btn.textContent = 'Criar Grupo'; }
}

function editGroup(g) {
  document.getElementById('eg-orig-name').value = g.groupname;
  document.getElementById('eg-groupname').value = g.groupname;
  document.getElementById('eg-vlan').value       = g.vlan_id;
  document.getElementById('eg-desc').value       = g.description || '';
  document.getElementById('eg-color').value      = g.color || '#6366f1';
  document.getElementById('eg-active').checked   = !!g.active;
  document.getElementById('edit-group-error').style.display = 'none';
  openModal('modal-edit-group');
}

async function submitEditGroup() {
  const origName = document.getElementById('eg-orig-name').value;
  const body = {
    vlan_id:     parseInt(document.getElementById('eg-vlan').value),
    description: document.getElementById('eg-desc').value.trim() || null,
    color:       document.getElementById('eg-color').value,
    active:      document.getElementById('eg-active').checked ? 1 : 0,
  };
  const btn = document.getElementById('btn-save-group');
  btn.disabled = true; btn.textContent = 'Salvando...';
  try {
    await api.put(`/groups/${origName}`, body);
    toast('Grupo atualizado com sucesso', 'success');
    closeModal('modal-edit-group');
    loadGroupsPage();
  } catch (err) {
    document.getElementById('edit-group-error').textContent = err.message;
    document.getElementById('edit-group-error').style.display = 'block';
  } finally { btn.disabled = false; btn.textContent = 'Salvar'; }
}

async function deleteGroup(groupname, userCount) {
  if (userCount > 0) { toast(`Mova os ${userCount} usuário(s) antes de remover o grupo`, 'error'); return; }
  if (!confirm(`Remover grupo "${groupname}"? Esta ação não pode ser desfeita.`)) return;
  try {
    await api.delete(`/groups/${groupname}`);
    toast(`Grupo ${groupname} removido`, 'info');
    loadGroupsPage();
  } catch (err) { toast(err.message, 'error'); }
}

// ─── SESSIONS PAGE ────────────────────────────────────────────
async function loadSessions() {
  const el = document.getElementById('sessions-content');
  el.innerHTML = '<div class="loading-overlay"><span class="spinner"></span></div>';
  try {
    const sessions = await api.get('/dashboard/sessions');
    if (!sessions.length) {
      el.innerHTML = '<div class="empty-state"><span class="icon">📡</span><p>Nenhuma sessão ativa no momento</p></div>';
      return;
    }
    el.innerHTML = `
      <div class="card">
        <div class="card-header">
          <span class="card-title"><span class="online-dot"></span>${sessions.length} sessão(ões) ativa(s)</span>
          <button class="btn btn-ghost btn-sm" onclick="loadSessions()">↺ Atualizar</button>
        </div>
        <div class="table-wrapper">
          <table>
            <thead><tr><th>Usuário</th><th>IP</th><th>MAC / Estação</th><th>AP / NAS</th><th>VLAN</th><th>Conectado há</th></tr></thead>
            <tbody>${sessions.map(s => `
              <tr>
                <td style="font-weight:600;font-family:var(--font-mono)">${s.username}</td>
                <td style="font-family:var(--font-mono);color:var(--accent)">${s.framedipaddress || '—'}</td>
                <td style="font-family:var(--font-mono);font-size:12px;color:var(--text-secondary)">${s.callingstationid || '—'}</td>
                <td style="font-family:var(--font-mono);font-size:12px">${s.nasipaddress}</td>
                <td>${vlanBadge(s.groupname, s.color, s.vlan_id)}</td>
                <td style="font-family:var(--font-mono);color:var(--green)">${fmtDuration(s.duration_min)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><span class="icon">⚠️</span><p>${err.message}</p></div>`;
  }
}

// ─── AUDIT PAGE ───────────────────────────────────────────────
let auditPage = 1;
async function loadAudit(page = 1) {
  auditPage = page;
  const el = document.getElementById('audit-content');
  el.innerHTML = '<div class="loading-overlay"><span class="spinner"></span></div>';
  try {
    const data = await api.get(`/dashboard/audit?page=${page}&limit=50`);
    el.innerHTML = `
      <div class="card">
        <div class="card-header"><span class="card-title">Log de Auditoria</span><span style="font-size:12px;color:var(--text-muted)">${data.total} registros</span></div>
        <div class="table-wrapper">
          <table>
            <thead><tr><th>Data/Hora</th><th>Admin</th><th>Ação</th><th>Tipo</th><th>Alvo</th><th>IP</th></tr></thead>
            <tbody>${data.logs.map(l => `<tr>
              <td style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted)">${fmtDate(l.created_at)}</td>
              <td style="font-weight:600">${l.admin_user}</td>
              <td><span class="audit-action">${l.action}</span></td>
              <td><span class="badge badge-gray">${l.target_type || '—'}</span></td>
              <td style="font-family:var(--font-mono);font-size:12px">${l.target_name || '—'}</td>
              <td style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted)">${l.ip_address || '—'}</td>
            </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div id="audit-pagination" class="pagination"></div>
      </div>`;
    renderPagination('audit-pagination', page, data.total, 50, p => loadAudit(p));
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><span class="icon">⚠️</span><p>${err.message}</p></div>`;
  }
}
