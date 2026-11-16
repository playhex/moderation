import { api, state } from './api.js';
import { esc, formatDate, relativeTime, getLastRead, setLastRead, setTabCount, mostRecentDate, navigate } from './utils.js';
import { updateNav, pageNav } from './nav.js';
import { refreshAllCounts } from './counts.js';
import { renderPlayerIps } from './action.js';

/**
 * Anti-cheat: positions submitted to a strong AI (Hexplorer analysis, bot game, puzzle check)
 * too similar to a currently playing 1v1 game. AI refused, and position has been flagged.
 */

const CONTEXTS = {
  hexplorer: { label: 'Hexplorer', className: 'text-bg-info' },
  bot_game: { label: 'Bot game', className: 'text-bg-warning' },
  puzzle_check: { label: 'Puzzle check', className: 'text-bg-secondary' },
};

function contextBadge(context) {
  const { label, className } = CONTEXTS[context] ?? { label: context, className: 'text-bg-secondary' };
  return `<span class="badge ${className}">${esc(label)}</span>`;
}

function gameUrl(publicId) {
  return `${esc(state.apiBase)}/games/${esc(publicId)}`;
}

function playerLink(player) {
  if (!player) return '<span class="fst-italic text-muted">anonymous</span>';

  return `<a href="#/action?player=${esc(player.publicId)}">${esc(player.pseudo)}</a>${player.isGuest ? ' <span class="badge text-bg-secondary">guest</span>' : ''}`;
}

const RED = '#dc3545';
const BLUE = '#0d6efd';

/** Colored stone. Player 0 / black stones are red, player 1 / white stones are blue. */
function stone(index) {
  return `<span class="d-inline-block rounded-circle align-middle me-1" style="width: 0.8em; height: 0.8em; background: ${index === 0 ? RED : BLUE}"></span>`;
}

function gamePlayers(game) {
  return game.players.map(p => esc(p.pseudo)).join(' vs ');
}

/** Whether flagger is one of the players of the flagged game. */
function isFlaggerInFlaggedGame(flag) {
  return !!flag.player && flag.flaggedGame.players.some(p => p.publicId === flag.player.publicId);
}

function similarityText(flag) {
  return `${Math.round(flag.similarity * 100)}% similar, ${flag.commonStones} common stones${flag.mirror ? `, mirrored (${esc(flag.mirror)})` : ''}`;
}

/*
 * List
 */

export async function renderSimilarPositionFlags() {
  updateNav();
  pageNav('similar-position-flags');

  document.getElementById('app').innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-3">
      <div class="d-flex align-items-center gap-3">
        <h4 class="mb-0">Similar position flags</h4>
        <button id="btn-mark-read" class="d-none btn btn-sm btn-success">Mark all read</button>
      </div>
      <button id="btn-refresh" class="btn btn-sm btn-outline-secondary">Refresh</button>
    </div>
    <p class="text-muted small">
      Positions submitted to a strong AI (Hexplorer, bot game, puzzle check) too similar to a currently playing game. AI refused them.
    </p>
    <div id="flags-body">
      <div class="text-center py-5"><div class="spinner-border text-secondary"></div></div>
    </div>`;

  document.getElementById('btn-refresh').addEventListener('click', async () => {
    state.messages = null;
    state.players = null;
    state.avatars = null;
    state.videos = null;
    state.puzzles = null;
    state.automaticActions = null;
    state.similarPositionFlags = null;
    document.getElementById('flags-body').innerHTML =
      '<div class="text-center py-5"><div class="spinner-border text-secondary"></div></div>';
    await loadFlags();
    refreshAllCounts('similar-position-flags');
  });

  document.getElementById('btn-mark-read').addEventListener('click', async () => {
    try {
      // Mark as read at the date of the most recent flag, and not "now":
      // flags created since last refresh must stay unread.
      const lastDate = mostRecentDate(state.similarPositionFlags ?? [], f => f.createdAt);

      await setLastRead('similar-position-flags', lastDate ?? new Date());
    } catch (e) {
      alert(`Could not mark as seen: ${e.message}`);
      return;
    }

    renderList(state.similarPositionFlags);
  });

  await loadFlags();
}

async function loadFlags() {
  try {
    const flags = state.similarPositionFlags ?? await api('GET', '/api/admin/moderation/similar-position-flags');
    state.similarPositionFlags = flags;
    renderList(flags);
  } catch (e) {
    document.getElementById('flags-body').innerHTML =
      `<div class="alert alert-danger">${esc(e.message)}</div>`;
  }
}

function renderList(flags) {
  if (!flags.length) {
    document.getElementById('flags-body').innerHTML = '<p class="text-muted">No flags.</p>';
    return;
  }

  const lastRead = getLastRead('similar-position-flags');
  const newCount = lastRead
    ? flags.filter(f => new Date(f.createdAt) > lastRead).length
    : flags.length;

  setTabCount('similar-position-flags', newCount);
  pageNav('similar-position-flags');
  const btn = document.getElementById('btn-mark-read');
  if (btn) btn.classList.toggle('d-none', newCount === 0);

  let separatorAdded = false;

  const rows = flags.map(flag => {
    const isOld = lastRead && new Date(flag.createdAt) <= lastRead;
    const isSeparator = isOld && !separatorAdded && newCount > 0;
    if (isSeparator) separatorAdded = true;

    const ownGame = isFlaggerInFlaggedGame(flag)
      ? ' <span class="badge text-bg-danger">plays this game</span>'
      : '';

    const ip = !flag.player && flag.ip ? ` <code class="small">${esc(flag.ip)}</code>` : '';

    return `<tr class="${[isSeparator ? 'unread-separator' : '', isOld ? 'opacity-50' : ''].filter(Boolean).join(' ')}">
      <td>${playerLink(flag.player)}${ip}${ownGame}</td>
      <td>
        <a href="${gameUrl(flag.flaggedGame.publicId)}" target="_blank">${esc(flag.flaggedGame.publicId.slice(0, 8))}</a>
        <span class="text-muted small">${gamePlayers(flag.flaggedGame)}</span>
      </td>
      <td class="small text-muted">${similarityText(flag)}</td>
      <td class="small text-muted text-nowrap" title="${esc(formatDate(flag.createdAt))}">${relativeTime(flag.createdAt)}</td>
      <td><a href="#/similar-position-flag?id=${esc(flag.id)}" class="text-decoration-none">Details</a></td>
    </tr>`;
  }).join('');

  document.getElementById('flags-body').innerHTML = `
    <div class="table-responsive">
      <table class="table table-sm table-hover align-middle mb-0">
        <thead><tr><th>Player</th><th>Flagged game</th><th>Similarity</th><th>Date</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

/*
 * Details
 */

export async function renderSimilarPositionFlag(params) {
  updateNav();
  pageNav();

  const id = params.get('id');

  if (!id) { navigate('similar-position-flags'); return; }

  document.getElementById('app').innerHTML = `
    <div class="mb-3">
      <a href="#/similar-position-flags" id="link-back">← Back</a>
    </div>
    <div id="flag-body">
      <div class="text-center py-5"><div class="spinner-border text-secondary"></div></div>
    </div>`;

  document.getElementById('link-back').addEventListener('click', e => {
    if (history.length > 1) {
      e.preventDefault();
      history.back();
    }
  });

  try {
    const flag = await api('GET', `/api/admin/moderation/similar-position-flags/${encodeURIComponent(id)}`);
    renderDetails(flag);
  } catch (e) {
    document.getElementById('flag-body').innerHTML =
      `<div class="alert alert-danger">${esc(e.message)}</div>`;
  }
}

/**
 * @param {null | string} flagDate When set, inserts a row for the flag between the moves around this date.
 */
function renderMovesTable(game, flagDate = null, flagIndex = -1) {
  if (!game.moves.length) {
    return '<p class="text-muted small mb-0">No moves.</p>';
  }

  const flagRow = `<tr class="table-danger">
    <td></td>
    <td><strong>⚑ Flag</strong></td>
    <td></td>
    <td class="small text-nowrap">${esc(formatDate(flagDate))}</td>
  </tr>`;

  const rows = game.moves.map((move, i) => {
    const ts = game.moveTimestamps[i];

    return `${i === flagIndex ? flagRow : ''}<tr>
      <td class="text-muted">${i + 1}</td>
      <td>${stone(i % 2)}<code>${esc(move)}</code></td>
      <td class="small">${esc(game.players[i % 2]?.pseudo ?? '')}</td>
      <td class="small text-nowrap">${ts ? esc(formatDate(ts)) : '—'}</td>
    </tr>`;
  }).join('') + (flagIndex === game.moves.length ? flagRow : '');

  return `<div class="table-responsive" style="max-height: 32rem; overflow-y: auto">
    <table class="table table-sm align-middle mb-0">
      <thead><tr><th>#</th><th>Move</th><th>Player</th><th>Played at</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

/**
 * Number of moves played in flagged game when flag was created.
 * Flag date has second precision only, move timestamps have milliseconds.
 */
function movesCountAtFlag(flag) {
  const flagDate = new Date(flag.createdAt);
  return flag.flaggedGame.moveTimestamps.filter(ts => new Date(ts) <= flagDate).length;
}

/**
 * "Flagged between move N (date) and move N+1 (date)"
 */
function flagTimingSummary(flag) {
  const game = flag.flaggedGame;
  const n = movesCountAtFlag(flag);
  const before = n > 0
    ? `move ${n} <code>${esc(game.moves[n - 1])}</code> (${esc(formatDate(game.moveTimestamps[n - 1]))})`
    : `game start (${esc(formatDate(game.startedAt))})`;
  const after = n < game.moves.length
    ? `move ${n + 1} <code>${esc(game.moves[n])}</code> (${esc(formatDate(game.moveTimestamps[n]))})`
    : 'now (no move played after)';

  return `Flagged at <strong>${esc(formatDate(flag.createdAt))}</strong>, between ${before} and ${after}.`;
}

function renderGameInfo(game) {
  return `<dl class="row small mb-3">
    <dt class="col-4 text-muted">Game</dt>
    <dd class="col-8"><a href="${gameUrl(game.publicId)}" target="_blank">${esc(game.publicId)}</a></dd>
    <dt class="col-4 text-muted">Players</dt>
    <dd class="col-8 fs-6">${game.players.map((p, i) => `<div>${stone(i)}${p.isBot ? esc(p.pseudo) : playerLink(p)}</div>`).join('')}</dd>
    <dt class="col-4 text-muted">Winner</dt>
    <dd class="col-8">${game.winner === null || game.winner === undefined
      ? '<span class="text-muted">—</span>'
      : `${stone(game.winner)}${esc(game.players[game.winner]?.pseudo ?? '')}`}</dd>
    <dt class="col-4 text-muted">State</dt>
    <dd class="col-8">${esc(game.state)}${game.outcome ? ` (${esc(game.outcome)})` : ''}</dd>
    <dt class="col-4 text-muted">Board size</dt>
    <dd class="col-8">${esc(game.boardsize)}</dd>
    <dt class="col-4 text-muted">Started</dt>
    <dd class="col-8">${formatDate(game.startedAt)}</dd>
    <dt class="col-4 text-muted">Ended</dt>
    <dd class="col-8">${formatDate(game.endedAt)}</dd>
  </dl>`;
}

function renderIpPlayers(flag, flaggedPlayerIds) {
  if (!flag.ip) {
    return '<p class="text-muted small mb-0">No IP recorded with this flag.</p>';
  }

  const players = flag.ipPlayers.length
    ? `<ul class="list-unstyled small mb-0 mt-2">
        ${flag.ipPlayers.map(({ player, lastUsedAt }) => `<li class="mb-1">
          ${playerLink(player)}
          ${flaggedPlayerIds.has(player.publicId) ? '<span class="badge text-bg-danger ms-1">plays flagged game</span>' : ''}
          <span class="text-muted ms-1">— last used ${formatDate(lastUsedAt)}</span>
        </li>`).join('')}
      </ul>`
    : '<p class="text-muted small mb-0 mt-2">No player seen with this IP.</p>';

  return `<div class="small">IP: <code>${esc(flag.ip)}</code></div>${players}`;
}

/**
 * Submitted stones, green when cell has been played in flagged game before flag.
 */
function renderPosition(flag) {
  const playedCells = new Set(flag.flaggedGame.moves.slice(0, movesCountAtFlag(flag)));

  const colorRow = (color, index, label) => `
    <dt class="col-5 text-muted">${stone(index)}${label}</dt>
    <dd class="col-7 text-break">${flag.position[color].map(move => `<code class="${playedCells.has(move) ? 'text-success fw-bold' : ''}">${esc(move)}</code>`).join(' ') || '—'}</dd>`;

  return `${colorRow('black', 0, 'Red')}${colorRow('white', 1, 'Blue')}`;
}

function renderDetails(flag) {
  const flaggedPlayerIds = new Set(flag.flaggedGame.players.map(p => p.publicId));
  const ipLinkedToFlaggedGame = flag.ipPlayers.some(({ player }) => flaggedPlayerIds.has(player.publicId))
    || flag.playerIps.some(({ otherPlayers }) => otherPlayers.some(p => flaggedPlayerIds.has(p.publicId)));

  const warnings = [
    ipLinkedToFlaggedGame ? 'A player of the flagged game shares an IP with the flagger.' : null,
  ].filter(Boolean);

  const stonesCount = flag.position.black.length + flag.position.white.length;

  let source;
  if (flag.context === 'bot_game' && flag.botGame) {
    source = `${renderGameInfo(flag.botGame)}${renderMovesTable(flag.botGame)}`;
  } else if (flag.context === 'hexplorer') {
    source = '<p class="small mb-0">Position submitted to Hexplorer AI analysis.</p>';
  } else if (flag.context === 'puzzle_check') {
    source = '<p class="small mb-0">Puzzle position submitted to AI check.</p>';
  } else {
    source = '<p class="text-muted small mb-0">—</p>';
  }

  document.getElementById('flag-body').innerHTML = `
    <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
      <h4 class="mb-0">Similar position flag #${esc(flag.id)} <span class="text-muted">— ${gamePlayers(flag.flaggedGame)}</span></h4>
      ${contextBadge(flag.context)}
    </div>
    ${warnings.map(w => `<div class="alert alert-danger py-2">${esc(w)}</div>`).join('')}
    <div class="row g-4">
      <div class="col-lg-5">
        <div class="card p-3 mb-4">
          <h6 class="text-uppercase text-muted mb-3">Flag</h6>
          <dl class="row small mb-0">
            <dt class="col-5 text-muted">Date</dt>
            <dd class="col-7">${esc(formatDate(flag.createdAt))} <span class="text-muted">(${relativeTime(flag.createdAt)})</span></dd>
            <dt class="col-5 text-muted">Similarity</dt>
            <dd class="col-7">${similarityText(flag)}</dd>
            <dt class="col-5 text-muted">Stones</dt>
            <dd class="col-7">${stonesCount} submitted, ${esc(flag.flaggedGameStonesCount)} in flagged game at that time</dd>
            <dt class="col-5 text-muted">Board size</dt>
            <dd class="col-7">${esc(flag.boardsize)}</dd>
            ${renderPosition(flag)}
          </dl>
        </div>
        <div class="card p-3 mb-4">
          <h6 class="text-uppercase text-muted mb-3">Player</h6>
          <div class="mb-3">
            ${playerLink(flag.player)}
            ${flag.player ? `<a class="text-warning text-decoration-none small ms-2" href="#/action?player=${esc(flag.player.publicId)}">Take action</a>` : ''}
          </div>
          ${flag.player ? `<h6 class="text-muted small">Known IPs</h6>${renderPlayerIps(flag.playerIps)}` : ''}
        </div>
        <div class="card p-3 mb-4">
          <h6 class="text-uppercase text-muted mb-3">IP of the flag</h6>
          ${renderIpPlayers(flag, flaggedPlayerIds)}
        </div>
        <div class="card p-3">
          <h6 class="text-uppercase text-muted mb-3">Source: ${esc(CONTEXTS[flag.context]?.label ?? flag.context)}</h6>
          ${source}
        </div>
      </div>
      <div class="col-lg-7">
        <div class="card p-3">
          <h6 class="text-uppercase text-muted mb-3">Flagged game (reproduced position)</h6>
          ${renderGameInfo(flag.flaggedGame)}
          <div class="alert alert-secondary small py-2">${flagTimingSummary(flag)}</div>
          ${renderMovesTable(flag.flaggedGame, flag.createdAt, movesCountAtFlag(flag))}
        </div>
      </div>
    </div>`;
}
