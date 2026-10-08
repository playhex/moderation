import { api, state } from './api.js';
import { esc, formatDate, formatDuration, relativeTime, getLastRead, setLastRead, setTabCount, mostRecentDate, REASONS } from './utils.js';
import { updateNav, pageNav } from './nav.js';
import { refreshAllCounts } from './counts.js';
import { highlightBadWords } from './badwords.js';

/**
 * Moderation actions taken automatically by the server (e.g forbidden words in chat),
 * to review them.
 */
export async function renderAutomaticActions() {
  updateNav();
  pageNav('automatic-actions');

  document.getElementById('app').innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-3">
      <div class="d-flex align-items-center gap-3">
        <h4 class="mb-0">Auto Moderated</h4>
        <button id="btn-mark-read" class="d-none btn btn-sm btn-success">Mark all read</button>
      </div>
      <button id="btn-refresh" class="btn btn-sm btn-outline-secondary">Refresh</button>
    </div>
    <div id="automatic-actions-body">
      <div class="text-center py-5"><div class="spinner-border text-secondary"></div></div>
    </div>`;

  document.getElementById('btn-refresh').addEventListener('click', async () => {
    state.messages = null;
    state.players = null;
    state.avatars = null;
    state.videos = null;
    state.puzzles = null;
    state.automaticActions = null;
    document.getElementById('automatic-actions-body').innerHTML =
      '<div class="text-center py-5"><div class="spinner-border text-secondary"></div></div>';
    await loadAutomaticActions();
    refreshAllCounts('automatic-actions');
  });

  document.getElementById('btn-mark-read').addEventListener('click', async () => {
    try {
      // Mark as read at the date of the most recent action, and not "now":
      // actions taken since last refresh must stay unread.
      const lastDate = mostRecentDate(state.automaticActions ?? [], a => a.createdAt);

      await setLastRead('automatic-actions', lastDate ?? new Date());
    } catch (e) {
      alert(`Could not mark as seen: ${e.message}`);
      return;
    }

    renderList(state.automaticActions);
  });

  await loadAutomaticActions();
}

async function loadAutomaticActions() {
  try {
    const actions = await api('GET', '/api/admin/moderation/automatic-actions');
    state.automaticActions = actions;
    renderList(actions);
  } catch (e) {
    document.getElementById('automatic-actions-body').innerHTML =
      `<div class="alert alert-danger">${esc(e.message)}</div>`;
  }
}

/**
 * Messages that originated the action, from games or channels.
 */
function relatedMessages(action) {
  const messages = [
    ...(action.relatedChatMessages ?? []).map(m => ({
      message: m,
      source: m.game
        ? `<a href="${esc(state.apiBase)}/games/${esc(m.game.publicId)}" target="_blank">game ${esc(m.game.publicId.slice(0, 8))}…</a>`
        : 'game',
    })),
    ...(action.relatedChannelChatMessages ?? []).map(m => ({
      message: m,
      source: m.channel ? `#${esc(m.channel.name)}` : 'channel',
    })),
  ];

  if (!messages.length) {
    return '<span class="text-muted">—</span>';
  }

  return `<ul class="list-unstyled mb-0">
    ${messages.map(({ message, source }) => `<li>
      <span class="text-muted small me-1">${source}</span>
      ${highlightBadWords(esc(message.content))}
    </li>`).join('')}
  </ul>`;
}

function renderList(actions) {
  if (!actions.length) {
    document.getElementById('automatic-actions-body').innerHTML = '<p class="text-muted">No auto moderated player yet.</p>';
    return;
  }

  const lastRead = getLastRead('automatic-actions');
  const newCount = lastRead
    ? actions.filter(a => new Date(a.createdAt) > lastRead).length
    : actions.length;

  setTabCount('automatic-actions', newCount);
  pageNav('automatic-actions');
  const btn = document.getElementById('btn-mark-read');
  if (btn) btn.classList.toggle('d-none', newCount === 0);

  const now = new Date();
  let separatorAdded = false;

  const rows = actions.map(a => {
    const isOld = lastRead && new Date(a.createdAt) <= lastRead;
    const isSeparator = isOld && !separatorAdded && newCount > 0;
    if (isSeparator) separatorAdded = true;

    const playerName = a.player
      ? `<a href="#/action?player=${esc(a.player.publicId)}">${esc(a.player.pseudo)}</a>`
      : '<span class="text-muted">unknown</span>';

    const blockedUntil = a.chatBlockedUntil ?? a.anyContentBlockedUntil;
    const restriction = blockedUntil && new Date(blockedUntil) > now
      ? `<span class="badge text-bg-danger" title="${esc(formatDate(blockedUntil))}">Restricted for ${formatDuration(Math.floor((new Date(blockedUntil) - now) / 1000))}</span>`
      : '<span class="badge text-bg-secondary">Expired</span>';

    const reason = a.reason
      ? `<div class="text-muted small">${esc(REASONS[a.reason] ?? a.reason)}</div>`
      : '';

    return `<tr${isSeparator ? ' class="unread-separator"' : ''}>
      <td class="text-nowrap text-muted small" title="${esc(formatDate(a.createdAt))}">${relativeTime(a.createdAt)}</td>
      <td>${playerName}</td>
      <td>${relatedMessages(a)}</td>
      <td>${restriction}${reason}</td>
      <td class="text-end">
        <button class="btn btn-sm btn-outline-secondary btn-cancel-action" data-public-id="${esc(a.publicId)}" title="False positive: lift restriction and restore message">Cancel</button>
      </td>
    </tr>`;
  }).join('');

  document.getElementById('automatic-actions-body').innerHTML = `
    <div class="table-responsive">
      <table class="table table-sm table-hover align-middle">
        <thead><tr><th>Date</th><th>Player</th><th>Message</th><th>Restriction</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  document.querySelectorAll('.btn-cancel-action').forEach(button => {
    button.addEventListener('click', () => cancelAction(button.dataset.publicId));
  });
}

/**
 * In case of false positive: removes the action, so player is no longer restricted,
 * and restores their chat message.
 */
async function cancelAction(publicId) {
  if (!confirm('Cancel this automatic moderation (false positive)? Player will no longer be restricted and their message will be restored. Their deleted avatar, if any, cannot be restored.')) {
    return;
  }

  try {
    await api('DELETE', `/api/admin/moderation/automatic-actions/${encodeURIComponent(publicId)}`);
  } catch (e) {
    alert(`Could not cancel moderation: ${e.message}`);
    return;
  }

  state.automaticActions = state.automaticActions.filter(a => a.publicId !== publicId);
  state.history = null;
  renderList(state.automaticActions);
}
