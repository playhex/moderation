import { state } from './api.js';
import { esc, navigate, getTabCount } from './utils.js';

export function updateNav() {
  const el = document.getElementById('nav-controls');

  if (!state.apiKey) {
    el.innerHTML = '<a href="#/login" class="btn btn-sm btn-outline-secondary">Login</a>';
    document.getElementById('nav-tabs').innerHTML = '';
    // No navigation when logged out
    document.getElementById('sidebar').classList.add('d-none');
    document.getElementById('btn-sidebar-toggle').classList.add('d-none');
    return;
  }

  el.innerHTML = `
    <div class="d-flex align-items-center gap-3">
      <small class="text-muted">${esc(state.apiBase)}</small>
      <button id="btn-logout" class="btn btn-sm btn-outline-secondary">Logout</button>
    </div>`;

  document.getElementById('btn-logout').addEventListener('click', logout);
}

/**
 * Sidebar entries, grouped by section.
 * Adding a page only requires adding an entry here, and a route in app.js.
 * Entries with `seen: true` have an unread badge, see counts.js.
 */
const SECTIONS = [
  {
    title: 'Moderation',
    entries: [
      { tab: 'messages', label: 'Messages', seen: true },
      { tab: 'players', label: 'New accounts', seen: true },
      { tab: 'avatars', label: 'Avatars', seen: true },
      { tab: 'videos', label: 'Videos', seen: true },
      { tab: 'puzzles', label: 'Puzzles', seen: true },
      { tab: 'automatic-actions', label: 'Auto Moderated', seen: true },
      { tab: 'history', label: 'Last moderation actions' },
    ],
  },
  {
    title: 'Admin',
    entries: [
      { tab: 'tournaments', label: 'Tournaments featuring' },
    ],
  },
];

function badge(tab) {
  const n = getTabCount(tab);
  if (!n) return '';
  return `<span class="badge rounded-pill text-bg-danger ms-auto">${n}</span>`;
}

/**
 * Renders sidebar navigation.
 *
 * @param {null | string} active Current tab, or null if current page is not in sidebar
 */
export function pageNav(active = null) {
  document.getElementById('sidebar').classList.remove('d-none');
  document.getElementById('btn-sidebar-toggle').classList.remove('d-none');

  document.getElementById('nav-tabs').innerHTML = SECTIONS.map(section => `
    <h6 class="text-uppercase text-muted small fw-semibold mt-3 mb-2 px-2">${esc(section.title)}</h6>
    <ul class="nav flex-column mb-2">
      ${section.entries.map(({ tab, label, seen }) => `
        <li class="nav-item">
          <a class="nav-link d-flex align-items-center gap-2 ${active === tab ? 'active' : 'text-body-secondary'}"
              href="#/${tab}">${esc(label)}${seen ? badge(tab) : ''}</a>
        </li>`).join('')}
    </ul>`).join('');

  // On small screens, close sidebar once a page is chosen
  document.querySelectorAll('#nav-tabs a').forEach(link => link.addEventListener('click', () => {
    window.bootstrap?.Offcanvas.getInstance(document.getElementById('sidebar'))?.hide();
  }));
}


export function logout() {
  localStorage.removeItem('apiKey');
  state.apiKey = '';
  state.messages = null;
  state.players = null;
  state.avatars = null;
  state.videos = null;
  state.puzzles = null;
  state.history = null;
  state.automaticActions = null;
  state.tournaments = null;
  state.seen = null;
  state.countsInitialized = false;
  navigate('login');
}
