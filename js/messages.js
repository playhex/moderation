import { state, api } from './api.js';
import { esc, relativeTime, getLastRead, setLastRead, setTabCount } from './utils.js';
import { updateNav, pageNav } from './nav.js';
import { refreshAllCounts } from './counts.js';
import { highlightBadWords } from './badwords.js';

export async function renderMessages() {
  updateNav();

  pageNav('messages');
  document.getElementById('app').innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-3">
      <div class="d-flex align-items-center gap-3">
        <h4 class="mb-0">Recent chat messages</h4>
        <button id="btn-mark-read" class="d-none btn btn-sm btn-success">Mark all read</button>
      </div>
      <button id="btn-refresh" class="btn btn-sm btn-outline-secondary">Refresh</button>
    </div>
    <div id="msg-body">
      <div class="text-center py-5"><div class="spinner-border text-secondary"></div></div>
    </div>`;

  document.getElementById('btn-refresh').addEventListener('click', async () => {
    state.messages = null;
    state.players = null;
    state.avatars = null;
    document.getElementById('msg-body').innerHTML =
      '<div class="text-center py-5"><div class="spinner-border text-secondary"></div></div>';
    await loadMessages();
    refreshAllCounts('messages');
  });

  document.getElementById('btn-mark-read').addEventListener('click', () => {
    setLastRead('messages');
    renderTable(state.messages);
  });

  await loadMessages();
}

async function loadMessages() {
  try {
    const msgs = state.messages ?? await api('GET', '/api/admin/moderation/chat-messages');
    state.messages = msgs;
    renderTable(msgs);
  } catch (e) {
    document.getElementById('msg-body').innerHTML =
      `<div class="alert alert-danger">${esc(e.message)}</div>`;
  }
}


function sourceKey(entry) {
  if (entry.source === 'game') return `game:${entry.data.publicId}`;
  return `channel:${entry.data}`;
}

function renderTable(msgs) {
  if (!msgs.length) {
    document.getElementById('msg-body').innerHTML = '<p class="text-muted">No messages.</p>';
    return;
  }

  const lastRead = getLastRead('messages');
  const newCount = lastRead
    ? msgs.filter(e => new Date(e.message.createdAt) > lastRead).length
    : msgs.length;

  setTabCount('messages', newCount);
  pageNav('messages');
  const btn = document.getElementById('btn-mark-read');
  if (btn) btn.classList.toggle('d-none', newCount === 0);

  let separatorAdded = false;

  const items = msgs.map((entry, i, array) => {
    const m = entry.message;

    let sourcePrefix;
    if (entry.source === 'game') {
      const { opponentType } = entry.data;
      let gameType = '';

      if (opponentType === 'ai') {
        gameType = 'Bot game '
      } else if (opponentType === 'player') {
        gameType = 'Game'
      } else {
        gameType = opponentType
      }

      sourcePrefix = `(<a href="${esc(state.apiBase)}/games/${esc(entry.data.publicId)}" target="_blank" class="text-decoration-none">${gameType} ${esc(entry.data.publicId.slice(0, 4))}</a>) `;
    } else {
      sourcePrefix = `(#${esc(entry.data)}) `;
    }

    const author = m.player
      ? `<span class="font-monospace text-muted small me-1">${m.player.isGuest ? '<i>Guest</i>' : ''} <a href="#/action?player=${esc(m.player.publicId)}" class="text-decoration-none text-muted">${esc(m.player.pseudo)}</a>:</span>`
      : '<span class="text-muted">system:</span>';

    const contentClass = m.deletedByModeration ? 'text-decoration-line-through opacity-50' : '';

    const actionLink = m.player
      ? ` <a class="text-warning text-decoration-none small" href="#/action?player=${esc(m.player.publicId)}&message=${esc(m.publicId)}">Take action</a>`
      : '';

    const isDifferentSourceThanPrevious = i > 0 && sourceKey(array[i - 1]) !== sourceKey(entry);

    const isOld = lastRead && new Date(m.createdAt) <= lastRead;
    const isSeparator = isOld && !separatorAdded && newCount > 0;
    if (isSeparator) separatorAdded = true;

    const extraClass = [
      isDifferentSourceThanPrevious ? 'mt-3' : '',
      isSeparator ? 'unread-separator' : '',
    ].filter(Boolean).join(' ');

    return `<li class="${extraClass}">
      <span class="${contentClass}">${sourcePrefix}${author} ${highlightBadWords(esc(m.content))}</span>
      <span class="text-muted small ms-1">(${relativeTime(m.createdAt)})</span>${actionLink}
    </li>`;
  }).join('');

  document.getElementById('msg-body').innerHTML = `<ul class="list-unstyled mb-0">${items}</ul>`;
}
