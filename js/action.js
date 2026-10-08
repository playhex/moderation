import { state, api } from './api.js';
import { esc, relativeTime, formatDate, navigate, REASONS } from './utils.js';
import { updateNav, pageNav } from './nav.js';

export async function renderAction(params) {
  updateNav();
  pageNav();

  const playerPublicId = params.get('player');
  const fromMessageId = params.get('message');

  if (!playerPublicId) { navigate('messages'); return; }

  document.getElementById('app').innerHTML = `
    <div class="mb-3">
      <a href="#/messages" id="link-back">← Back</a>
    </div>
    <div id="action-body">
      <div class="text-center py-5"><div class="spinner-border text-secondary"></div></div>
    </div>`;

  // Back to previous page (messages, avatars, videos, puzzles...), or messages if opened directly
  document.getElementById('link-back').addEventListener('click', e => {
    if (history.length > 1) {
      e.preventDefault();
      history.back();
    }
  });

  try {
    const [player, pastActions, allMessages, playerIps] = await Promise.all([
      api('GET', `/api/admin/moderation/players/${playerPublicId}`),
      api('GET', `/api/admin/moderation/players/${playerPublicId}/actions`),
      state.messages
        ? Promise.resolve(state.messages)
        : api('GET', '/api/admin/moderation/chat-messages').then(m => { state.messages = m; return m; }),
      api('GET', `/api/admin/moderation/players/${playerPublicId}/ips`),
    ]);

    const playerMessages = allMessages.filter(entry => entry.message.player?.publicId === playerPublicId);
    renderForm(player, pastActions, playerMessages, fromMessageId, playerIps);
  } catch (e) {
    document.getElementById('action-body').innerHTML =
      `<div class="alert alert-danger">${esc(e.message)}</div>`;
  }
}

function renderPastActions(actions) {
  if (!actions.length) {
    return '<p class="text-muted small mb-0">No past actions.</p>';
  }

  const now = new Date();

  return actions.map(a => {
    const chatActive = a.chatBlockedUntil && new Date(a.chatBlockedUntil) > now;
    const contentActive = a.anyContentBlockedUntil && new Date(a.anyContentBlockedUntil) > now;
    const ipBanActive = a.ipBannedUntil && new Date(a.ipBannedUntil) > now;
    const badges = [];
    if (a.chatBlockedUntil) {
      badges.push(chatActive
        ? `<span class="badge text-bg-danger">Chat blocked until ${formatDate(a.chatBlockedUntil)}</span>`
        : `<span class="badge text-bg-secondary">Chat blocked (expired ${formatDate(a.chatBlockedUntil)})</span>`);
    }
    if (a.anyContentBlockedUntil) {
      badges.push(contentActive
        ? `<span class="badge text-bg-danger">Any content blocked until ${formatDate(a.anyContentBlockedUntil)}</span>`
        : `<span class="badge text-bg-secondary">Any content blocked (expired ${formatDate(a.anyContentBlockedUntil)})</span>`);
    }
    if (a.ipBannedUntil) {
      badges.push(ipBanActive
        ? `<span class="badge" style="background-color:#6f42c1">IPs banned until ${formatDate(a.ipBannedUntil)}</span>`
        : `<span class="badge text-bg-secondary">IPs banned (expired ${formatDate(a.ipBannedUntil)})</span>`);
    }
    if (!badges.length) {
      badges.push(`<span class="badge text-bg-warning text-dark">Warning</span>`);
    }
    if (a.automatic) {
      badges.push(`<span class="badge text-bg-info">Auto</span>`);
    }
    const badge = badges.join(' ');
    const ack = a.acknowledgedAt
      ? `<span class="text-muted small">Acknowledged ${formatDate(a.acknowledgedAt)}</span>`
      : `<span class="text-warning small">Not yet acknowledged</span>`;

    return `<div class="border rounded p-2 mb-2 small">
      <div class="d-flex justify-content-between align-items-start gap-2 flex-wrap">
        <div>
          ${badge}
          ${a.reason ? `<span class="ms-1 text-muted">${esc(REASONS[a.reason] ?? a.reason)}</span>` : ''}
        </div>
        <span class="text-muted">${formatDate(a.createdAt)}</span>
      </div>
      ${a.reasonDetails ? `<div class="mt-1">${esc(a.reasonDetails)}</div>` : ''}
      ${a.relatedChatMessages?.length ? `
        <ul class="list-unstyled mt-2 mb-0 border-top pt-2">
          ${a.relatedChatMessages.map(m => {
            const gameLink = m.game
              ? `<a href="${esc(state.apiBase)}/games/${esc(m.game.publicId)}" target="_blank">${esc(m.game.publicId.slice(0, 8))}…</a>`
              : '';
            return `<li class="text-muted"><span class="me-1">${gameLink}</span>${esc(m.content)}</li>`;
          }).join('')}
        </ul>` : ''}
      <div class="mt-1">${ack}</div>
    </div>`;
  }).join('');
}

function renderPlayerIps(playerIps) {
  if (!playerIps.length) {
    return '<p class="text-muted small mb-0">No IPs recorded.</p>';
  }

  return `<ul class="list-unstyled mb-0 small">
    ${playerIps.map(({ ip, lastUsedAt, otherPlayers }) => {
      const others = otherPlayers.length
        ? `<div class="ms-2 mt-1 text-warning">
            Also used by: ${otherPlayers.map(p =>
              `<a href="#/action?player=${esc(p.publicId)}">${esc(p.pseudo)}</a>`
            ).join(', ')}
          </div>`
        : '';
      return `<li class="mb-2">
        <code>${esc(ip)}</code>
        <span class="text-muted ms-1">— last used ${formatDate(lastUsedAt)}</span>
        ${others}
      </li>`;
    }).join('')}
  </ul>`;
}

function renderForm(player, pastActions, playerMessages, fromMessageId, playerIps) {
  const reasonOptions = '<option value="">— none —</option>'
    + Object.entries(REASONS).map(([value, label]) =>
        `<option value="${esc(value)}">${esc(label)}</option>`
      ).join('');

  const messageRows = playerMessages.map(entry => {
    const m = entry.message;
    const checked = m.publicId === fromMessageId ? 'checked' : '';
    const contentClass = m.deletedByModeration ? 'text-break text-decoration-line-through opacity-50' : 'text-break';
    let sourceCell;
    if (entry.source === 'game') {
      sourceCell = `<a href="${esc(state.apiBase)}/games/${esc(entry.data.publicId)}" target="_blank">${esc(entry.data.publicId.slice(0, 8))}…</a>`;
    } else {
      sourceCell = `#${esc(entry.data)}`;
    }
    return `<tr>
      <td class="text-center"><input class="form-check-input msg-checkbox" type="checkbox" value="${esc(m.publicId)}" ${checked}></td>
      <td>${sourceCell}</td>
      <td class="${contentClass}">${esc(m.content)}</td>
      <td class="text-muted small text-nowrap" title="${esc(m.createdAt)}">${relativeTime(m.createdAt)}</td>
    </tr>`;
  }).join('');

  document.getElementById('action-body').innerHTML = `
    <div class="row g-4">
      <div class="col-lg-4">
        <div class="card p-3 mb-4">
          <h6 class="text-uppercase text-muted mb-3">Player info</h6>
          <dl class="row mb-0">
            <dt class="col-5 text-muted small">Nickname</dt>
            <dd class="col-7">${esc(player.pseudo)}${player.isGuest ? ' <span class="badge text-bg-secondary">guest</span>' : ''}</dd>
            <dt class="col-5 text-muted small">First visit</dt>
            <dd class="col-7">${formatDate(player.createdAt)}</dd>
            <dt class="col-5 text-muted small">Registered</dt>
            <dd class="col-7">${player.registeredAt ? formatDate(player.registeredAt) : '<span class="text-muted">—</span>'}</dd>
          </dl>
        </div>
        <div class="card p-3 mb-4">
          <h6 class="text-uppercase text-muted mb-3">Past actions</h6>
          ${renderPastActions(pastActions)}
        </div>
        <div class="card p-3">
          <h6 class="text-uppercase text-muted mb-3">Known IPs</h6>
          ${renderPlayerIps(playerIps)}
        </div>
      </div>

      <div class="col-lg-8">
        <div class="card p-3 mb-4">
          <div class="d-flex align-items-center gap-2 mb-2">
            <h6 class="text-uppercase text-muted mb-0">Player messages</h6>
            <button id="btn-select-all" class="btn btn-sm btn-link text-muted p-0">all</button>
            <span class="text-muted">/</span>
            <button id="btn-select-none" class="btn btn-sm btn-link text-muted p-0">none</button>
          </div>
          ${playerMessages.length ? `
            <div class="table-responsive">
              <table class="table table-sm table-hover align-middle mb-0">
                <thead><tr><th style="width:1.5rem"></th><th>Game</th><th>Message</th><th>Date</th></tr></thead>
                <tbody>${messageRows}</tbody>
              </table>
            </div>` : '<p class="text-muted mb-0">No messages in current list.</p>'}
        </div>

        <div class="card p-3">
          <h6 class="text-uppercase text-muted mb-3">Moderation action</h6>
          <div id="action-result"></div>
          <div class="mb-3">
            <label class="form-label" for="input-reason">Reason</label>
            <select id="input-reason" class="form-select">${reasonOptions}</select>
          </div>
          <div class="mb-3">
            <label class="form-label" for="input-details">Details <span class="text-muted">(shown to player)</span></label>
            <textarea id="input-details" class="form-control" rows="2" placeholder="Optional free-form details…"></textarea>
          </div>
          <div class="mb-3">
            <div class="form-check form-check-inline">
              <input class="form-check-input" type="radio" name="actionType" id="radio-warn" value="warn" checked>
              <label class="form-check-label" for="radio-warn">Warning only</label>
            </div>
            <div class="form-check form-check-inline">
              <input class="form-check-input" type="radio" name="actionType" id="radio-block" value="block">
              <label class="form-check-label" for="radio-block">Block chat until…</label>
            </div>
            <div class="form-check form-check-inline">
              <input class="form-check-input" type="radio" name="actionType" id="radio-content-block" value="content-block">
              <label class="form-check-label" for="radio-content-block">Block any content until…</label>
            </div>
            <div class="form-check form-check-inline">
              <input class="form-check-input" type="radio" name="actionType" id="radio-ip-ban" value="ip-ban">
              <label class="form-check-label text-danger" for="radio-ip-ban">Ban IPs until…</label>
            </div>
          </div>
          <div id="date-picker-group" class="mb-3 d-none">
            <label class="form-label" for="input-block-until">Block chat until</label>
            <input id="input-block-until" type="date" class="form-control" style="max-width:280px">
          </div>
          <div id="content-date-picker-group" class="mb-3 d-none">
            <label class="form-label" for="input-content-block-until">
              Block any content until
              <span class="text-muted small">(cannot upload avatar, create or edit puzzles, videos, tournaments… Current avatar will be deleted)</span>
            </label>
            <input id="input-content-block-until" type="date" class="form-control" style="max-width:280px">
          </div>
          <div id="ip-ban-date-picker-group" class="mb-3 d-none">
            <label class="form-label" for="input-ip-ban-until">Ban all known IPs until <span class="text-muted small">(blocks connection from all known IPs)</span></label>
            <input id="input-ip-ban-until" type="date" class="form-control" style="max-width:280px">
          </div>
          <div class="mb-3">
            <div class="form-check">
              <input class="form-check-input" type="checkbox" id="check-moderate-nickname">
              <label class="form-check-label" for="check-moderate-nickname">Moderate nickname <span class="text-muted small">(rename to "moderated XXXX")</span></label>
            </div>
          </div>
          <button id="btn-submit" class="btn btn-warning">Submit moderation action</button>
        </div>
      </div>
    </div>`;

  document.getElementById('btn-select-all')?.addEventListener('click', () =>
    document.querySelectorAll('.msg-checkbox').forEach(cb => cb.checked = true));

  document.getElementById('btn-select-none')?.addEventListener('click', () =>
    document.querySelectorAll('.msg-checkbox').forEach(cb => cb.checked = false));

  const hideDatePickers = () => {
    document.getElementById('date-picker-group').classList.add('d-none');
    document.getElementById('content-date-picker-group').classList.add('d-none');
    document.getElementById('ip-ban-date-picker-group').classList.add('d-none');
  };

  document.getElementById('radio-warn').addEventListener('change', hideDatePickers);

  document.getElementById('radio-block').addEventListener('change', () => {
    hideDatePickers();
    document.getElementById('date-picker-group').classList.remove('d-none');
  });

  document.getElementById('radio-content-block').addEventListener('change', () => {
    hideDatePickers();
    document.getElementById('content-date-picker-group').classList.remove('d-none');
  });

  document.getElementById('radio-ip-ban').addEventListener('change', () => {
    hideDatePickers();
    document.getElementById('ip-ban-date-picker-group').classList.remove('d-none');
  });

  document.getElementById('btn-submit').addEventListener('click', () => submitAction(player.publicId, player.pseudo));
}

async function submitAction(playerPublicId, playerPseudo) {
  const reason = document.getElementById('input-reason').value || null;
  const reasonDetails = document.getElementById('input-details').value.trim() || null;
  const isBlock = document.getElementById('radio-block').checked;
  const isContentBlock = document.getElementById('radio-content-block').checked;
  const isIpBan = document.getElementById('radio-ip-ban').checked;
  const blockUntilInput = document.getElementById('input-block-until')?.value;
  const contentBlockUntilInput = document.getElementById('input-content-block-until')?.value;
  const ipBanUntilInput = document.getElementById('input-ip-ban-until')?.value;
  const resultEl = document.getElementById('action-result');

  if (isBlock && !blockUntilInput) {
    resultEl.innerHTML = '<div class="alert alert-danger">Please pick a chat block-until date.</div>';
    return;
  }

  if (isContentBlock && !contentBlockUntilInput) {
    resultEl.innerHTML = '<div class="alert alert-danger">Please pick a content block-until date.</div>';
    return;
  }

  if (isIpBan && !ipBanUntilInput) {
    resultEl.innerHTML = '<div class="alert alert-danger">Please pick an IP ban-until date.</div>';
    return;
  }

  const relatedChatMessages = [...document.querySelectorAll('.msg-checkbox:checked')].map(cb => cb.value);
  const moderateNicknameChecked = document.getElementById('check-moderate-nickname')?.checked || false;

  resultEl.innerHTML = '<div class="text-muted"><div class="spinner-border spinner-border-sm me-2"></div>Submitting…</div>';

  try {
    await api('POST', '/api/admin/moderation/action', {
      playerPublicId,
      reason,
      reasonDetails,
      chatBlockedUntil: isBlock ? new Date(blockUntilInput).toISOString() : undefined,
      anyContentBlockedUntil: isContentBlock ? new Date(contentBlockUntilInput).toISOString() : undefined,
      ipBannedUntil: isIpBan ? new Date(ipBanUntilInput).toISOString() : undefined,
      relatedChatMessages,
      moderateNickname: moderateNicknameChecked ? playerPseudo : undefined,
    });

    resultEl.innerHTML = '<div class="alert alert-success">Action created successfully.</div>';
    state.messages = null;
  } catch (e) {
    resultEl.innerHTML = `<div class="alert alert-danger">Error: ${esc(e.message)}</div>`;
  }
}
