import { state, api } from './api.js';
import { esc, relativeTime } from './utils.js';
import { updateNav, pageNav } from './nav.js';
import { highlightBadWords } from './badwords.js';

export async function renderMessages() {
  updateNav();

  pageNav('messages');
  document.getElementById('app').innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h4 class="mb-0">Recent chat messages</h4>
      <button id="btn-refresh" class="btn btn-sm btn-outline-secondary">Refresh</button>
    </div>
    <div id="msg-body">
      <div class="text-center py-5"><div class="spinner-border text-secondary"></div></div>
    </div>`;

  document.getElementById('btn-refresh').addEventListener('click', async () => {
    document.getElementById('msg-body').innerHTML =
      '<div class="text-center py-5"><div class="spinner-border text-secondary"></div></div>';
    await loadMessages();
  });

  await loadMessages();
}

async function loadMessages() {
  try {
    const msgs = state.messages ?? await api('GET', '/api/admin/moderation/chat-messages');
    state.messages = null;
    renderTable(msgs);
  } catch (e) {
    document.getElementById('msg-body').innerHTML =
      `<div class="alert alert-danger">${esc(e.message)}</div>`;
  }
}

function renderTable(msgs) {
  if (!msgs.length) {
    document.getElementById('msg-body').innerHTML = '<p class="text-muted">No messages.</p>';
    return;
  }

  const items = msgs.map((m, i, array) => {
    const gamePrefix = m.hostedGame
      ? `(<a href="${esc(state.apiBase)}/games/${esc(m.hostedGame.publicId)}" target="_blank" class="text-decoration-none">Game ${esc(m.hostedGame.publicId.slice(0, 4))}</a>) `
      : '';

    const author = m.player
      ? `<span class="font-monospace text-muted small me-1">${m.player.isGuest ? '<i>Guest</i>' : ''} ${esc(m.player.pseudo)}:</span>`
      : '<span class="text-muted">system:</span>';

    const contentClass = m.deletedByModeration ? 'text-decoration-line-through opacity-50' : '';

    const actionLink = m.player
      ? ` <a class="text-warning text-decoration-none small" href="#/action?player=${esc(m.player.publicId)}&message=${esc(m.publicId)}">Take action</a>`
      : '';

    const isDifferentGameThanPrevious = i > 0 && array[i - 1].hostedGame.publicId !== m.hostedGame.publicId;

    return `<li class="${isDifferentGameThanPrevious ? 'mt-3' : ''}">
      <span class="${contentClass}">${gamePrefix}${author} ${highlightBadWords(esc(m.content))}</span>
      <span class="text-muted small ms-1">(${relativeTime(m.createdAt)})</span>${actionLink}
    </li>`;
  }).join('');

  document.getElementById('msg-body').innerHTML = `<ul class="list-unstyled mb-0">${items}</ul>`;
}
