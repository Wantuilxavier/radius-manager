// ─── DEVICES PAGE ─────────────────────────────────────────────
let devicesState = { search: '', device_type: '', active: '' };

const DEVICE_TYPE_LABELS = {
  printer:  'Impressora',
  camera:   'Câmera IP',
  tv:       'Smart TV',
  iot:      'IoT / Sensor',
  console:  'Console / Videogame',
  voip:     'Telefone VoIP',
  other:    'Outro',
};

function deviceTypeLabel(t) {
  return DEVICE_TYPE_LABELS[t] || t || 'Outro';
}

function deviceTypeIcon(t) {
  const icons = {
    printer: '🖨️', camera: '📷', tv: '📺',
    iot: '🔌', console: '🎮', voip: '📞', other: '📡',
  };
  return icons[t] || '📡';
}

async function loadDevices() {
  const el = document.getElementById('devices-content');
  el.innerHTML = '<div class="loading-overlay"><span class="spinner"></span></div>';

  try {
    const q = new URLSearchParams({
      ...(devicesState.search      && { search:      devicesState.search }),
      ...(devicesState.device_type && { device_type: devicesState.device_type }),
      ...(devicesState.active !== '' && { active:    devicesState.active }),
    });
    const devices = await api.get(`/devices?${q}`);
    renderDevicesPage(devices);
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><span class="icon">⚠️</span><p>Erro ao carregar: ${err.message}</p></div>`;
  }
}

function renderDevicesPage(devices) {
  const el = document.getElementById('devices-content');

  const toolbar = `
    <div class="card" style="margin-bottom:16px">
      <div class="card-header">
        <div class="toolbar">
          <div class="search-box">
            <svg><use href="#ic-search"/></svg>
            <input id="search-devices" class="form-input" type="text" placeholder="Buscar por MAC, nome, descrição..."
              value="${devicesState.search}" oninput="handleDeviceSearch(this.value)">
          </div>
          <select id="filter-device-type" class="form-select" style="width:180px" onchange="devicesState.device_type=this.value;loadDevices()">
            <option value="">Todos os tipos</option>
            ${Object.entries(DEVICE_TYPE_LABELS).map(([v,l]) => `<option value="${v}" ${devicesState.device_type===v?'selected':''}>${l}</option>`).join('')}
          </select>
          <select id="filter-device-active" class="form-select" style="width:150px" onchange="devicesState.active=this.value;loadDevices()">
            <option value="">Todos os status</option>
            <option value="1" ${devicesState.active==='1'?'selected':''}>Somente ativos</option>
            <option value="0" ${devicesState.active==='0'?'selected':''}>Somente bloqueados</option>
          </select>
        </div>
        <span style="font-size:12px;color:var(--text-muted);white-space:nowrap;flex-shrink:0">${devices.length} dispositivo(s)</span>
      </div>
    </div>`;

  if (!devices.length) {
    el.innerHTML = toolbar + `
      <div class="empty-state">
        <span class="icon">📡</span>
        <p>Nenhum dispositivo MAC cadastrado</p>
        ${hasPermission('devices','create') ? `<button class="btn btn-primary" style="margin-top:16px" onclick="openNewDeviceModal()">＋ Cadastrar primeiro dispositivo</button>` : ''}
      </div>`;
    return;
  }

  const rows = devices.map(d => {
    const statusBadge = d.active
      ? '<span class="badge badge-green"><span class="badge-dot badge-dot-pulse"></span>Ativo</span>'
      : '<span class="badge badge-red">Bloqueado</span>';

    return `
      <tr>
        <td style="text-align:center;font-size:20px;width:40px">${deviceTypeIcon(d.device_type)}</td>
        <td>
          <div style="font-family:var(--font-mono);font-weight:600;letter-spacing:.04em">${d.mac.toUpperCase()}</div>
          ${d.alias ? `<div style="font-size:12px;color:var(--text-secondary)">${d.alias}</div>` : ''}
        </td>
        <td style="font-size:13px">${deviceTypeLabel(d.device_type)}</td>
        <td>${d.groupname ? vlanBadge(d.groupname, d.vlan_color, d.vlan_id) : '<span style="color:var(--text-muted);font-size:12px">—</span>'}</td>
        <td>${statusBadge}</td>
        <td style="font-size:12px;color:var(--text-muted)">${d.description || '—'}</td>
        <td style="font-size:12px;color:var(--text-muted);font-family:var(--font-mono)">${fmtDate(d.created_at)}</td>
        <td>
          <div style="display:flex;gap:4px">
            ${hasPermission('devices','edit') ? `
            <button class="btn btn-ghost btn-sm btn-icon" title="Editar" onclick='editDevice(${JSON.stringify(d)})'>
              <svg><use href="#ic-edit"/></svg>
            </button>` : ''}
            ${hasPermission('devices','toggle') ? `
            <button class="btn btn-sm btn-icon ${d.active ? 'btn-danger' : 'btn-success'}" title="${d.active ? 'Bloquear' : 'Ativar'}"
              onclick="toggleDevice('${d.mac}', '${(d.alias || d.mac).replace(/'/g, "\\'")}', ${d.active})">
              <svg><use href="#ic-power"/></svg>
            </button>` : ''}
            ${hasPermission('devices','delete') ? `
            <button class="btn btn-danger btn-sm btn-icon" title="Remover" onclick="deleteDevice('${d.mac}', '${(d.alias || d.mac).replace(/'/g, "\\'")}')">
              <svg><use href="#ic-trash"/></svg>
            </button>` : ''}
          </div>
        </td>
      </tr>`;
  }).join('');

  el.innerHTML = toolbar + `
    <div class="card">
      <div class="card-header">
        <span class="card-title">Dispositivos cadastrados por MAC</span>
      </div>
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>MAC Address</th>
              <th>Tipo</th>
              <th>Grupo / VLAN</th>
              <th>Status</th>
              <th>Descrição</th>
              <th>Cadastrado em</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="card-header"><span class="card-title">ℹ️ Como funciona o cadastro por MAC (MAB)</span></div>
      <div class="card-body" style="font-size:13px;color:var(--text-secondary);line-height:1.8">
        <p>O <strong>MAC Authentication Bypass (MAB)</strong> permite que dispositivos sem suporte a 802.1X (impressoras, câmeras, Smart TVs) se autentiquem na rede usando o próprio endereço MAC como credencial.</p>
        <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-sm);padding:16px;margin-top:12px;font-family:var(--font-mono);font-size:12px;line-height:2">
          Username RADIUS: <strong style="color:var(--accent)">aa:bb:cc:dd:ee:ff</strong> (MAC em minúsculas)<br>
          Password RADIUS: <strong style="color:var(--accent)">aa:bb:cc:dd:ee:ff</strong> (mesmo valor)<br>
          Autenticação:    <strong style="color:var(--green)">FreeRADIUS verifica via tabela radcheck</strong><br>
          VLAN atribuída:  <strong style="color:var(--yellow)">conforme grupo selecionado no cadastro</strong>
        </div>
        <p style="margin-top:12px">Configure o Access Point para habilitar MAB na porta/SSID desejada.</p>
      </div>
    </div>`;
}

let _deviceSearchTimer;
function handleDeviceSearch(val) {
  clearTimeout(_deviceSearchTimer);
  _deviceSearchTimer = setTimeout(() => { devicesState.search = val; loadDevices(); }, 350);
}

// ─── New Device ───────────────────────────────────────────────
function openNewDeviceModal() {
  document.getElementById('new-device-mac').value = '';
  document.getElementById('new-device-alias').value = '';
  document.getElementById('new-device-type').value = 'other';
  document.getElementById('new-device-group').innerHTML = groupOptions('');
  document.getElementById('new-device-desc').value = '';
  document.getElementById('new-device-error').style.display = 'none';
  openModal('modal-new-device');
}

async function submitNewDevice() {
  const errEl = document.getElementById('new-device-error');
  errEl.style.display = 'none';

  const body = {
    mac:         document.getElementById('new-device-mac').value.trim(),
    alias:       document.getElementById('new-device-alias').value.trim() || null,
    device_type: document.getElementById('new-device-type').value,
    groupname:   document.getElementById('new-device-group').value,
    description: document.getElementById('new-device-desc').value.trim() || null,
  };

  if (!body.mac || !body.groupname) {
    errEl.textContent = 'MAC address e grupo são obrigatórios';
    errEl.style.display = 'block';
    return;
  }

  const btn = document.getElementById('btn-create-device');
  btn.disabled = true; btn.textContent = 'Cadastrando...';

  try {
    const r = await api.post('/devices', body);
    toast(`Dispositivo ${r.mac.toUpperCase()} cadastrado com sucesso`, 'success');
    closeModal('modal-new-device');
    loadDevices();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false; btn.textContent = 'Cadastrar';
  }
}

// ─── Edit Device ──────────────────────────────────────────────
function editDevice(d) {
  document.getElementById('edit-device-mac-val').value  = d.mac;
  document.getElementById('edit-device-mac-show').textContent = d.mac.toUpperCase();
  document.getElementById('edit-device-alias').value   = d.alias || '';
  document.getElementById('edit-device-type').value    = d.device_type || 'other';
  document.getElementById('edit-device-group').innerHTML = groupOptions(d.groupname || '');
  document.getElementById('edit-device-desc').value    = d.description || '';
  document.getElementById('edit-device-error').style.display = 'none';
  openModal('modal-edit-device');
}

async function submitEditDevice() {
  const mac   = document.getElementById('edit-device-mac-val').value;
  const errEl = document.getElementById('edit-device-error');
  errEl.style.display = 'none';

  const body = {
    alias:       document.getElementById('edit-device-alias').value.trim() || null,
    device_type: document.getElementById('edit-device-type').value,
    groupname:   document.getElementById('edit-device-group').value,
    description: document.getElementById('edit-device-desc').value.trim() || null,
  };

  const btn = document.getElementById('btn-save-device');
  btn.disabled = true; btn.textContent = 'Salvando...';

  try {
    await api.put(`/devices/${encodeURIComponent(mac)}`, body);
    toast('Dispositivo atualizado com sucesso', 'success');
    closeModal('modal-edit-device');
    loadDevices();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false; btn.textContent = 'Salvar';
  }
}

// ─── Toggle Device ────────────────────────────────────────────
async function toggleDevice(mac, alias, currentActive) {
  if (currentActive && !confirm(`Bloquear "${alias}"?\nO dispositivo não conseguirá autenticar na rede.`)) return;
  try {
    const r = await api.patch(`/devices/${encodeURIComponent(mac)}/toggle`, {});
    toast(`Dispositivo ${r.active ? 'habilitado' : 'bloqueado'} com sucesso`, r.active ? 'success' : 'info');
    loadDevices();
  } catch (err) { toast(err.message, 'error'); }
}

// ─── Delete Device ────────────────────────────────────────────
async function deleteDevice(mac, alias) {
  if (!confirm(`Remover o dispositivo "${alias}" (${mac.toUpperCase()})?\nEsta ação não pode ser desfeita.`)) return;
  try {
    await api.delete(`/devices/${encodeURIComponent(mac)}`);
    toast(`Dispositivo ${mac.toUpperCase()} removido`, 'info');
    loadDevices();
  } catch (err) { toast(err.message, 'error'); }
}
