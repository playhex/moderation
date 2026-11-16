import { state, api } from './api.js';
import { esc, getRoute } from './utils.js';
import { updateNav, pageNav } from './nav.js';
import { liveLobbySectionHtml, loadLiveLobbySection } from './live-lobby.js';

/**
 * Stats on last 2 years, by day, week or 28 days:
 * activity, acquisition, retention, lobby and games quality, then live lobby details.
 * Computed by server, cached 24h.
 */

const PERIODS = {
  day: 'Day',
  week: 'Week',
  '28d': '28 days',
};

/** Ratios computed on less items are not reliable, shown in parentheses and not used for colors */
const MIN_ITEMS = 10;

const SPINNER = '<div class="text-center py-5"><div class="spinner-border text-secondary"></div></div>';

/**
 * Metrics, by section, in display order.
 *
 * - format: count, percent, duration (ms), number
 * - lowerIsBetter: greener when lower
 * - lobby: overestimated before canceled lobby games were tracked
 * - partial: value of current period is incomplete (counts), not used for colors
 */
const SECTIONS = [
  {
    title: 'Activity',
    metrics: [
      { key: 'activePlayers', label: 'Active players', format: 'count', partial: true,
        description: 'Distinct players who finished at least one game against a human, with at least 4 moves.' },
      { key: 'activeAccounts', label: '… accounts', format: 'count', partial: true,
        description: 'Active players having an account (now, guests upgraded since are counted as accounts).' },
      { key: 'activeGuests', label: '… guests', format: 'count', partial: true,
        description: 'Active players who are still guests.' },
      { key: 'liveGames', label: 'Live games vs human', format: 'count', partial: true,
        description: 'Finished games against a human with at least 4 moves, initial time less than 1 day.' },
      { key: 'correspondenceGames', label: 'Corresp. games vs human', format: 'count', partial: true,
        description: 'Finished games against a human with at least 4 moves, initial time 1 day or more.' },
      { key: 'botGames', label: 'Games vs bot', format: 'count', partial: true,
        description: 'Finished games against a bot, with at least 4 moves.' },
    ],
  },
  {
    title: 'Acquisition and activation',
    metrics: [
      { key: 'newGuests', label: 'New guests', format: 'count', partial: true,
        description: 'Guest players created. Every new visitor gets one, so it includes visitors who never played, and maybe crawlers.' },
      { key: 'newPlayingGuests', label: 'New guests who played', format: 'count', partial: true,
        description: 'Guest players created during the period who finished at least one game with at least 4 moves, against a human or a bot.' },
      { key: 'newAccounts', label: 'New accounts (direct)', format: 'count', partial: true,
        description: 'Accounts created directly, without playing as guest before.' },
      { key: 'guestUpgrades', label: 'Guests → account', format: 'count', partial: true,
        description: 'Guests who created an account during the period.' },
      { key: 'activationGuests', label: 'Activation of guests', format: 'percent',
        description: 'New guests who played (see above) who finished a game against a human, with at least 4 moves, within 24 hours after creation.' },
      { key: 'activationAccounts', label: 'Activation of accounts', format: 'percent',
        description: 'New accounts created directly during the period who finished a game against a human, with at least 4 moves, within 24 hours.' },
      { key: 'guestConversion', label: 'Guest conversion', format: 'percent',
        description: 'Guests who finished their first game against a human during the period, and created an account since (any time later, so lower for recent periods).' },
    ],
  },
  {
    title: 'Retention',
    metrics: [
      { key: 'firstGamePlayers', label: 'New human players', format: 'count', partial: true,
        description: 'Players who finished their first game against a human (with at least 4 moves) during the period.' },
      { key: 'retentionD7', label: 'Retention D7', format: 'percent',
        description: 'New human players of the period who finished another game against a human at least 7 days after their first one. Empty until all players of the period had 7 days to come back.' },
      { key: 'retentionD30', label: 'Retention D30', format: 'percent',
        description: 'Same, at least 30 days after their first game.' },
      { key: 'stickiness', label: 'DAU / MAU', format: 'percent',
        description: 'Daily active players / active players on last 28 days, averaged on days of the period. Active: finished a game against a human, with at least 4 moves. Higher means players come back more often.' },
    ],
  },
  {
    title: 'Lobby quality',
    metrics: [
      { key: 'lobbyGames', label: 'Lobby games', format: 'count', partial: true,
        description: 'Live games created in lobby, open to anyone, not tournament or ladder matches, nor rematches.' },
      { key: 'lobbyAccepted', label: 'Joined', format: 'percent', lobby: true,
        description: 'Lobby games that have been joined, at any time.' },
      { key: 'lobbyJoinedFirstMinute', label: 'Joined within 1 min', format: 'percent', lobby: true,
        description: 'Chances to be joined within first minute (Kaplan-Meier: canceled games only tell that host waited at least until cancel).' },
      { key: 'lobbyWaitMedian', label: 'Median wait (joined)', format: 'duration', lowerIsBetter: true,
        description: 'Median waiting time of joined lobby games.' },
      { key: 'lobbyNotEmpty', label: 'Lobby not empty', format: 'percent', lobby: true,
        description: 'Part of the time with at least one game waiting in lobby.' },
      { key: 'lobbyHostsFoundGame', label: 'Hosts who found a game', format: 'percent', lobby: true,
        description: 'Hosts wanting to play (consecutive lobby games created by a same host, less than 10 min apart) who started a live game: their game being joined, or by joining another game, within 5 minutes after their last game left lobby.' },
    ],
  },
  {
    title: 'Game quality',
    metrics: [
      { key: 'rematchRate', label: 'Rematch rate', format: 'percent',
        description: 'Finished games against a human, with at least 4 moves, followed by a started rematch.' },
      { key: 'abortedRate', label: 'Aborted games', format: 'percent', lowerIsBetter: true,
        description: 'Finished games against a human that stopped before 4 moves (resign, time out...). Not counted anywhere else.' },
      { key: 'ratingGapMedian', label: 'Rating gap (ranked)', format: 'number', lowerIsBetter: true,
        description: 'Median rating difference between both players before game, in ranked games against a human. Lower means more balanced games.' },
    ],
  },
];

const STYLE = `<style>
  .stats-table { width: auto; }
  .stats-table th, .stats-table td { border: none; padding: 1px; text-align: center; white-space: nowrap; min-width: 2.6rem; font-size: 0.75rem; }
  .stats-table td.cell { background-color: var(--bs-secondary-bg); }
  .stats-table .label-col { position: sticky; left: 0; z-index: 1; background: var(--bs-body-bg); text-align: left; padding-right: 0.5rem; min-width: 11rem; font-weight: normal; }
  .stats-table tr.section-row > * { padding-top: 1rem; vertical-align: bottom; }
  .stats-table tr.section-row th.label-col { font-weight: 600; font-size: 0.9rem; }
  .stats-table tr.section-row th.date { font-size: 0.65rem; line-height: 1.1; color: var(--bs-secondary-color); font-weight: normal; }
  .stats-table .biased { opacity: 0.4; }
  .stats-table .partial-period { font-style: italic; }
  .stats-table abbr { text-decoration: none; cursor: help; }
</style>`;

export async function renderStats() {
  updateNav();
  pageNav('stats');

  const params = getRoute().params;
  const period = PERIODS[params.get('period')] ? params.get('period') : 'week';

  document.getElementById('app').innerHTML = `${STYLE}
    <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
      <h4 class="mb-0">Stats</h4>
      <div class="d-flex gap-2">
        <div class="btn-group btn-group-sm" role="group">
          ${Object.entries(PERIODS).map(([key, label]) => `
            <a href="#/stats?period=${key}" class="btn ${key === period ? 'btn-secondary' : 'btn-outline-secondary'}">${esc(label)}</a>`).join('')}
        </div>
        <button id="btn-refresh" class="btn btn-sm btn-outline-secondary" title="Stats are cached 24h by server, this recomputes them">Recompute</button>
      </div>
    </div>
    <p class="small text-muted mb-2">
      Last 2 years, by ${esc(PERIODS[period].toLowerCase())} (UTC, weeks start on monday), most recent on the right.
      Greener is better, relatively to the rest of the row. Hover a label for its definition, a cell for its date and number of items.
      In parentheses: computed on less than ${MIN_ITEMS} items, not reliable. In italic: current period, not finished.
    </p>
    <div id="stats-body">${SPINNER}</div>
    <h4 class="mt-5">Live lobby</h4>
    ${liveLobbySectionHtml()}`;

  document.getElementById('btn-refresh').addEventListener('click', async () => {
    state.stats = null;
    document.getElementById('stats-body').innerHTML = SPINNER;
    await Promise.all([loadStats(period, true), loadLiveLobbySection(period, true)]);
  });

  await Promise.all([loadStats(period), loadLiveLobbySection(period)]);
}

async function loadStats(period, refresh = false) {
  const body = document.getElementById('stats-body');

  try {
    state.stats ??= {};
    const stats = state.stats[period]
      ?? await api('GET', `/api/admin/stats?period=${encodeURIComponent(period)}${refresh ? '&refresh=1' : ''}`);
    state.stats[period] = stats;

    body.innerHTML = renderStatsTable(stats);

    // Show most recent periods first
    const scroll = body.querySelector('.stats-scroll');
    if (scroll) scroll.scrollLeft = scroll.scrollWidth;
  } catch (e) {
    body.innerHTML = `<div class="alert alert-danger">${esc(e.message)}
      <br><small>Note: this requires an admin token, a moderator token is not enough.</small></div>`;
  }
}

function renderStatsTable(stats) {
  const { starts, metrics, period } = stats;
  const last = starts.length - 1;
  const biased = starts.map(start => start < stats.lobbyBiasedBefore);
  const hasBiased = biased.some(Boolean);

  const dateHeaders = starts.map((start, i) => {
    const date = new Date(start);
    const full = date.toLocaleDateString(undefined, { dateStyle: 'full', timeZone: 'UTC' });
    const showYear = i === 0 || new Date(starts[i - 1]).getUTCFullYear() !== date.getUTCFullYear();

    return `<th class="date ${i === last ? 'partial-period' : ''}" title="${esc(full)}">
      ${showYear ? `${date.getUTCFullYear()}<br>` : ''}${date.getUTCDate()}<br>${esc(date.toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' }))}
    </th>`;
  }).join('');

  const rows = SECTIONS.map(section => `
    <tr class="section-row">
      <th class="label-col">${esc(section.title)}</th>
      ${dateHeaders}
    </tr>
    ${section.metrics.map(metric => renderMetricRow(metric, metrics[metric.key], starts, biased)).join('')}`).join('');

  return `
    <p class="small text-muted mb-1">Computed ${esc(new Date(stats.computedAt).toLocaleString())}.</p>
    <div class="table-responsive stats-scroll">
      <table class="table table-sm stats-table mb-1">
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${hasBiased ? `<p class="small text-muted">Faded lobby values are overestimated: canceled lobby games were not tracked before ${esc(new Date(stats.lobbyBiasedBefore).toLocaleDateString())}.</p>` : ''}
    <details class="small mt-2">
      <summary class="text-muted">Definitions</summary>
      ${SECTIONS.map(section => `
        <h6 class="mt-3">${esc(section.title)}</h6>
        <dl class="row mb-0">
          ${section.metrics.map(m => `<dt class="col-sm-3 fw-normal">${esc(m.label)}</dt><dd class="col-sm-9 text-muted">${esc(m.description)}</dd>`).join('')}
        </dl>`).join('')}
    </details>
    ${period === 'day' ? '<p class="small text-muted mt-2">By day, ratios are often computed on few items: prefer week or 28 days to see trends.</p>' : ''}`;
}

function renderMetricRow(metric, data, starts, biased) {
  if (!data) {
    return '';
  }

  const last = starts.length - 1;
  const { values, n } = data;
  const isReliable = i => values[i] !== null
    && (!n || n[i] >= MIN_ITEMS)
    && !(metric.lobby && biased[i])
    && !(metric.partial && i === last);

  // Color scale relative to the row
  const scale = values.filter((v, i) => isReliable(i));
  const min = scale.length ? Math.min(...scale) : 0;
  const max = scale.length ? Math.max(...scale) : 1;

  const cells = values.map((value, i) => {
    const classes = ['cell'];

    if (metric.lobby && biased[i]) classes.push('biased');
    if (i === last) classes.push('partial-period');

    const date = new Date(starts[i]).toLocaleDateString(undefined, { dateStyle: 'medium', timeZone: 'UTC' });
    const title = n ? `${date}: ${n[i]} items` : date;

    if (value === null) {
      return `<td class="${classes.join(' ')}" title="${esc(title)}"><span class="text-muted">—</span></td>`;
    }

    let ratio = max === min ? 0.5 : Math.min(1, Math.max(0, (value - min) / (max - min)));
    if (metric.lowerIsBetter) ratio = 1 - ratio;
    const alpha = (0.08 + 0.72 * ratio).toFixed(3);
    const text = formatValue(metric.format, value);
    const reliable = !n || n[i] >= MIN_ITEMS;

    return `<td class="${classes.join(' ')}" style="background-color: rgba(var(--bs-success-rgb), ${alpha})" title="${esc(title)}">${reliable ? esc(text) : `<span class="text-muted">(${esc(text)})</span>`}</td>`;
  }).join('');

  return `<tr>
    <th class="label-col"><abbr title="${esc(metric.description)}">${esc(metric.label)}</abbr></th>
    ${cells}
  </tr>`;
}

function formatValue(format, value) {
  switch (format) {
    case 'percent':
      return `${Math.round(value * 100)}%`;

    case 'duration': {
      const s = Math.round(value / 1000);
      if (s < 60) return `${s}s`;
      const m = Math.floor(s / 60);
      if (m < 60) return `${m}m${String(s % 60).padStart(2, '0')}`;
      return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
    }

    case 'count':
      if (value < 1000) return String(value);
      if (value < 10000) return `${(value / 1000).toFixed(1)}k`;
      return `${Math.round(value / 1000)}k`;

    default:
      return String(Math.round(value));
  }
}
