import { api, state } from './api.js';
import { esc, formatDate, relativeTime } from './utils.js';
import { updateNav, pageNav } from './nav.js';

export async function renderPlayers() {
  updateNav();
  pageNav('players');

  document.getElementById('app').innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h4 class="mb-0">New accounts</h4>
      <button id="btn-refresh" class="btn btn-sm btn-outline-secondary">Refresh</button>
    </div>
    <div id="players-body">
      <div class="text-center py-5"><div class="spinner-border text-secondary"></div></div>
    </div>`;

  document.getElementById('btn-refresh').addEventListener('click', async () => {
    document.getElementById('players-body').innerHTML =
      '<div class="text-center py-5"><div class="spinner-border text-secondary"></div></div>';
    await loadPlayers();
  });

  await loadPlayers();
}

async function loadPlayers() {
  try {
    const players = await api('GET', '/api/admin/moderation/players');
    renderList(players);
  } catch (e) {
    document.getElementById('players-body').innerHTML =
      `<div class="alert alert-danger">${esc(e.message)}</div>`;
  }
}

function renderList(players) {
  if (!players.length) {
    document.getElementById('players-body').innerHTML = '<p class="text-muted">No accounts.</p>';
    return;
  }

  const items = players.map(p => {
    const registered = relativeTime(p.registeredAt ?? p.createdAt);
    const firstVisit = p.registeredAt ? `<span class="text-muted small ms-1">(first visit ${relativeTime(p.createdAt)})</span>` : '';

    return `<li class="py-1">
      <span class="fw-semibold"><a href="${esc(state.apiBase)}/@${esc(p.slug)}">${esc(p.pseudo)}</a></span>
      <span class="text-muted small ms-2" title="${esc(formatDate(p.registeredAt ?? p.createdAt))}">${registered}</span>
      ${firstVisit}
      <a class="text-warning text-decoration-none small ms-2"
          href="#/action?player=${esc(p.publicId)}">Take action</a>
    </li>`;
  }).join('');

  document.getElementById('players-body').innerHTML = `<ul class="list-unstyled mb-0">${items}</ul>`;
}
