import { api, state } from './api.js';
import { esc, formatDate, relativeTime, getLastRead, setLastRead, setTabCount, mostRecentDate } from './utils.js';
import { updateNav, pageNav } from './nav.js';
import { refreshAllCounts } from './counts.js';
import { highlightBadWords } from './badwords.js';

export async function renderPuzzles() {
  updateNav();
  pageNav('puzzles');

  document.getElementById('app').innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-3">
      <div class="d-flex align-items-center gap-3">
        <h4 class="mb-0">Last created or updated puzzles</h4>
        <button id="btn-mark-read" class="d-none btn btn-sm btn-success">Mark all read</button>
      </div>
      <button id="btn-refresh" class="btn btn-sm btn-outline-secondary">Refresh</button>
    </div>
    <div id="puzzles-body">
      <div class="text-center py-5"><div class="spinner-border text-secondary"></div></div>
    </div>`;

  document.getElementById('btn-refresh').addEventListener('click', async () => {
    state.messages = null;
    state.players = null;
    state.avatars = null;
    state.videos = null;
    state.puzzles = null;
    document.getElementById('puzzles-body').innerHTML =
      '<div class="text-center py-5"><div class="spinner-border text-secondary"></div></div>';
    await loadPuzzles();
    refreshAllCounts('puzzles');
  });

  document.getElementById('btn-mark-read').addEventListener('click', async () => {
    try {
      // Mark as read at the date of the most recently updated puzzle, and not "now":
      // puzzles updated since last refresh must stay unread.
      const lastDate = mostRecentDate(state.puzzles ?? [], p => p.updatedAt);

      await setLastRead('puzzles', lastDate ?? new Date());
    } catch (e) {
      alert(`Could not mark as seen: ${e.message}`);
      return;
    }

    renderList(state.puzzles);
  });

  await loadPuzzles();
}

async function loadPuzzles() {
  try {
    const puzzles = await api('GET', '/api/admin/moderation/puzzles');
    state.puzzles = puzzles;
    renderList(puzzles);
  } catch (e) {
    document.getElementById('puzzles-body').innerHTML =
      `<div class="alert alert-danger">${esc(e.message)}</div>`;
  }
}

/**
 * Text typed by player, escaped, with bad words highlighted.
 */
function userText(text) {
  return highlightBadWords(esc(text));
}

/**
 * Collects all messages of a puzzle tree, with the moves leading to them,
 * including "else" nodes and parallel sequences.
 *
 * @returns {{ path: string[], message: string, result: undefined | string }[]}
 */
export function collectTreeMessages(node, path = [], messages = []) {
  if (node.message) {
    messages.push({ path, message: node.message, result: node.result });
  }

  for (const child of node.children ?? []) {
    if ('else' in child) {
      if (child.message) {
        messages.push({ path: [...path, `else ${child.else}`], message: child.message, result: 'failed' });
      }

      continue;
    }

    collectTreeMessages(child, [...path, child.move], messages);
  }

  (node.parallel ?? []).forEach((parallelRoot, i) => {
    collectTreeMessages(parallelRoot, [...path, `(parallel ${i + 1})`], messages);
  });

  return messages;
}

function resultBadge(result) {
  if (result === 'solved') return '<span class="badge text-bg-success ms-1">solved</span>';
  if (result === 'failed') return '<span class="badge text-bg-danger ms-1">failed</span>';
  return '';
}

function renderTreeMessages(tree) {
  const messages = collectTreeMessages(tree);

  if (!messages.length) {
    return '<p class="text-muted small mb-0">No messages in tree.</p>';
  }

  return `<ul class="list-unstyled small mb-0">
    ${messages.map(({ path, message, result }) => `
      <li class="mb-1">
        <code class="text-muted me-1">${path.length ? esc(path.join(' ')) : 'start'}</code>${resultBadge(result)}
        <span class="ms-1 text-break" style="white-space: pre-wrap">${userText(message)}</span>
      </li>`).join('')}
  </ul>`;
}

function renderList(puzzles) {
  if (!puzzles.length) {
    document.getElementById('puzzles-body').innerHTML = '<p class="text-muted">No puzzles.</p>';
    return;
  }

  const lastRead = getLastRead('puzzles');
  const newCount = lastRead
    ? puzzles.filter(p => new Date(p.updatedAt) > lastRead).length
    : puzzles.length;

  setTabCount('puzzles', newCount);
  pageNav('puzzles');
  const btn = document.getElementById('btn-mark-read');
  if (btn) btn.classList.toggle('d-none', newCount === 0);

  let separatorAdded = false;

  const items = puzzles.map(p => {
    const isOld = lastRead && new Date(p.updatedAt) <= lastRead;
    const isSeparator = isOld && !separatorAdded && newCount > 0;
    if (isSeparator) separatorAdded = true;

    const author = p.author
      ? `<a href="${esc(state.apiBase)}/@${esc(p.author.slug)}" target="_blank">${esc(p.author.pseudo)}</a>
        <a class="text-warning text-decoration-none small ms-2" href="#/action?player=${esc(p.author.publicId)}">Take action</a>`
      : '<span class="text-muted">no author (created by command)</span>';

    const statusBadge = p.published
      ? '<span class="badge text-bg-success">Published</span>'
      : '<span class="badge text-bg-secondary">Draft</span>';

    const updated = p.updatedAt !== p.createdAt
      ? `, updated <span title="${esc(formatDate(p.updatedAt))}">${relativeTime(p.updatedAt)}</span>`
      : '';

    return `<div class="py-3 border-bottom${isSeparator ? ' unread-separator' : ''}">
      <div class="d-flex flex-wrap align-items-center gap-2 mb-1">
        ${statusBadge}
        <a href="${esc(state.apiBase)}/puzzles/${encodeURIComponent(p.publicId)}" target="_blank" class="fw-semibold text-break">
          ${p.title ? userText(p.title) : '<span class="fst-italic text-muted">untitled</span>'}
        </a>
        ${p.collection ? `<span class="text-muted small">in collection</span> <a href="${esc(state.apiBase)}/puzzles/collections/${encodeURIComponent(p.collection.publicId)}" target="_blank" class="small">${userText(p.collection.name)}</a>` : ''}
        ${p.published ? `<button class="btn btn-sm btn-outline-danger ms-auto btn-unpublish" data-public-id="${esc(p.publicId)}">Put back as draft</button>` : ''}
      </div>
      <div class="small mb-2">
        By ${author}
        <span class="text-muted ms-2">
          created <span title="${esc(formatDate(p.createdAt))}">${relativeTime(p.createdAt)}</span>${updated}
        </span>
      </div>
      ${p.description ? `<div class="mb-2 text-break" style="white-space: pre-wrap">${userText(p.description)}</div>` : ''}
      <div class="border-start ps-3">
        ${renderTreeMessages(p.tree)}
      </div>
    </div>`;
  }).join('');

  document.getElementById('puzzles-body').innerHTML = `<div>${items}</div>`;

  document.querySelectorAll('.btn-unpublish').forEach(button => {
    button.addEventListener('click', () => unpublishPuzzle(button.dataset.publicId));
  });
}

async function unpublishPuzzle(publicId) {
  if (!confirm('Put this puzzle back as draft? It will no longer be listed, author can still edit and publish it again.')) {
    return;
  }

  try {
    await api('POST', `/api/admin/moderation/puzzles/${encodeURIComponent(publicId)}/unpublish`);
  } catch (e) {
    alert(`Could not unpublish puzzle: ${e.message}`);
    return;
  }

  const puzzle = state.puzzles.find(p => p.publicId === publicId);
  if (puzzle) puzzle.published = false;
  renderList(state.puzzles);
}
