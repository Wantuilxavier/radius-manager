// ─── API Client ───────────────────────────────────────────────
const API_BASE = '/api';

const api = {
  token: () => localStorage.getItem('rm_token'),

  async request(method, path, body) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    const token = api.token();
    if (token) opts.headers['Authorization'] = `Bearer ${token}`;
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(API_BASE + path, opts);
    const data = await res.json().catch(() => ({}));

    if (res.status === 401) {
      localStorage.removeItem('rm_token');
      localStorage.removeItem('rm_user');
      showLogin();
      throw new Error('Sessão expirada');
    }

    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  },

  get:    (path)        => api.request('GET',    path),
  post:   (path, body)  => api.request('POST',   path, body),
  put:    (path, body)  => api.request('PUT',    path, body),
  patch:  (path, body)  => api.request('PATCH',  path, body),
  delete: (path)        => api.request('DELETE', path),
};

// ─── Toast ────────────────────────────────────────────────────
function toast(message, type = 'info') {
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span>${icons[type]}</span><span>${message}</span>`;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ─── Modal helpers ────────────────────────────────────────────
function openModal(id) {
  document.getElementById(id).classList.add('open');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) closeModal(e.target.id);
  if (e.target.classList.contains('modal-close')) closeModal(e.target.closest('.modal-overlay').id);
});

// ─── Auth helpers ─────────────────────────────────────────────
function currentUser() {
  try { return JSON.parse(localStorage.getItem('rm_user')); } catch { return null; }
}
function showLogin() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app').classList.remove('visible');
}
function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').classList.add('visible');
  const u = currentUser();
  if (u) {
    document.getElementById('sidebar-username').textContent = u.full_name || u.username;
    document.getElementById('sidebar-role').textContent = u.role;
    document.getElementById('sidebar-avatar').textContent = (u.full_name || u.username).charAt(0).toUpperCase();
  }
}

// ─── Pagination helper ────────────────────────────────────────
function renderPagination(containerId, current, total, limit, onPage) {
  const pages = Math.ceil(total / limit);
  const el = document.getElementById(containerId);
  if (!el) return;

  const start = (current - 1) * limit + 1;
  const end   = Math.min(current * limit, total);
  el.innerHTML = `
    <span>Exibindo ${total ? start : 0}–${end} de ${total}</span>
    <div class="pagination-btns">
      <button class="btn btn-ghost btn-sm" ${current <= 1 ? 'disabled' : ''} onclick="(${onPage.toString()})(${current - 1})">← Anterior</button>
      <span style="padding:5px 10px;font-size:12px;color:var(--text-muted)">${current} / ${pages || 1}</span>
      <button class="btn btn-ghost btn-sm" ${current >= pages ? 'disabled' : ''} onclick="(${onPage.toString()})(${current + 1})">Próxima →</button>
    </div>`;
}

// ─── Format helpers ───────────────────────────────────────────
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}
function fmtDuration(min) {
  if (!min && min !== 0) return '—';
  if (min < 60) return `${min}m`;
  return `${Math.floor(min/60)}h ${min%60}m`;
}
function hexToRgba(hex, a) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}
function vlanBadge(groupname, color, vlan_id) {
  if (!groupname) return '<span class="badge badge-gray">—</span>';
  const c = color || '#6366f1';
  return `<span class="vlan-badge" style="background:${hexToRgba(c,.15)};color:${c};border:1px solid ${hexToRgba(c,.3)}">
    <span style="width:7px;height:7px;border-radius:50%;background:${c};display:inline-block"></span>
    ${groupname}${vlan_id ? ` · VLAN ${vlan_id}` : ''}
  </span>`;
}
