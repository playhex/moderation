import { api, state } from './api.js';
import { esc, formatDate, relativeTime, getLastRead, setLastRead, setTabCount } from './utils.js';
import { updateNav, pageNav } from './nav.js';
import { refreshAllCounts } from './counts.js';

export async function renderPlayers() {
  updateNav();
  pageNav('players');

  document.getElementById('app').innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-3">
      <div class="d-flex align-items-center gap-3">
        <h4 class="mb-0">New accounts</h4>
        <button id="btn-mark-read" class="d-none btn btn-sm btn-success">Mark all read</button>
      </div>
      <button id="btn-refresh" class="btn btn-sm btn-outline-secondary">Refresh</button>
    </div>
    <div id="players-body">
      <div class="text-center py-5"><div class="spinner-border text-secondary"></div></div>
    </div>`;

  document.getElementById('btn-refresh').addEventListener('click', async () => {
    state.messages = null;
      state.players = null;
    state.avatars = null;
    state.history = null;
    document.getElementById('players-body').innerHTML =
      '<div class="text-center py-5"><div class="spinner-border text-secondary"></div></div>';
    await loadPlayers();
    refreshAllCounts('players');
  });

  document.getElementById('btn-mark-read').addEventListener('click', async () => {
    try {
      await setLastRead('players');
    } catch (e) {
      alert(`Could not mark as seen: ${e.message}`);
      return;
    }

    renderList(state.players);
  });

  await loadPlayers();
}

async function loadPlayers() {
  try {
    const players = await api('GET', '/api/admin/moderation/players');
    state.players = players;
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

  const lastRead = getLastRead('players');
  const newCount = lastRead
    ? players.filter(p => new Date(p.registeredAt ?? p.createdAt) > lastRead).length
    : players.length;

  setTabCount('players', newCount);
  pageNav('players');
  const btn = document.getElementById('btn-mark-read');
  if (btn) btn.classList.toggle('d-none', newCount === 0);

  let separatorAdded = false;

  const items = players.map(p => {
    const registered = relativeTime(p.registeredAt ?? p.createdAt);
    const firstVisit = p.registeredAt ? `<span class="text-muted small ms-1">(first visit ${relativeTime(p.createdAt)})</span>` : '';

    const isOld = lastRead && new Date(p.registeredAt ?? p.createdAt) <= lastRead;
    const isSeparator = isOld && !separatorAdded && newCount > 0;
    if (isSeparator) separatorAdded = true;

    return `<li class="py-1${isSeparator ? ' unread-separator' : ''}">
      <span class="fw-semibold"><a href="${esc(state.apiBase)}/@${esc(p.slug)}">${esc(p.pseudo)}</a></span>
      <span class="text-muted small ms-2" title="${esc(formatDate(p.registeredAt ?? p.createdAt))}">${registered}</span>
      ${firstVisit}
      <a class="text-warning text-decoration-none small ms-2"
          href="#/action?player=${esc(p.publicId)}">Take action</a>
    </li>`;
  }).join('');

  document.getElementById('players-body').innerHTML = `<ul class="list-unstyled mb-0">${items}</ul>`;
}
