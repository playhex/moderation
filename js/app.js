import { state } from './api.js';
import { getRoute, navigate } from './utils.js';
import { renderLogin } from './login.js';
import { renderMessages } from './messages.js';
import { renderPlayers } from './players.js';
import { renderAction } from './action.js';
import { renderAvatars } from './avatars.js';
import { renderHistory } from './history.js';
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

  switch (path) {
    case 'login':    renderLogin(); break;
    case 'messages': await renderMessages(); break;
    case 'players':  await renderPlayers(); break;
    case 'action':   await renderAction(params); break;
    case 'avatars':  await renderAvatars(); break;
    case 'history':  await renderHistory(); break;
    default:         navigate(state.apiKey ? 'messages' : 'login');
  }

  if (state.apiKey && !state.countsInitialized) {
    initCounts(path);
  }
}

window.addEventListener('hashchange', render);
render();
