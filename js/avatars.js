import { api, state } from './api.js';
import { esc, formatDate, relativeTime, getLastRead, setLastRead, setTabCount } from './utils.js';
import { updateNav, pageNav } from './nav.js';
import { refreshAllCounts } from './counts.js';

export async function renderAvatars() {
  updateNav();
  pageNav('avatars');

  document.getElementById('app').innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-3">
      <div class="d-flex align-items-center gap-3">
        <h4 class="mb-0">Last avatar uploads</h4>
        <button id="btn-mark-read" class="d-none btn btn-sm btn-success">Mark all read</button>
      </div>
      <button id="btn-refresh" class="btn btn-sm btn-outline-secondary">Refresh</button>
    </div>
    <div id="avatars-body">
      <div class="text-center py-5"><div class="spinner-border text-secondary"></div></div>
    </div>`;

  document.getElementById('btn-refresh').addEventListener('click', async () => {
    state.messages = null;
    state.players = null;
    state.avatars = null;
    document.getElementById('avatars-body').innerHTML =
      '<div class="text-center py-5"><div class="spinner-border text-secondary"></div></div>';
    await loadAvatars();
    refreshAllCounts('avatars');
  });

  document.getElementById('btn-mark-read').addEventListener('click', () => {
    setLastRead('avatars');
    renderList(state.avatars);
  });

  await loadAvatars();
}

async function loadAvatars() {
  try {
    const players = await api('GET', '/api/admin/moderation/avatar-uploads');
    state.avatars = players;
    renderList(players);
  } catch (e) {
    document.getElementById('avatars-body').innerHTML =
      `<div class="alert alert-danger">${esc(e.message)}</div>`;
  }
}


function renderList(players) {
  if (!players.length) {
    document.getElementById('avatars-body').innerHTML = '<p class="text-muted">No avatar uploads.</p>';
    return;
  }

  const lastRead = getLastRead('avatars');
  const newCount = lastRead
    ? players.filter(p => new Date(p.avatarUpdatedAt) > lastRead).length
    : players.length;

  setTabCount('avatars', newCount);
  pageNav('avatars');
  const btn = document.getElementById('btn-mark-read');
  if (btn) btn.classList.toggle('d-none', newCount === 0);

  let separatorAdded = false;

  const items = players.map(p => {
    const uploaded = relativeTime(p.avatarUpdatedAt);
    const avatarUrl = esc(state.apiBase + p.avatarPath);

    const isOld = lastRead && new Date(p.avatarUpdatedAt) <= lastRead;
    const isSeparator = isOld && !separatorAdded && newCount > 0;
    if (isSeparator) separatorAdded = true;

    return `<div class="d-flex align-items-center gap-3 py-2 border-bottom${isSeparator ? ' unread-separator' : ''}">
      <img src="${avatarUrl}" alt="Avatar" height="128" class="rounded" style="object-fit:cover">
      <div>
        <span class="fw-semibold"><a href="${esc(state.apiBase)}/@${esc(p.slug)}">${esc(p.pseudo)}</a></span>
        <span class="text-muted small ms-2" title="${esc(formatDate(p.avatarUpdatedAt))}">${uploaded}</span>
        <a class="text-warning text-decoration-none small ms-2"
            href="#/action?player=${esc(p.publicId)}">Take action</a>
      </div>
    </div>`;
  }).join('');

  document.getElementById('avatars-body').innerHTML = `<div>${items}</div>`;
}
