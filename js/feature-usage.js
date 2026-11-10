import { state, api } from './api.js';
import { esc, formatDate, relativeTime } from './utils.js';
import { updateNav, pageNav } from './nav.js';

/**
 * Features to display, in this order.
 * `key` is the key in /api/admin/feature-usage response,
 * `secondary` renders an optional extra number.
 */
const FEATURES = [
  { key: 'pronouns', label: 'Pronouns', unit: 'players' },
  { key: 'countryFlags', label: 'Country flags', unit: 'players', secondary: u => `${u.distinctFlags} distinct flags` },
  { key: 'avatars', label: 'Avatars', unit: 'players' },
  { key: 'discordAccounts', label: 'Discord accounts linked', unit: 'players' },
  { key: 'littleGolemAccounts', label: 'Little Golem accounts linked', unit: 'players' },
  { key: 'externalGameImports', label: 'External game imports', unit: 'imports', secondary: u => `by ${u.players} players` },
  { key: 'hexplorerStudies', label: 'Hexplorer studies', unit: 'studies', secondary: u => `by ${u.players} players` },
];

const SPINNER = '<div class="text-center py-5"><div class="spinner-border text-secondary"></div></div>';

export async function renderFeatureUsage() {
  updateNav();
  pageNav('feature-usage');

  document.getElementById('app').innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h4 class="mb-0">Feature usage</h4>
      <button id="btn-refresh" class="btn btn-sm btn-outline-secondary">Refresh</button>
    </div>
    <div id="feature-usage-body">${SPINNER}</div>`;

  document.getElementById('btn-refresh').addEventListener('click', async () => {
    state.featureUsage = null;
    document.getElementById('feature-usage-body').innerHTML = SPINNER;
    await loadFeatureUsage();
  });

  await loadFeatureUsage();
}

async function loadFeatureUsage() {
  const body = document.getElementById('feature-usage-body');

  try {
    const usage = state.featureUsage ?? await api('GET', '/api/admin/feature-usage');
    state.featureUsage = usage;
    // Count only cards first, smaller, then cards with last players
    const countOnly = FEATURES.filter(f => usage[f.key] && !usage[f.key].lastPlayers);
    const withPlayers = FEATURES.filter(f => usage[f.key]?.lastPlayers);

    body.innerHTML = `
      <div class="row g-3 mb-3">${countOnly.map(f => renderCard(f, usage[f.key], 'col-sm-6 col-lg-3')).join('')}</div>
      <div class="row g-3">${withPlayers.map(f => renderCard(f, usage[f.key], 'col-sm-6 col-lg-4')).join('')}</div>`;
  } catch (e) {
    body.innerHTML = `<div class="alert alert-danger">${esc(e.message)}
      <br><small>Note: this requires an admin token, a moderator token is not enough.</small></div>`;
  }
}

function renderCard(feature, usage, colClass) {
  const lastPlayers = usage.lastPlayers
    ? `<hr class="my-2">
      <div class="small text-muted mb-1">Last players</div>
      ${usage.lastPlayers.length ? `<ul class="list-unstyled mb-0 small">
        ${usage.lastPlayers.map(p => `<li class="d-flex justify-content-between gap-2">
          <a href="${esc(state.apiBase)}/@${esc(p.slug)}" target="_blank" class="text-truncate">${esc(p.pseudo)}</a>
          <span class="text-muted text-nowrap" title="${esc(formatDate(p.lastUsedAt))}">${esc(relativeTime(p.lastUsedAt))}</span>
        </li>`).join('')}
      </ul>` : '<div class="small text-muted">None yet.</div>'}`
    : '';

  return `<div class="${colClass}">
    <div class="card h-100">
      <div class="card-body">
        <h6 class="card-title text-muted">${esc(feature.label)}</h6>
        <div><span class="fs-2 fw-semibold">${esc(usage.count)}</span> <span class="text-muted">${esc(feature.unit)}</span></div>
        ${feature.secondary ? `<div class="small text-muted">${esc(feature.secondary(usage))}</div>` : ''}
        ${lastPlayers}
      </div>
    </div>
  </div>`;
}
