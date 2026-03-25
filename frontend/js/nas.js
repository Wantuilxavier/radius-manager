// ─── NAS PAGE ─────────────────────────────────────────────────
async function loadNas() {
  const el = document.getElementById('nas-content');
  el.innerHTML = '<div class="loading-overlay"><span class="spinner"></span></div>';

  try {
    const devices = await api.get('/nas');

    if (!devices.length) {
      el.innerHTML = `
        <div class="empty-state">
          <span class="icon">🖧</span>
          <p>Nenhum dispositivo NAS cadastrado</p>
          ${hasPermission('nas','create') ? `<button class="btn btn-primary" style="margin-top:16px" onclick="openNewNasModal()">＋ Cadastrar primeiro dispositivo</button>` : ''}
        </div>`;
      return;
    }

    el.innerHTML = `
      <div class="card">
        <div class="card-header">
          <span class="card-title">Dispositivos cadastrados</span>
          <span style="font-size:12px;color:var(--text-muted)">${devices.length} dispositivo(s)</span>
        </div>
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>IP / Hostname</th>
                <th>Nome</th>
                <th>Tipo</th>
                <th>Secret</th>
                <th>Online agora</th>
                <th>Descrição</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              ${devices.map(d => `
                <tr>
                  <td style="font-family:var(--font-mono);font-weight:600;color:var(--accent)">${d.nasname}</td>
                  <td style="font-weight:600">${d.shortname || '—'}</td>
                  <td><span class="badge badge-gray">${d.type || 'other'}</span></td>
                  <td>
                    <span class="secret-masked" data-secret="${d.secret}" style="font-family:var(--font-mono);font-size:12px;cursor:pointer;color:var(--text-muted)" onclick="toggleSecret(this)" title="Clique para revelar">
                      ••••••••••••
                    </span>
                  </td>
                  <td>
                    ${d.online_count > 0
                      ? `<span style="color:var(--green);font-family:var(--font-mono)"><span class="online-dot"></span>${d.online_count}</span>`
                      : '<span style="color:var(--text-muted)">0</span>'
                    }
                  </td>
                  <td style="color:var(--text-secondary);font-size:13px">${d.description || '—'}</td>
                  <td>
                    <div style="display:flex;gap:6px">
                      <button class="btn btn-ghost btn-sm" onclick='editNas(${JSON.stringify(d)})'>Editar</button>
                      <button class="btn btn-danger btn-sm" onclick="deleteNas(${d.id}, '${d.shortname || d.nasname}')">✕</button>
                    </div>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card" style="margin-top:16px">
        <div class="card-header"><span class="card-title">ℹ️ Como configurar o Access Point</span></div>
        <div class="card-body" style="font-size:13px;color:var(--text-secondary);line-height:1.8">
          <p>Configure seu AP / switch com os seguintes parâmetros:</p>
          <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-sm);padding:16px;margin-top:12px;font-family:var(--font-mono);font-size:12px;line-height:2">
            Modo de autenticação: <strong style="color:var(--accent)">WPA2-Enterprise / 802.1X</strong><br>
            Servidor RADIUS Auth:  <strong style="color:var(--accent)">IP_DESTE_SERVIDOR : 1812 UDP</strong><br>
            Servidor RADIUS Acct:  <strong style="color:var(--accent)">IP_DESTE_SERVIDOR : 1813 UDP</strong><br>
            Shared Secret:         <strong style="color:var(--yellow)">o mesmo cadastrado acima</strong><br>
            VLAN dinâmica:         <strong style="color:var(--green)">Tunnel-Private-Group-Id (automático)</strong>
          </div>
        </div>
      </div>`;
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><span class="icon">⚠️</span><p>Erro ao carregar: ${err.message}</p></div>`;
  }
}

function toggleSecret(el) {
  const secret = el.dataset.secret;
  if (el.textContent.includes('•')) {
    el.textContent = secret;
    el.style.color = 'var(--text-primary)';
  } else {
    el.textContent = '••••••••••••';
    el.style.color = 'var(--text-muted)';
  }
}

// ─── New NAS ──────────────────────────────────────────────────
function openNewNasModal() {
  document.getElementById('nas-ip').value        = '';
  document.getElementById('nas-shortname').value = '';
  document.getElementById('nas-type').value      = 'other';
  document.getElementById('nas-ports').value     = '';
  document.getElementById('nas-secret').value    = '';
  document.getElementById('nas-desc').value      = '';
  document.getElementById('new-nas-error').style.display = 'none';
  openModal('modal-new-nas');
}

async function submitNewNas() {
  const errEl = document.getElementById('new-nas-error');
  errEl.style.display = 'none';

  const body = {
    nasname:     document.getElementById('nas-ip').value.trim(),
    shortname:   document.getElementById('nas-shortname').value.trim() || null,
    type:        document.getElementById('nas-type').value,
    ports:       parseInt(document.getElementById('nas-ports').value) || null,
    secret:      document.getElementById('nas-secret').value.trim(),
    description: document.getElementById('nas-desc').value.trim() || null,
  };

  if (!body.nasname || !body.secret) {
    errEl.textContent = 'IP/Hostname e Secret são obrigatórios';
    errEl.style.display = 'block';
    return;
  }

  const btn = document.getElementById('btn-create-nas');
  btn.disabled = true; btn.textContent = 'Cadastrando...';

  try {
    await api.post('/nas', body);
    toast(`Dispositivo ${body.nasname} cadastrado com sucesso`, 'success');
    closeModal('modal-new-nas');
    loadNas();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false; btn.textContent = 'Cadastrar';
  }
}

// ─── Edit NAS ─────────────────────────────────────────────────
function editNas(d) {
  document.getElementById('edit-nas-id').value        = d.id;
  document.getElementById('edit-nas-ip').value        = d.nasname;
  document.getElementById('edit-nas-shortname').value = d.shortname || '';
  document.getElementById('edit-nas-type').value      = d.type || 'other';
  document.getElementById('edit-nas-ports').value     = d.ports || '';
  document.getElementById('edit-nas-secret').value    = d.secret;
  document.getElementById('edit-nas-desc').value      = d.description || '';
  document.getElementById('edit-nas-error').style.display = 'none';
  openModal('modal-edit-nas');
}

async function submitEditNas() {
  const id    = document.getElementById('edit-nas-id').value;
  const errEl = document.getElementById('edit-nas-error');
  errEl.style.display = 'none';

  const body = {
    nasname:     document.getElementById('edit-nas-ip').value.trim(),
    shortname:   document.getElementById('edit-nas-shortname').value.trim() || null,
    type:        document.getElementById('edit-nas-type').value,
    ports:       parseInt(document.getElementById('edit-nas-ports').value) || null,
    secret:      document.getElementById('edit-nas-secret').value.trim(),
    description: document.getElementById('edit-nas-desc').value.trim() || null,
  };

  if (!body.nasname || !body.secret) {
    errEl.textContent = 'IP/Hostname e Secret são obrigatórios';
    errEl.style.display = 'block';
    return;
  }

  const btn = document.getElementById('btn-save-nas');
  btn.disabled = true; btn.textContent = 'Salvando...';

  try {
    await api.put(`/nas/${id}`, body);
    toast('Dispositivo atualizado com sucesso', 'success');
    closeModal('modal-edit-nas');
    loadNas();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false; btn.textContent = 'Salvar';
  }
}

// ─── Delete NAS ───────────────────────────────────────────────
async function deleteNas(id, name) {
  if (!confirm(`Remover o dispositivo "${name}"?\nOs Access Points usando este registro não conseguirão mais autenticar.`)) return;
  try {
    await api.delete(`/nas/${id}`);
    toast(`Dispositivo ${name} removido`, 'info');
    loadNas();
  } catch (err) {
    toast(err.message, 'error');
  }
}
