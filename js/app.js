import { state } from './api.js';
import { getRoute, navigate, loadSeen } from './utils.js';
import { renderLogin } from './login.js';
import { renderMessages } from './messages.js';
import { renderPlayers } from './players.js';
import { renderAction } from './action.js';
import { renderAvatars } from './avatars.js';
import { renderHistory } from './history.js';
import { renderTournaments } from './tournaments.js';
import { refreshAllCounts } from './counts.js';

async function initCounts(path) {
  state.countsInitialized = true;
  await refreshAllCounts(path);
}

async function render() {
  const { path, params } = getRoute();

  if (!state.apiKey && path !== 'login') {
    navigate('login');
    return;
  }

  if (state.apiKey && path === 'login') {
    navigate('messages');
    return;
  }

  if (state.apiKey && state.seen === null) {
    // Fetch "seen" dates from server before rendering any page needing them
    try { await loadSeen(); } catch (_) { state.seen = {}; }
  }

  switch (path) {
    case 'login':    renderLogin(); break;
    case 'messages': await renderMessages(); break;
    case 'players':  await renderPlayers(); break;
    case 'action':   await renderAction(params); break;
    case 'avatars':  await renderAvatars(); break;
    case 'history':  await renderHistory(); break;
    case 'tournaments': await renderTournaments(); break;
    default:         navigate(state.apiKey ? 'messages' : 'login');
  }

  if (state.apiKey && !state.countsInitialized) {
    initCounts(path);
  }
}

window.addEventListener('hashchange', render);
render();
