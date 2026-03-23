// ─── State ────────────────────────────────────────────────────
let currentPage = 'dashboard';
let groups = [];

// ─── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Login form
  document.getElementById('login-form').addEventListener('submit', handleLogin);

  // Try restore session
  const token = localStorage.getItem('rm_token');
  if (token) {
    try {
      await api.get('/auth/me');
      showApp();
      await loadGroups();
      navigate('dashboard');
    } catch {
      showLogin();
    }
  } else {
    showLogin();
  }

  // Sidebar nav
  document.querySelectorAll('.nav-item[data-page]').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.page));
  });

  // Logout
  document.getElementById('btn-logout').addEventListener('click', logout);
});

// ─── Login ────────────────────────────────────────────────────
async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl    = document.getElementById('login-error');
  const btn      = document.getElementById('login-btn');

  errEl.classList.remove('show');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  try {
    const data = await api.post('/auth/login', { username, password });
    localStorage.setItem('rm_token', data.token);
    localStorage.setItem('rm_user', JSON.stringify(data.user));
    showApp();
    await loadGroups();
    navigate('dashboard');
  } catch (err) {
    errEl.textContent = err.message || 'Erro ao fazer login';
    errEl.classList.add('show');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Entrar';
  }
}

function logout() {
  localStorage.removeItem('rm_token');
  localStorage.removeItem('rm_user');
  showLogin();
  document.getElementById('login-password').value = '';
}

// ─── Navigation ───────────────────────────────────────────────
async function navigate(page) {
  currentPage = page;
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
  document.querySelectorAll('.page').forEach(el => el.style.display = 'none');
  const target = document.getElementById(`page-${page}`);
  if (target) target.style.display = 'block';

  if (page === 'dashboard')  loadDashboard();
  if (page === 'users')      loadUsers();
  if (page === 'groups')     loadGroupsPage();
  if (page === 'sessions')   loadSessions();
  if (page === 'audit')      loadAudit();
  if (page === 'nas')        loadNas();
  if (page === 'settings')   loadSettings();
}

// ─── Load groups (for dropdowns) ─────────────────────────────
async function loadGroups() {
  try { groups = await api.get('/groups'); } catch { groups = []; }
}

function groupOptions(selected) {
  return groups
    .filter(g => g.active)
    .map(g => `<option value="${g.groupname}" ${g.groupname === selected ? 'selected' : ''}>
      ${g.groupname} — VLAN ${g.vlan_id}
    </option>`).join('');
}

// ─── DASHBOARD ────────────────────────────────────────────────
async function loadDashboard() {
  const el = document.getElementById('dashboard-content');
  el.innerHTML = '<div class="loading-overlay"><span class="spinner"></span></div>';

  try {
    const d = await api.get('/dashboard/stats');
    const t = d.totals;

    const maxSessions = Math.max(...(d.daily_activity.map(x => x.sessions)), 1);
    const barChart = d.daily_activity.map(x => {
      const h = Math.round((x.sessions / maxSessions) * 100);
      const date = new Date(x.day).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric' });
      return `<div class="mini-bar" style="height:${h}%" title="${date}: ${x.sessions} sessões"></div>`;
    }).join('');

    el.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card" style="--card-accent:var(--accent);--card-dim:var(--accent-dim)">
          <div class="stat-icon">👤</div>
          <div class="stat-value">${t.users}</div>
          <div class="stat-label">Total de usuários</div>
        </div>
        <div class="stat-card" style="--card-accent:var(--green);--card-dim:var(--green-dim)">
          <div class="stat-icon">✅</div>
          <div class="stat-value">${t.active_users}</div>
          <div class="stat-label">Usuários ativos</div>
        </div>
        <div class="stat-card" style="--card-accent:var(--red);--card-dim:var(--red-dim)">
          <div class="stat-icon">🚫</div>
          <div class="stat-value">${t.inactive_users}</div>
          <div class="stat-label">Usuários bloqueados</div>
        </div>
        <div class="stat-card" style="--card-accent:var(--yellow);--card-dim:var(--yellow-dim)">
          <div class="stat-icon">📡</div>
          <div class="stat-value">${t.online}</div>
          <div class="stat-label">Online agora (24h)</div>
        </div>
        <div class="stat-card" style="--card-accent:var(--purple);--card-dim:var(--purple-dim)">
          <div class="stat-icon">🔗</div>
          <div class="stat-value">${t.groups}</div>
          <div class="stat-label">Grupos / VLANs</div>
        </div>
        <div class="stat-card" style="--card-accent:var(--green);--card-dim:var(--green-dim)">
          <div class="stat-icon">📊</div>
          <div class="stat-value">${t.sessions_today}</div>
          <div class="stat-label">Sessões hoje</div>
        </div>
      </div>

      <div class="grid-2">
        <div class="card">
          <div class="card-header"><span class="card-title">Usuários por VLAN</span></div>
          <div class="card-body">
            ${d.users_by_group.map(g => `
              <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
                <div style="width:10px;height:10px;border-radius:50%;background:${g.color || '#6366f1'};flex-shrink:0"></div>
                <div style="flex:1">
                  <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px">
                    <span style="font-weight:600">${g.groupname}</span>
                    <span style="font-family:var(--font-mono);color:var(--text-secondary)">${g.active}/${g.total}</span>
                  </div>
                  <div style="height:5px;background:var(--border);border-radius:4px;overflow:hidden">
                    <div style="height:100%;width:${g.total > 0 ? Math.round(g.active/g.total*100) : 0}%;background:${g.color || '#6366f1'};border-radius:4px;transition:.4s"></div>
                  </div>
                </div>
                <span style="font-size:11px;color:var(--text-muted);font-family:var(--font-mono)">VLAN ${g.vlan_id}</span>
              </div>
            `).join('') || '<p style="color:var(--text-muted);text-align:center;padding:20px">Sem dados</p>'}
          </div>
        </div>

        <div class="card">
          <div class="card-header"><span class="card-title">Sessões — Últimos 7 dias</span></div>
          <div class="card-body" style="display:flex;flex-direction:column;gap:12px">
            <div class="mini-bar-chart">${barChart || '<span style="color:var(--text-muted);font-size:12px">Sem dados de sessões</span>'}</div>
            <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);font-family:var(--font-mono)">
              ${d.daily_activity.map(x => `<span>${new Date(x.day).toLocaleDateString('pt-BR',{weekday:'short'})}</span>`).join('') || ''}
            </div>
          </div>
        </div>
      </div>`;
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><span class="icon">⚠️</span><p>Erro ao carregar dashboard: ${err.message}</p></div>`;
  }
}
