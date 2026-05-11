import { state } from './api.js';
import { esc, navigate } from './utils.js';

export function updateNav() {
  const el = document.getElementById('nav-controls');

  if (!state.apiKey) {
    el.innerHTML = '<a href="#/login" class="btn btn-sm btn-outline-secondary">Login</a>';
    document.getElementById('nav-tabs').innerHTML = '';
    return;
  }

  el.innerHTML = `
    <div class="d-flex align-items-center gap-3">
      <small class="text-muted">${esc(state.apiBase)}</small>
      <button id="btn-logout" class="btn btn-sm btn-outline-secondary">Logout</button>
    </div>`;

  document.getElementById('btn-logout').addEventListener('click', logout);
}

export function pageNav(active) {
  document.getElementById('nav-tabs').innerHTML = `
    <ul class="nav nav-underline ms-3">
      <li class="nav-item">
        <a class="nav-link ${active === 'messages' ? 'active' : ''}" href="#/messages">Messages</a>
      </li>
      <li class="nav-item">
        <a class="nav-link ${active === 'players' ? 'active' : ''}" href="#/players">New accounts</a>
      </li>
    </ul>`;
}

export function logout() {
  localStorage.removeItem('apiKey');
  state.apiKey = '';
  state.messages = null;
  navigate('login');
}
