import { api, state } from './api.js';
import { esc, formatDate, relativeTime, REASONS } from './utils.js';
import { updateNav, pageNav } from './nav.js';

export async function renderHistory() {
  updateNav();
  pageNav('history');

  document.getElementById('app').innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h4 class="mb-0">Moderation history</h4>
      <button id="btn-refresh" class="btn btn-sm btn-outline-secondary">Refresh</button>
    </div>
    <div id="history-body">
      <div class="text-center py-5"><div class="spinner-border text-secondary"></div></div>
    </div>`;

  document.getElementById('btn-refresh').addEventListener('click', async () => {
    state.history = null;
    document.getElementById('history-body').innerHTML =
      '<div class="text-center py-5"><div class="spinner-border text-secondary"></div></div>';
    await loadHistory();
  });

  await loadHistory();
}

async function loadHistory() {
  try {
    const actions = state.history ?? await api('GET', '/api/admin/moderation/actions');
    state.history = actions;
    renderList(actions);
  } catch (e) {
    document.getElementById('history-body').innerHTML =
      `<div class="alert alert-danger">${esc(e.message)}</div>`;
  }
}

function renderList(actions) {
  if (!actions.length) {
    document.getElementById('history-body').innerHTML = '<p class="text-muted">No moderation actions yet.</p>';
    return;
  }

  const now = new Date();

  const rows = actions.map(a => {
    const chatActive = a.chatBlockedUntil && new Date(a.chatBlockedUntil) > now;
    const avatarActive = a.avatarBlockedUntil && new Date(a.avatarBlockedUntil) > now;

    const badges = [];
    if (a.chatBlockedUntil) {
      badges.push(chatActive
        ? `<span class="badge text-bg-danger">Chat blocked</span>`
        : `<span class="badge text-bg-secondary">Chat block (expired)</span>`);
    }
    if (a.avatarBlockedUntil) {
      badges.push(avatarActive
        ? `<span class="badge text-bg-danger">Avatar blocked</span>`
        : `<span class="badge text-bg-secondary">Avatar block (expired)</span>`);
    }
    if (a.nicknameModerated) {
      badges.push(`<span class="badge text-bg-warning text-dark">Nickname</span>`);
    }
    if (a.ipBannedUntil) {
      const ipBanActive = new Date(a.ipBannedUntil) > now;
      badges.push(ipBanActive
        ? `<span class="badge" style="background-color:#6f42c1">IPs banned</span>`
        : `<span class="badge text-bg-secondary">IP ban (expired)</span>`);
    }
    if (!badges.length) {
      badges.push(`<span class="badge text-bg-warning text-dark">Warning</span>`);
    }

    const playerName = a.player
      ? `<a href="#/action?player=${esc(a.player.publicId)}">${esc(a.player.pseudo)}</a>`
      : '<span class="text-muted">unknown</span>';

    const reason = a.reason
      ? `<span class="text-muted small ms-1">${esc(REASONS[a.reason] ?? a.reason)}</span>`
      : '';

    const details = a.reasonDetails
      ? `<div class="text-muted small mt-1">${esc(a.reasonDetails)}</div>`
      : '';

    const nickname = a.nicknameModerated
      ? `<div class="text-muted small mt-1">Previous nickname: <em>${esc(a.nicknameModerated)}</em></div>`
      : '';

    const ack = a.acknowledgedAt
      ? `<span class="text-muted small">Ack. ${relativeTime(a.acknowledgedAt)}</span>`
      : `<span class="text-warning small">Pending</span>`;

    return `<tr>
      <td class="text-nowrap text-muted small" title="${esc(formatDate(a.createdAt))}">${relativeTime(a.createdAt)}</td>
      <td>${playerName}</td>
      <td>${badges.join(' ')}${reason}${details}${nickname}</td>
      <td>${ack}</td>
    </tr>`;
  }).join('');

  document.getElementById('history-body').innerHTML = `
    <div class="table-responsive">
      <table class="table table-sm table-hover align-middle">
        <thead><tr><th>Date</th><th>Player</th><th>Action</th><th>Status</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}
