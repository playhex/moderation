import { state } from './api.js';
import { getRoute, navigate } from './utils.js';
import { renderLogin } from './login.js';
import { renderMessages } from './messages.js';
import { renderPlayers } from './players.js';
import { renderAction } from './action.js';

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
    default:         navigate(state.apiKey ? 'messages' : 'login');
  }
}

window.addEventListener('hashchange', render);
render();
