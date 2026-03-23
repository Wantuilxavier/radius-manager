// ─── DEPARTMENTS PAGE ─────────────────────────────────────────
let _deptEditId = null;

async function loadDepartmentsPage() {
  const el = document.getElementById('departments-content');
  el.innerHTML = '<div class="loading-overlay"><span class="spinner"></span></div>';
  try {
    const depts = await api.get('/departments');
    renderDepartmentsTable(depts);
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><span class="icon">⚠️</span><p>${err.message}</p></div>`;
  }
}

function renderDepartmentsTable(depts) {
  const el = document.getElementById('departments-content');
  if (!depts.length) {
    el.innerHTML = `
      <div class="empty-state">
        <span class="icon" style="font-size:36px">🏢</span>
        <p>Nenhum departamento cadastrado</p>
        ${hasPermission('departments','create') ? `<button class="btn btn-primary btn-sm" onclick="openNewDeptModal()"><svg><use href="#ic-plus"/></svg> Criar primeiro departamento</button>` : ''}
      </div>`;
    return;
  }

  el.innerHTML = `
    <div class="card">
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Descrição</th>
              <th>Usuários</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            ${depts.map(d => `
              <tr>
                <td style="font-weight:600">${d.name}</td>
                <td style="font-size:13px;color:var(--text-secondary)">${d.description || '—'}</td>
                <td>
                  <span style="font-size:13px;font-family:var(--font-mono);color:${d.user_count > 0 ? 'var(--accent)' : 'var(--text-muted)'}">
                    ${d.user_count} usuário${d.user_count !== 1 ? 's' : ''}
                  </span>
                </td>
                <td>
                  ${d.active
                    ? '<span class="badge badge-green">Ativo</span>'
                    : '<span class="badge badge-red">Inativo</span>'}
                </td>
                <td>
                  <div style="display:flex;gap:4px">
                    ${hasPermission('departments','edit') ? `
                    <button class="btn btn-ghost btn-sm btn-icon" title="Editar" onclick='openEditDeptModal(${JSON.stringify(d)})'>
                      <svg><use href="#ic-edit"/></svg>
                    </button>` : ''}
                    ${hasPermission('departments','delete') ? `
                    <button class="btn btn-danger btn-sm btn-icon" title="Remover" onclick="deleteDept(${d.id},'${d.name}',${d.user_count})">
                      <svg><use href="#ic-trash"/></svg>
                    </button>` : ''}
                  </div>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

function openNewDeptModal() {
  _deptEditId = null;
  document.getElementById('dept-modal-title').textContent = 'Novo Departamento';
  document.getElementById('dept-id-val').value = '';
  document.getElementById('dept-name').value   = '';
  document.getElementById('dept-desc').value   = '';
  document.getElementById('dept-error').style.display = 'none';
  const btn = document.getElementById('btn-save-dept');
  btn.innerHTML = '<svg><use href="#ic-plus"/></svg> Criar';
  openModal('modal-new-dept');
}

function openEditDeptModal(d) {
  _deptEditId = d.id;
  document.getElementById('dept-modal-title').textContent = `Editar: ${d.name}`;
  document.getElementById('dept-id-val').value = d.id;
  document.getElementById('dept-name').value   = d.name;
  document.getElementById('dept-desc').value   = d.description || '';
  document.getElementById('dept-error').style.display = 'none';
  const btn = document.getElementById('btn-save-dept');
  btn.innerHTML = '<svg><use href="#ic-check"/></svg> Salvar';
  openModal('modal-new-dept');
}

async function submitDept() {
  const errEl = document.getElementById('dept-error');
  errEl.style.display = 'none';

  const name = document.getElementById('dept-name').value.trim();
  const desc = document.getElementById('dept-desc').value.trim() || null;

  if (!name) {
    errEl.querySelector('#dept-error-msg') ? null : null;
    errEl.textContent = 'Nome do departamento é obrigatório';
    errEl.style.display = 'block'; return;
  }

  const btn = document.getElementById('btn-save-dept');
  btn.disabled = true;

  try {
    if (_deptEditId) {
      await api.put(`/departments/${_deptEditId}`, { name, description: desc, active: 1 });
      toast(`Departamento "${name}" atualizado`, 'success');
    } else {
      await api.post('/departments', { name, description: desc });
      toast(`Departamento "${name}" criado`, 'success');
    }
    closeModal('modal-new-dept');
    loadDepartmentsPage();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false;
  }
}

async function deleteDept(id, name, userCount) {
  if (userCount > 0) {
    toast(`${userCount} usuário(s) vinculado(s). Reatribua-os antes de remover.`, 'error');
    return;
  }
  if (!confirm(`Remover departamento "${name}" permanentemente?`)) return;
  try {
    await api.delete(`/departments/${id}`);
    toast(`Departamento "${name}" removido`, 'info');
    loadDepartmentsPage();
  } catch (err) { toast(err.message, 'error'); }
}

// Carrega lista de departamentos ativos para os selects dos formulários de usuário
let _departmentsList = [];
async function loadDepartmentOptions() {
  try {
    const depts = await api.get('/departments');
    _departmentsList = depts.filter(d => d.active);
  } catch { _departmentsList = []; }
}

function departmentOptions(selected) {
  const opts = _departmentsList.map(d =>
    `<option value="${d.name}" ${d.name === selected ? 'selected' : ''}>${d.name}</option>`
  ).join('');
  return `<option value="">— Selecione —</option>${opts}`;
}
