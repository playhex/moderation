import { state, api } from './api.js';
import { esc, getRoute } from './utils.js';
import { updateNav, pageNav } from './nav.js';

/**
 * History of live games waiting for an opponent in lobby:
 * one bar per day/week/month, green when at least one game is waiting, gray otherwise,
 * with how many games have been accepted or canceled, and after how long.
 */

const BARS_COUNT = 14;

/** Accepted games stopped at this moves count or less are considered abandoned (host AFK, playing elsewhere...) */
const ABANDONED_MAX_MOVES = 4;
const SCALES = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
};

const SPINNER = '<div class="text-center py-5"><div class="spinner-border text-secondary"></div></div>';

const STYLE = `<style>
  .lobby-bar { position: relative; height: 1.4rem; min-width: 18rem; background: var(--bs-secondary-bg); border-radius: 0.25rem; overflow: hidden; }
  .lobby-bar .waiting { position: absolute; top: 0; bottom: 0; background: var(--bs-success); min-width: 1px; }
  .lobby-bar .future { position: absolute; top: 0; bottom: 0; right: 0;
    background: repeating-linear-gradient(45deg, var(--bs-body-bg) 0 4px, transparent 4px 8px); opacity: 0.7; }
  .lobby-ticks { position: relative; height: 1rem; min-width: 18rem; }
  .lobby-ticks span { position: absolute; transform: translateX(-50%); font-size: 0.7rem; color: var(--bs-secondary-color); white-space: nowrap; }
  .lobby-table td, .lobby-table th { vertical-align: middle; white-space: nowrap; }
  .lobby-table td.bar-cell, .lobby-table th.bar-cell { width: 100%; white-space: normal; }
</style>`;

export async function renderLiveLobby() {
  updateNav();
  pageNav('live-lobby');

  const scale = SCALES[getRoute().params.get('scale')] ? getRoute().params.get('scale') : 'day';

  document.getElementById('app').innerHTML = `${STYLE}
    <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
      <h4 class="mb-0">Live lobby</h4>
      <div class="d-flex gap-2">
        <div class="btn-group btn-group-sm" role="group">
          ${Object.entries(SCALES).map(([key, label]) => `
            <a href="#/live-lobby?scale=${key}" class="btn ${key === scale ? 'btn-secondary' : 'btn-outline-secondary'}">${esc(label)}</a>`).join('')}
        </div>
        <button id="btn-refresh" class="btn btn-sm btn-outline-secondary">Refresh</button>
      </div>
    </div>
    <p class="small text-muted">
      Live games (initial time &lt; 1 day) against a player, open to anyone in lobby, not tournament or ladder matches, nor rematches.
      Green: at least one game waiting for an opponent. Stats are about games created during the period.
    </p>
    <div id="live-lobby-body">${SPINNER}</div>`;

  document.getElementById('btn-refresh').addEventListener('click', async () => {
    state.liveLobby = null;
    document.getElementById('live-lobby-body').innerHTML = SPINNER;
    await loadLiveLobby(scale);
  });

  await loadLiveLobby(scale);
}

async function loadLiveLobby(scale) {
  const body = document.getElementById('live-lobby-body');
  const now = Date.now();
  const buckets = getBuckets(scale, new Date(now));

  try {
    state.liveLobby ??= {};
    const data = state.liveLobby[scale]
      ?? await api('GET', `/api/admin/live-lobby-history?since=${encodeURIComponent(buckets.at(-1).start.toISOString())}`);
    state.liveLobby[scale] = data;

    const intervals = mergeIntervals(data.games);

    body.innerHTML = `<div class="table-responsive">
      <table class="table table-sm lobby-table small">
        <thead>
          <tr>
            <th></th>
            <th class="bar-cell">${renderTicks(scale, buckets[0])}</th>
            <th class="text-end" title="Percentage of time with at least one game waiting">Waiting</th>
            <th class="text-end">Games</th>
            <th class="text-end">Accepted</th>
            <th class="text-end">Canceled</th>
            <th class="text-end" title="Accepted games that stopped at ${ABANDONED_MAX_MOVES} moves or less (host AFK, playing another game...), percentage of accepted games">Abandoned<br><span class="fw-normal text-muted">≤ ${ABANDONED_MAX_MOVES} moves</span></th>
            <th class="text-end" title="Time before being accepted: average / median">Wait before accept<br><span class="fw-normal text-muted">avg / median</span></th>
            <th class="text-end" title="Time before being canceled: average / median">Wait before cancel<br><span class="fw-normal text-muted">avg / median</span></th>
          </tr>
        </thead>
        <tbody>
          ${buckets.map(bucket => renderRow(scale, bucket, data.games, intervals, now)).join('')}
        </tbody>
      </table>
    </div>`;
  } catch (e) {
    body.innerHTML = `<div class="alert alert-danger">${esc(e.message)}
      <br><small>Note: this requires an admin token, a moderator token is not enough.</small></div>`;
  }
}

/**
 * Last BARS_COUNT periods, in local time, most recent first.
 * Weeks start on monday.
 *
 * @returns {{ start: Date, end: Date }[]}
 */
function getBuckets(scale, now) {
  const buckets = [];
  let start = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (scale === 'week') {
    start.setDate(start.getDate() - (start.getDay() + 6) % 7);
  } else if (scale === 'month') {
    start.setDate(1);
  }

  for (let i = 0; i < BARS_COUNT; ++i) {
    const end = new Date(start);

    if (scale === 'day') end.setDate(end.getDate() + 1);
    else if (scale === 'week') end.setDate(end.getDate() + 7);
    else end.setMonth(end.getMonth() + 1);

    buckets.push({ start, end });

    const previous = new Date(start);

    if (scale === 'day') previous.setDate(previous.getDate() - 1);
    else if (scale === 'week') previous.setDate(previous.getDate() - 7);
    else previous.setMonth(previous.getMonth() - 1);

    start = previous;
  }

  return buckets;
}

/**
 * Union of all waiting periods, so overlapping games are counted once.
 *
 * @param {[number, number, 0|1, number][]} games [createdAt, closedAt, accepted, movesCount], sorted by createdAt
 * @returns {[number, number][]} Sorted and non overlapping intervals
 */
function mergeIntervals(games) {
  const merged = [];

  for (const [from, to] of games) {
    const last = merged.at(-1);

    if (last && from <= last[1]) {
      last[1] = Math.max(last[1], to);
    } else {
      merged.push([from, to]);
    }
  }

  return merged;
}

function renderRow(scale, { start, end }, games, intervals, now) {
  const startMs = start.getTime();
  const endMs = end.getTime();
  const elapsedEnd = Math.min(endMs, now);
  const length = endMs - startMs;
  const pos = t => ((t - startMs) / length * 100).toFixed(3);

  let waitingMs = 0;
  const segments = [];

  for (const [from, to] of intervals) {
    if (to <= startMs || from >= elapsedEnd) continue;

    const a = Math.max(from, startMs);
    const b = Math.min(to, elapsedEnd);
    waitingMs += b - a;
    segments.push(`<div class="waiting" style="left: ${pos(a)}%; width: ${(pos(b) - pos(a)).toFixed(3)}%"
      title="${esc(`${formatTime(from)} → ${formatTime(to)} (${formatWait(to - from)})`)}"></div>`);
  }

  const future = elapsedEnd < endMs
    ? `<div class="future" style="left: ${pos(elapsedEnd)}%"></div>`
    : '';

  const created = games.filter(([createdAt]) => createdAt >= startMs && createdAt < endMs);
  const acceptedWaits = created.filter(g => g[2] === 1).map(([from, to]) => to - from);
  const canceledWaits = created.filter(g => g[2] === 0).map(([from, to]) => to - from);
  const abandoned = created.filter(g => g[2] === 1 && g[3] <= ABANDONED_MAX_MOVES).length;
  const elapsed = elapsedEnd - startMs;

  return `<tr>
    <td class="text-muted">${esc(formatBucket(scale, start))}</td>
    <td class="bar-cell"><div class="lobby-bar">${segments.join('')}${future}</div></td>
    <td class="text-end fw-semibold">${elapsed > 0 ? `${Math.round(waitingMs / elapsed * 100)}%` : '—'}</td>
    <td class="text-end">${created.length}</td>
    <td class="text-end">${percent(acceptedWaits.length, created.length)}</td>
    <td class="text-end">${percent(canceledWaits.length, created.length)}</td>
    <td class="text-end">${percent(abandoned, acceptedWaits.length)}</td>
    <td class="text-end">${waitStats(acceptedWaits)}</td>
    <td class="text-end">${waitStats(canceledWaits)}</td>
  </tr>`;
}

/**
 * Tick labels above bars, positioned on the most recent bucket
 * (for months, length differs, so positions are approximate for other months).
 */
function renderTicks(scale, { start, end }) {
  const length = end.getTime() - start.getTime();
  const ticks = [];

  if (scale === 'day') {
    for (let h = 0; h <= 24; h += 3) {
      ticks.push([h / 24, `${h}h`]);
    }
  } else if (scale === 'week') {
    for (let d = 0; d < 7; ++d) {
      const date = new Date(start);
      date.setDate(date.getDate() + d);
      ticks.push([(d + 0.5) / 7, date.toLocaleDateString(undefined, { weekday: 'short' })]);
    }
  } else {
    for (const day of [1, 8, 15, 22, 29]) {
      const date = new Date(start);
      date.setDate(day);
      ticks.push([(date.getTime() - start.getTime()) / length, String(day)]);
    }
  }

  return `<div class="lobby-ticks">${ticks.map(([x, label]) =>
    `<span style="left: ${(Math.min(Math.max(x, 0.02), 0.98) * 100).toFixed(2)}%">${esc(label)}</span>`).join('')}</div>`;
}

function formatBucket(scale, start) {
  if (scale === 'day') {
    return start.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  }

  if (scale === 'week') {
    return start.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  return start.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

function formatTime(ms) {
  return new Date(ms).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}

/** Formats a duration in ms, like "42s", "3m 12s", "1h 05m", "2d 3h". */
function formatWait(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${String(m % 60).padStart(2, '0')}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

function percent(n, total) {
  if (!total) return '<span class="text-muted">—</span>';
  return `${Math.round(n / total * 100)}% <span class="text-muted">(${n})</span>`;
}

function waitStats(waits) {
  if (!waits.length) return '<span class="text-muted">—</span>';

  const avg = waits.reduce((sum, w) => sum + w, 0) / waits.length;

  return `${formatWait(avg)} <span class="text-muted">/</span> ${formatWait(median(waits))}`;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
