import { api, state } from './api.js';
import { esc, formatDate, formatDuration, relativeTime, getLastRead, setLastRead, setTabCount, mostRecentDate } from './utils.js';
import { updateNav, pageNav } from './nav.js';
import { refreshAllCounts } from './counts.js';
import { highlightBadWords } from './badwords.js';

export async function renderVideos() {
  updateNav();
  pageNav('videos');

  document.getElementById('app').innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-3">
      <div class="d-flex align-items-center gap-3">
        <h4 class="mb-0">Last submitted videos</h4>
        <button id="btn-mark-read" class="d-none btn btn-sm btn-success">Mark all read</button>
      </div>
      <button id="btn-refresh" class="btn btn-sm btn-outline-secondary">Refresh</button>
    </div>
    <div id="videos-body">
      <div class="text-center py-5"><div class="spinner-border text-secondary"></div></div>
    </div>`;

  document.getElementById('btn-refresh').addEventListener('click', async () => {
    state.messages = null;
    state.players = null;
    state.avatars = null;
    state.videos = null;
    state.puzzles = null;
    document.getElementById('videos-body').innerHTML =
      '<div class="text-center py-5"><div class="spinner-border text-secondary"></div></div>';
    await loadVideos();
    refreshAllCounts('videos');
  });

  document.getElementById('btn-mark-read').addEventListener('click', async () => {
    try {
      // Mark as read at the date of the most recent video, and not "now":
      // videos submitted since last refresh must stay unread.
      const lastDate = mostRecentDate(state.videos ?? [], v => v.createdAt);

      await setLastRead('videos', lastDate ?? new Date());
    } catch (e) {
      alert(`Could not mark as seen: ${e.message}`);
      return;
    }

    renderList(state.videos);
  });

  await loadVideos();
}

async function loadVideos() {
  try {
    const videos = await api('GET', '/api/admin/moderation/videos');
    state.videos = videos;
    renderList(videos);
  } catch (e) {
    document.getElementById('videos-body').innerHTML =
      `<div class="alert alert-danger">${esc(e.message)}</div>`;
  }
}

function statusBadge(video) {
  if (video.accepted === true) return '<span class="badge text-bg-success">Accepted</span>';
  if (video.accepted === false) return '<span class="badge text-bg-danger">Refused</span>';
  return '<span class="badge text-bg-warning">Pending</span>';
}

/**
 * Text typed by player, escaped, with bad words highlighted.
 */
function userText(text) {
  return highlightBadWords(esc(text));
}

function renderList(videos) {
  if (!videos.length) {
    document.getElementById('videos-body').innerHTML = '<p class="text-muted">No videos.</p>';
    return;
  }

  const lastRead = getLastRead('videos');
  const newCount = lastRead
    ? videos.filter(v => new Date(v.createdAt) > lastRead).length
    : videos.length;

  setTabCount('videos', newCount);
  pageNav('videos');
  const btn = document.getElementById('btn-mark-read');
  if (btn) btn.classList.toggle('d-none', newCount === 0);

  let separatorAdded = false;

  const items = videos.map(v => {
    const isOld = lastRead && new Date(v.createdAt) <= lastRead;
    const isSeparator = isOld && !separatorAdded && newCount > 0;
    if (isSeparator) separatorAdded = true;

    const submitter = v.submittedBy
      ? `<a href="${esc(state.apiBase)}/@${esc(v.submittedBy.slug)}" target="_blank">${esc(v.submittedBy.pseudo)}</a>
        <a class="text-warning text-decoration-none small ms-2" href="#/action?player=${esc(v.submittedBy.publicId)}">Take action</a>`
      : '<span class="text-muted">deleted player</span>';

    return `<div class="d-flex flex-wrap flex-md-nowrap align-items-start gap-3 py-3 border-bottom${isSeparator ? ' unread-separator' : ''}">
      <img src="${esc(state.apiBase + v.thumbnailPath)}" alt="Thumbnail" width="240" class="rounded" style="object-fit:cover; aspect-ratio: 16/9">
      <div class="flex-grow-1" style="min-width: 0">
        <div class="d-flex flex-wrap align-items-center gap-2 mb-1">
          ${statusBadge(v)}
          <a href="${esc(v.url)}" target="_blank" rel="noopener noreferrer" class="fw-semibold text-break">${userText(v.title)}</a>
        </div>
        <dl class="row small mb-2">
          <dt class="col-sm-3 text-muted fw-normal">Video author</dt>
          <dd class="col-sm-9 mb-1">${userText(v.authorName)}</dd>
          <dt class="col-sm-3 text-muted fw-normal">Keywords</dt>
          <dd class="col-sm-9 mb-1">${v.keywords ? userText(v.keywords) : '<span class="text-muted">—</span>'}</dd>
          <dt class="col-sm-3 text-muted fw-normal">Link</dt>
          <dd class="col-sm-9 mb-1 text-break"><code>${esc(v.url)}</code></dd>
          <dt class="col-sm-3 text-muted fw-normal">Duration, published</dt>
          <dd class="col-sm-9 mb-1">${esc(formatDuration(v.durationSeconds) ?? '—')}, ${esc(v.publishedAt ? v.publishedAt.substring(0, 10) : '—')}</dd>
          <dt class="col-sm-3 text-muted fw-normal">Submitted by</dt>
          <dd class="col-sm-9 mb-1">
            ${submitter}
            <span class="text-muted ms-2" title="${esc(formatDate(v.createdAt))}">${relativeTime(v.createdAt)}</span>
          </dd>
        </dl>
        <div class="d-flex gap-2">
          <button class="btn btn-sm ${v.accepted === true ? 'btn-success' : 'btn-outline-success'} btn-moderate-video"
              data-public-id="${esc(v.publicId)}" data-accepted="true">Accept</button>
          <button class="btn btn-sm ${v.accepted === false ? 'btn-danger' : 'btn-outline-danger'} btn-moderate-video"
              data-public-id="${esc(v.publicId)}" data-accepted="false">Refuse</button>
        </div>
      </div>
    </div>`;
  }).join('');

  document.getElementById('videos-body').innerHTML = `<div>${items}</div>`;

  document.querySelectorAll('.btn-moderate-video').forEach(button => {
    button.addEventListener('click', () => moderateVideo(button.dataset.publicId, button.dataset.accepted === 'true'));
  });
}

async function moderateVideo(publicId, accepted) {
  let updated;

  try {
    updated = await api('POST', `/api/admin/moderation/videos/${encodeURIComponent(publicId)}/moderate`, { accepted });
  } catch (e) {
    alert(`Could not moderate video: ${e.message}`);
    return;
  }

  const video = state.videos.find(v => v.publicId === publicId);
  if (video) Object.assign(video, { accepted: updated.accepted, moderatedAt: updated.moderatedAt });
  renderList(state.videos);
}
