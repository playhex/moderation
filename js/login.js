import { state, api } from './api.js';
import { esc, navigate } from './utils.js';
import { updateNav } from './nav.js';

function getSavedLogins() {
  try { return JSON.parse(localStorage.getItem('savedLogins') || '[]'); } catch { return []; }
}

function saveLogin(base, key) {
  const logins = getSavedLogins().filter(l => !(l.base === base && l.key === key));
  logins.unshift({ base, key });
  localStorage.setItem('savedLogins', JSON.stringify(logins.slice(0, 5)));
}

function labelFor(base) {
  try { return new URL(base).hostname; } catch { return base; }
}

export function renderLogin() {
  updateNav();

  const saved = getSavedLogins();
  const shortcutsHtml = saved.length ? `
    <div class="mb-3">
      <div class="text-muted small mb-1">Previous logins</div>
      <div class="d-flex flex-wrap gap-2">
        ${saved.map((l, i) => `<button class="btn btn-sm btn-outline-secondary btn-saved" data-i="${i}">${esc(labelFor(l.base))}</button>`).join('')}
      </div>
    </div>` : '';

  document.getElementById('app').innerHTML = `
    <div class="row justify-content-center mt-5">
      <div class="col-md-5">
        <div class="card p-4">
          <h4 class="mb-4">Moderator login</h4>
          <div id="login-error"></div>
          ${shortcutsHtml}
          <div class="mb-3">
            <label class="form-label" for="input-api-base">API base URL</label>
            <input id="input-api-base" type="url" class="form-control" placeholder="https://playhex.org" value="${esc(state.apiBase)}">
          </div>
          <div class="mb-3">
            <label class="form-label" for="input-api-key">Moderator API key</label>
            <input id="input-api-key" type="password" class="form-control" placeholder="Bearer token">
          </div>
          <button id="btn-connect" class="btn btn-primary w-100">Connect</button>
        </div>
      </div>
    </div>`;

  const doLogin = async (base, key) => {
    const errEl = document.getElementById('login-error');
    errEl.innerHTML = '';

    if (!base || !key) {
      errEl.innerHTML = '<div class="alert alert-danger">Fill in both fields.</div>';
      return;
    }

    state.apiBase = base;
    state.apiKey = key;

    try {
      state.messages = await api('GET', '/api/admin/moderation/chat-messages');
      localStorage.setItem('apiBase', base);
      localStorage.setItem('apiKey', key);
      saveLogin(base, key);
      navigate('messages');
    } catch (e) {
      state.apiKey = '';
      errEl.innerHTML = `<div class="alert alert-danger">Authentication failed: ${esc(e.message)}</div>`;
    }
  };

  document.getElementById('btn-connect').addEventListener('click', () => {
    const base = document.getElementById('input-api-base').value.trim().replace(/\/$/, '');
    const key = document.getElementById('input-api-key').value.trim();
    doLogin(base, key);
  });

  document.getElementById('input-api-key').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const base = document.getElementById('input-api-base').value.trim().replace(/\/$/, '');
      const key = document.getElementById('input-api-key').value.trim();
      doLogin(base, key);
    }
  });

  document.querySelectorAll('.btn-saved').forEach(btn => {
    btn.addEventListener('click', () => {
      const { base, key } = saved[+btn.dataset.i];
      doLogin(base, key);
    });
  });
}
