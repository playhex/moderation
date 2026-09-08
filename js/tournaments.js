import { state, api } from './api.js';
import { esc, formatDate, formatDuration, relativeTime } from './utils.js';
import { updateNav, pageNav } from './nav.js';

const QUICK_DAYS = [4, 6, 10];

export async function renderTournaments() {
  updateNav();
  pageNav('tournaments');

  document.getElementById('app').innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h4 class="mb-0">Tournaments featuring</h4>
      <button id="btn-refresh" class="btn btn-sm btn-outline-secondary">Refresh</button>
    </div>
    <div id="tournaments-body">
      <div class="text-center py-5"><div class="spinner-border text-secondary"></div></div>
    </div>`;

  document.getElementById('btn-refresh').addEventListener('click', async () => {
    state.tournaments = null;
    document.getElementById('tournaments-body').innerHTML =
      '<div class="text-center py-5"><div class="spinner-border text-secondary"></div></div>';
    await loadTournaments();
  });

  await loadTournaments();
}

async function loadTournaments() {
  try {
    // Public endpoint, returns active tournaments. Keep only those not yet started.
    const tournaments = state.tournaments
      ?? (await api('GET', '/api/tournaments/active')).filter(t => t.state === 'created');
    state.tournaments = tournaments;
    renderList(tournaments);
  } catch (e) {
    document.getElementById('tournaments-body').innerHTML =
      `<div class="alert alert-danger">${esc(e.message)}</div>`;
  }
}

/**
 * Editing a tournament requires an admin token,
 * so it fails when logged in with a moderator token.
 */
function alertError(action, e) {
  alert(`Could not ${action}: ${e.message}\n\nNote: this requires an admin token, a moderator token is not enough.`);
}

function renderList(tournaments) {
  if (!tournaments.length) {
    document.getElementById('tournaments-body').innerHTML = '<p class="text-muted">No incoming tournament.</p>';
    return;
  }

  const rows = tournaments.map(t => {
    const featured = formatDuration(t.featuredFromInSeconds);
    const featuredHtml = featured
      ? `<span class="text-success">${esc(featured)} before start</span>`
      : '<span class="text-muted">not featured</span>';

    const quickButtons = QUICK_DAYS.map(days => `
      <button class="btn btn-sm btn-outline-primary btn-feature" data-slug="${esc(t.slug)}" data-days="${days}">${days} days</button>
    `).join('');

    return `<tr data-slug="${esc(t.slug)}">
      <td>
        <a href="${esc(state.apiBase)}/tournaments/${encodeURIComponent(t.slug)}" target="_blank" class="text-decoration-none">${esc(t.title)}</a>
      </td>
      <td class="text-nowrap">${esc(formatDate(t.startOfficialAt))}</td>
      <td class="text-nowrap">${esc(relativeTime(t.startOfficialAt))}</td>
      <td class="text-nowrap">${featuredHtml}</td>
      <td>
        <div class="d-flex flex-wrap gap-1 align-items-center">
          ${quickButtons}
          <div class="input-group input-group-sm" style="width: 10rem;">
            <input type="number" min="0" step="1" class="form-control input-days" placeholder="days">
            <button class="btn btn-outline-primary btn-feature-custom" data-slug="${esc(t.slug)}">Set</button>
          </div>
          <button class="btn btn-sm btn-outline-secondary btn-feature" data-slug="${esc(t.slug)}" data-days="0">Remove</button>
          <button class="btn btn-sm btn-outline-danger btn-cancel ms-3" data-slug="${esc(t.slug)}">Cancel tournament</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  document.getElementById('tournaments-body').innerHTML = `
    <div class="table-responsive">
      <table class="table table-sm align-middle">
        <thead>
          <tr>
            <th>Tournament</th>
            <th>Start</th>
            <th>In</th>
            <th>Featured from</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  document.querySelectorAll('.btn-feature').forEach(btn => {
    btn.addEventListener('click', () => setFeatured(btn.dataset.slug, parseInt(btn.dataset.days, 10)));
  });

  document.querySelectorAll('.btn-feature-custom').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = btn.closest('tr').querySelector('.input-days');
      const days = parseFloat(input.value);

      if (isNaN(days) || days < 0) {
        alert('Enter a valid number of days.');
        return;
      }

      setFeatured(btn.dataset.slug, days);
    });
  });

  document.querySelectorAll('.btn-cancel').forEach(btn => {
    btn.addEventListener('click', () => cancelTournament(btn.dataset.slug));
  });
}

async function setFeatured(slug, days) {
  const featuredFromInSeconds = Math.round(days * 86400);

  try {
    await api('PATCH', `/api/admin/tournaments/${encodeURIComponent(slug)}`, { featuredFromInSeconds });
  } catch (e) {
    alertError(`update "${slug}"`, e);
    return;
  }

  const tournament = state.tournaments.find(t => t.slug === slug);
  if (tournament) tournament.featuredFromInSeconds = featuredFromInSeconds;
  renderList(state.tournaments);
}

async function cancelTournament(slug) {
  if (!confirm(`Cancel tournament "${slug}"? This cannot be undone.`)) {
    return;
  }

  try {
    await api('DELETE', `/api/admin/tournaments/${encodeURIComponent(slug)}`);
  } catch (e) {
    alertError(`cancel "${slug}"`, e);
    return;
  }

  state.tournaments = state.tournaments.filter(t => t.slug !== slug);
  renderList(state.tournaments);
}
