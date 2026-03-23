// ─── State ────────────────────────────────────────────────────
let currentPage = 'dashboard';
let groups = [];

// ─── Page meta ────────────────────────────────────────────────
const PAGE_META = {
  dashboard: 'Dashboard',
  users:     'Usuários',
  groups:    'Grupos / VLANs',
  sessions:  'Sessões Ativas',
  audit:     'Log de Auditoria',
  nas:       'Dispositivos NAS',
  settings:  'Configurações',
};

// ─── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Theme init
  initTheme();

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

// ─── Theme ────────────────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem('rm_theme') || 'dark';
  applyTheme(saved);

  // Sidebar toggle
  const sidebarBtn = document.getElementById('theme-toggle-btn');
  if (sidebarBtn) sidebarBtn.addEventListener('click', toggleTheme);

  // Topbar toggle
  const topbarBtn = document.getElementById('topbar-theme-btn');
  if (topbarBtn) topbarBtn.addEventListener('click', toggleTheme);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('rm_theme', theme);

  // Update icons & labels
  const isDark = theme === 'dark';
  const iconHref = isDark ? '#ic-sun' : '#ic-moon';
  const label = isDark ? 'Tema claro' : 'Tema escuro';

  const sidebarIcon = document.getElementById('theme-icon');
  const sidebarLabel = document.getElementById('theme-label');
  const topbarIcon = document.getElementById('topbar-theme-icon');

  if (sidebarIcon) sidebarIcon.querySelector('use').setAttribute('href', iconHref);
  if (sidebarLabel) sidebarLabel.textContent = label;
  if (topbarIcon) topbarIcon.querySelector('use').setAttribute('href', iconHref);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

// ─── Login ────────────────────────────────────────────────────
async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl    = document.getElementById('login-error');
  const errMsg   = document.getElementById('login-error-msg');
  const btn      = document.getElementById('login-btn');

  errEl.classList.remove('show');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Entrando…';

  try {
    const data = await api.post('/auth/login', { username, password });
    localStorage.setItem('rm_token', data.token);
    localStorage.setItem('rm_user', JSON.stringify(data.user));
    showApp();
    await loadGroups();
    navigate('dashboard');
  } catch (err) {
    if (errMsg) errMsg.textContent = err.message || 'Erro ao fazer login';
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

  // Update nav active states
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });

  // Show target page, hide others
  document.querySelectorAll('.page').forEach(el => el.style.display = 'none');
  const target = document.getElementById(`page-${page}`);
  if (target) target.style.display = 'flex';

  // Update topbar breadcrumb
  const topbarPage = document.getElementById('topbar-page');
  if (topbarPage) topbarPage.textContent = PAGE_META[page] || page;

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
  el.innerHTML = '<div class="loading-overlay"><span class="spinner"></span> Carregando...</div>';

  try {
    const d = await api.get('/dashboard/stats');
    const t = d.totals;

    const maxSessions = Math.max(...(d.daily_activity.map(x => x.sessions)), 1);

    const barChart = d.daily_activity.map(x => {
      const h = Math.max(Math.round((x.sessions / maxSessions) * 100), 4);
      const date = new Date(x.day).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric' });
      return `<div class="mini-bar" style="height:${h}%" title="${date}: ${x.sessions} sessões"></div>`;
    }).join('');

    const chartLabels = d.daily_activity.map(x =>
      `<span>${new Date(x.day).toLocaleDateString('pt-BR',{weekday:'short'})}</span>`
    ).join('');

    const vlanRows = d.users_by_group.map(g => {
      const pct = g.total > 0 ? Math.round(g.active / g.total * 100) : 0;
      const color = g.color || '#6366f1';
      return `
        <div class="vlan-progress-item">
          <div class="vlan-progress-dot" style="background:${color}"></div>
          <div class="vlan-progress-info">
            <div class="vlan-progress-label">
              <span>${g.groupname}</span>
              <span>${g.active}/${g.total} ativos</span>
            </div>
            <div class="vlan-progress-bar">
              <div class="vlan-progress-fill" style="width:${pct}%;background:${color}"></div>
            </div>
          </div>
          <span class="vlan-id-tag">VLAN ${g.vlan_id}</span>
        </div>`;
    }).join('') || '<p style="color:var(--text-muted);text-align:center;padding:20px 0;font-size:13px">Nenhum grupo cadastrado</p>';

    el.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card" style="--card-accent:var(--accent);--card-dim:var(--accent-dim)">
          <div class="stat-card-top">
            <div class="stat-icon-wrap">
              <svg><use href="#ic-users"/></svg>
            </div>
          </div>
          <div class="stat-value">${t.users}</div>
          <div class="stat-label">Total de usuários</div>
        </div>

        <div class="stat-card" style="--card-accent:var(--green);--card-dim:var(--green-dim)">
          <div class="stat-card-top">
            <div class="stat-icon-wrap">
              <svg><use href="#ic-user-check"/></svg>
            </div>
          </div>
          <div class="stat-value">${t.active_users}</div>
          <div class="stat-label">Usuários ativos</div>
        </div>

        <div class="stat-card" style="--card-accent:var(--red);--card-dim:var(--red-dim)">
          <div class="stat-card-top">
            <div class="stat-icon-wrap">
              <svg><use href="#ic-user-x"/></svg>
            </div>
          </div>
          <div class="stat-value">${t.inactive_users}</div>
          <div class="stat-label">Usuários bloqueados</div>
        </div>

        <div class="stat-card" style="--card-accent:var(--yellow);--card-dim:var(--yellow-dim)">
          <div class="stat-card-top">
            <div class="stat-icon-wrap">
              <svg><use href="#ic-wifi"/></svg>
            </div>
          </div>
          <div class="stat-value">${t.online}</div>
          <div class="stat-label">Online agora</div>
        </div>

        <div class="stat-card" style="--card-accent:var(--purple);--card-dim:var(--purple-dim)">
          <div class="stat-card-top">
            <div class="stat-icon-wrap">
              <svg><use href="#ic-network"/></svg>
            </div>
          </div>
          <div class="stat-value">${t.groups}</div>
          <div class="stat-label">Grupos / VLANs</div>
        </div>

        <div class="stat-card" style="--card-accent:var(--blue);--card-dim:var(--blue-dim)">
          <div class="stat-card-top">
            <div class="stat-icon-wrap">
              <svg><use href="#ic-barchart"/></svg>
            </div>
          </div>
          <div class="stat-value">${t.sessions_today}</div>
          <div class="stat-label">Sessões hoje</div>
        </div>
      </div>

      <div class="grid-2">
        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">Usuários por VLAN</div>
              <div class="card-subtitle">Distribuição e taxa de ativação por grupo</div>
            </div>
          </div>
          <div class="card-body">${vlanRows}</div>
        </div>

        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">Sessões — Últimos 7 dias</div>
              <div class="card-subtitle">Volume de autenticações RADIUS diárias</div>
            </div>
          </div>
          <div class="card-body">
            <div class="mini-bar-chart">
              ${barChart || '<span style="color:var(--text-muted);font-size:12px;align-self:center">Sem dados de sessões</span>'}
            </div>
            <div class="chart-labels">${chartLabels}</div>
          </div>
        </div>
      </div>`;

  } catch (err) {
    el.innerHTML = `
      <div class="empty-state">
        <svg><use href="#ic-alert"/></svg>
        <p>Erro ao carregar dashboard<br><span style="font-size:12px;font-family:var(--font-mono)">${err.message}</span></p>
      </div>`;
  }
}
