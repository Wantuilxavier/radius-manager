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
      const me = await api.get('/auth/me');
      // Atualiza user e permissões com dados frescos do servidor
      if (me.user) localStorage.setItem('rm_user', JSON.stringify(me.user));
      savePermissions(me.permissions);
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

  // ── Mobile sidebar toggle ──────────────────────────────────
  const menuBtn      = document.getElementById('topbar-menu-btn');
  const sidebarEl    = document.querySelector('.sidebar');
  const overlayEl    = document.getElementById('sidebar-overlay');

  function openMobileSidebar() {
    sidebarEl?.classList.add('sidebar-open');
    overlayEl?.classList.add('visible');
    document.body.style.overflow = 'hidden';
  }
  function closeMobileSidebar() {
    sidebarEl?.classList.remove('sidebar-open');
    overlayEl?.classList.remove('visible');
    document.body.style.overflow = '';
  }

  menuBtn?.addEventListener('click', () => {
    sidebarEl?.classList.contains('sidebar-open') ? closeMobileSidebar() : openMobileSidebar();
  });
  overlayEl?.addEventListener('click', closeMobileSidebar);

  // Close sidebar when navigating on mobile
  document.querySelectorAll('.nav-item[data-page]').forEach(el => {
    el.addEventListener('click', closeMobileSidebar);
  });
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
    savePermissions(data.permissions);
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
  localStorage.removeItem('rm_permissions');
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

  // Mostra/esconde botões de ação das páginas conforme permissão
  _applyPagePermissions(page);

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

// ─── Aplica visibilidade de botões conforme permissões ─────────
function _applyPagePermissions(page) {
  // Botão "Novo Usuário"
  const btnNewUser = document.querySelector('#page-users .btn-primary[onclick="createUser()"]');
  if (btnNewUser) btnNewUser.style.display = hasPermission('users', 'create') ? '' : 'none';

  // Botão "Nova VLAN"
  const btnNewGroup = document.querySelector('#page-groups .btn-primary[onclick="openNewGroupModal()"]');
  if (btnNewGroup) btnNewGroup.style.display = hasPermission('groups', 'create') ? '' : 'none';

  // Botão "Novo NAS"
  const btnNewNas = document.getElementById('btn-new-nas');
  if (btnNewNas) btnNewNas.style.display = hasPermission('nas', 'create') ? '' : 'none';

  // Botão "Novo Admin" (somente superadmin vê settings)
  const btnNewAdmin = document.querySelector('#page-settings .btn-primary[onclick="openNewAdminModal()"]');
  if (btnNewAdmin) {
    const u = currentUser();
    btnNewAdmin.style.display = (u?.role === 'superadmin') ? '' : 'none';
  }
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

    // Dados para Chart.js
    const activityLabels = d.daily_activity.map(x =>
      new Date(x.day).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric' })
    );
    const activityData = d.daily_activity.map(x => x.sessions);

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
          <div class="stat-card-inner">
            <div class="stat-card-top">
              <div class="stat-icon-wrap"><svg><use href="#ic-users"/></svg></div>
            </div>
            <div class="stat-value">${t.users}</div>
            <div class="stat-label">Total de usuários</div>
          </div>
        </div>

        <div class="stat-card" style="--card-accent:var(--green);--card-dim:var(--green-dim)">
          <div class="stat-card-inner">
            <div class="stat-card-top">
              <div class="stat-icon-wrap"><svg><use href="#ic-user-check"/></svg></div>
            </div>
            <div class="stat-value">${t.active_users}</div>
            <div class="stat-label">Usuários ativos</div>
          </div>
        </div>

        <div class="stat-card" style="--card-accent:var(--red);--card-dim:var(--red-dim)">
          <div class="stat-card-inner">
            <div class="stat-card-top">
              <div class="stat-icon-wrap"><svg><use href="#ic-user-x"/></svg></div>
            </div>
            <div class="stat-value">${t.inactive_users}</div>
            <div class="stat-label">Bloqueados</div>
          </div>
        </div>

        <div class="stat-card" style="--card-accent:var(--yellow);--card-dim:var(--yellow-dim)">
          <div class="stat-card-inner">
            <div class="stat-card-top">
              <div class="stat-icon-wrap"><svg><use href="#ic-wifi"/></svg></div>
            </div>
            <div class="stat-value">${t.online}</div>
            <div class="stat-label">Online agora</div>
          </div>
        </div>

        <div class="stat-card" style="--card-accent:var(--purple);--card-dim:var(--purple-dim)">
          <div class="stat-card-inner">
            <div class="stat-card-top">
              <div class="stat-icon-wrap"><svg><use href="#ic-network"/></svg></div>
            </div>
            <div class="stat-value">${t.groups}</div>
            <div class="stat-label">Grupos / VLANs</div>
          </div>
        </div>

        <div class="stat-card" style="--card-accent:var(--blue);--card-dim:var(--blue-dim)">
          <div class="stat-card-inner">
            <div class="stat-card-top">
              <div class="stat-icon-wrap"><svg><use href="#ic-barchart"/></svg></div>
            </div>
            <div class="stat-value">${t.sessions_today}</div>
            <div class="stat-label">Sessões hoje</div>
          </div>
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
            <div class="chartjs-wrap">
              <canvas id="sessions-chart"></canvas>
            </div>
          </div>
        </div>
      </div>`;

    // ── Chart.js — Gráfico de barras de sessões ──────────────
    const canvas = document.getElementById('sessions-chart');
    if (canvas && typeof Chart !== 'undefined') {
      const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
      const gridColor  = isDark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.05)';
      const tickColor  = isDark ? '#4A5568' : '#94A3B8';
      const barColor   = isDark ? 'rgba(99,102,241,.55)' : 'rgba(99,102,241,.45)';
      const borderColor = '#6366F1';

      new Chart(canvas, {
        type: 'bar',
        data: {
          labels: activityLabels,
          datasets: [{
            data: activityData,
            backgroundColor: barColor,
            borderColor: borderColor,
            borderWidth: 1.5,
            borderRadius: 6,
            borderSkipped: false,
            hoverBackgroundColor: 'rgba(99,102,241,.8)',
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: isDark ? '#1C2230' : '#fff',
              borderColor: isDark ? 'rgba(255,255,255,.1)' : '#E2E8F0',
              borderWidth: 1,
              titleColor: isDark ? '#E6EDF3' : '#0F172A',
              bodyColor: isDark ? '#8B949E' : '#475569',
              padding: 10,
              callbacks: { label: ctx => ` ${ctx.raw} sessões` }
            }
          },
          scales: {
            x: {
              grid: { display: false },
              border: { display: false },
              ticks: { color: tickColor, font: { size: 11, family: "'JetBrains Mono', monospace" } }
            },
            y: {
              grid: { color: gridColor, drawBorder: false },
              border: { display: false, dash: [4, 4] },
              ticks: { color: tickColor, font: { size: 11 }, stepSize: 1, precision: 0 },
              beginAtZero: true
            }
          },
          animation: { duration: 600, easing: 'easeOutQuart' }
        }
      });
    }

  } catch (err) {
    el.innerHTML = `
      <div class="empty-state">
        <svg><use href="#ic-alert"/></svg>
        <p>Erro ao carregar dashboard<br><span style="font-size:12px;font-family:var(--font-mono)">${err.message}</span></p>
      </div>`;
  }
}
