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
  .join-history { width: auto; }
  .join-history th, .join-history td { border: none; padding: 1px; text-align: center; white-space: nowrap; min-width: 2.6rem; }
  .join-history thead th { font-size: 0.7rem; line-height: 1.1; vertical-align: bottom; }
  .join-history td.cell { background-color: var(--bs-secondary-bg); font-size: 0.75rem; }
  .join-history td.global { font-weight: 600; }
  .join-history td.n-cell { font-size: 0.7rem; }
  .join-history .label-col { position: sticky; left: 0; z-index: 1; background: var(--bs-body-bg); text-align: left; padding-right: 0.5rem; min-width: 4.5rem; }
  .join-history .biased { opacity: 0.4; }
  .join-history tr.average-row > * { border-top: 2px solid var(--bs-border-color); }
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
    <div id="live-lobby-body">${SPINNER}</div>
    <h5 class="mt-4">Chances to be joined within first minute</h5>
    <p class="small text-muted">
      By week, by 4 hours slots in local time, most recent on the right.
      Kaplan-Meier estimation, like on the statistics page: canceled games only tell that host waited at least until cancel.
      Greener means easier to get joined, relatively to the whole table.
      In parentheses: less than ${JOIN_HISTORY_MIN_GAMES} games, not reliable.
    </p>
    <div id="join-history-body">${SPINNER}</div>`;

  document.getElementById('btn-refresh').addEventListener('click', async () => {
    state.liveLobby = null;
    document.getElementById('live-lobby-body').innerHTML = SPINNER;
    document.getElementById('join-history-body').innerHTML = SPINNER;
    await Promise.all([loadLiveLobby(scale), loadJoinHistory()]);
  });

  await Promise.all([loadLiveLobby(scale), loadJoinHistory()]);
}

const FIRST_MINUTE_MS = 60 * 1000;
const JOIN_HISTORY_SLOT_HOURS = 4;
const JOIN_HISTORY_MIN_GAMES = 10;

/**
 * Before this date, canceled games had no endedAt, so they are missing from history,
 * and only accepted games were counted: join chances are overestimated.
 */
const CANCELED_GAMES_TRACKED_SINCE = new Date('2025-09-18T12:00:00Z').getTime();

/**
 * Join chances history, as much as server allows (server limits history depth).
 */
async function loadJoinHistory() {
  const body = document.getElementById('join-history-body');

  try {
    state.liveLobby ??= {};
    const data = state.liveLobby.all
      ?? await api('GET', `/api/admin/live-lobby-history?since=${encodeURIComponent(new Date('2020-01-01').toISOString())}`);
    state.liveLobby.all = data;

    body.innerHTML = renderJoinHistory(data.games);

    // Show most recent weeks first
    const scroll = body.querySelector('.join-history-scroll');
    if (scroll) scroll.scrollLeft = scroll.scrollWidth;
  } catch (e) {
    body.innerHTML = `<div class="alert alert-danger">${esc(e.message)}</div>`;
  }
}

/**
 * Probability to be joined within first minute.
 * Kaplan-Meier estimator, canceled games are censored.
 *
 * @param {[number, 0|1][]} waits [wait duration in ms, 1 if joined else 0 if canceled]
 */
function firstMinuteJoinChance(waits) {
  const sorted = [...waits].sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  let atRisk = sorted.length;
  let survival = 1;
  let i = 0;

  while (i < sorted.length && sorted[i][0] <= FIRST_MINUTE_MS) {
    const t = sorted[i][0];
    let joined = 0;
    let canceled = 0;

    for (; i < sorted.length && sorted[i][0] === t; ++i) {
      if (sorted[i][1] === 1) ++joined;
      else ++canceled;
    }

    if (joined > 0) survival *= 1 - joined / atRisk;
    atRisk -= joined + canceled;
  }

  return 1 - survival;
}

function mondayOf(ms) {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - (date.getDay() + 6) % 7);

  return date;
}

function renderJoinHistory(games) {
  if (games.length === 0) {
    return '<p class="text-muted">No data.</p>';
  }

  const slotsCount = 24 / JOIN_HISTORY_SLOT_HOURS;
  const rows = [];

  // Skip first week, which is partial because history depth is limited by server. Last row is current week
  const firstWeek = mondayOf(games[0][0]);
  firstWeek.setDate(firstWeek.getDate() + 7);

  for (let week = mondayOf(Date.now()); week >= firstWeek; week = new Date(week.getFullYear(), week.getMonth(), week.getDate() - 7)) {
    const end = new Date(week.getFullYear(), week.getMonth(), week.getDate() + 7).getTime();
    const start = week.getTime();
    const slots = Array.from({ length: slotsCount }, () => []);
    const all = [];

    for (const [createdAt, closedAt, accepted] of games) {
      if (createdAt < start || createdAt >= end) continue;

      const wait = [Math.max(0, closedAt - createdAt), accepted];
      slots[Math.floor(new Date(createdAt).getHours() / JOIN_HISTORY_SLOT_HOURS)].push(wait);
      all.push(wait);
    }

    rows.push({
      week,
      biased: start < CANCELED_GAMES_TRACKED_SINCE,
      slots: slots.map(waits => ({ n: waits.length, chance: waits.length ? firstMinuteJoinChance(waits) : null })),
      global: { n: all.length, chance: all.length ? firstMinuteJoinChance(all) : null },
    });
  }

  // Color scale relative to the whole table, reliable cells only, to see evolution over time
  const reliable = rows
    .filter(row => !row.biased)
    .flatMap(row => row.slots)
    .filter(cell => cell.n >= JOIN_HISTORY_MIN_GAMES)
    .map(cell => cell.chance);
  const min = reliable.length ? Math.min(...reliable) : 0;
  const max = reliable.length ? Math.max(...reliable) : 1;

  const cell = ({ n, chance }, className = '') => {
    if (chance === null) {
      return `<td class="cell ${className}"><span class="text-muted">—</span></td>`;
    }

    const percent = `${Math.round(chance * 100)}%`;
    const ratio = max === min ? 0.5 : Math.min(1, Math.max(0, (chance - min) / (max - min)));
    const alpha = (0.08 + 0.72 * ratio).toFixed(3);
    const reliableCell = n >= JOIN_HISTORY_MIN_GAMES;

    return `<td class="cell ${className}" style="background-color: rgba(var(--bs-success-rgb), ${alpha})" title="${n} games">${reliableCell ? percent : `<span class="text-muted">(${percent})</span>`}</td>`;
  };

  const hasBiased = rows.some(row => row.biased);

  // Oldest week on the left, most recent on the right
  const columns = [...rows].reverse();
  const biasedClass = row => row.biased ? 'biased' : '';

  return `<div class="table-responsive join-history-scroll">
    <table class="table table-sm join-history small mb-1">
      <thead>
        <tr>
          <th class="label-col"></th>
          ${columns.map(row => `<th class="text-muted fw-normal ${biasedClass(row)}" title="${esc(row.week.toLocaleDateString(undefined, { dateStyle: 'full' }))}">
            ${esc(String(row.week.getDate()))}<br>${esc(row.week.toLocaleDateString(undefined, { month: 'short' }))}${row.biased ? '*' : ''}
          </th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${Array.from({ length: slotsCount }, (_, i) => `<tr>
          <th class="label-col text-muted fw-normal">${i * JOIN_HISTORY_SLOT_HOURS}h</th>
          ${columns.map(row => cell(row.slots[i], biasedClass(row))).join('')}
        </tr>`).join('')}
        <tr class="average-row">
          <th class="label-col">Average</th>
          ${columns.map(row => cell(row.global, `global ${biasedClass(row)}`)).join('')}
        </tr>
        <tr>
          <th class="label-col text-muted fw-normal" title="Games created during the week">Games</th>
          ${columns.map(row => `<td class="text-muted n-cell ${biasedClass(row)}">${row.global.n}</td>`).join('')}
        </tr>
      </tbody>
    </table>
  </div>
  ${hasBiased ? `<p class="small text-muted">* Overestimated: canceled games were not tracked before ${esc(new Date(CANCELED_GAMES_TRACKED_SINCE).toLocaleDateString())}, only accepted games were counted.</p>` : ''}`;
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
