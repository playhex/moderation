import { state, api } from './api.js';
import { getLastRead, setTabCount } from './utils.js';
import { pageNav } from './nav.js';

async function refreshMessages() {
  const msgs = state.messages ?? await api('GET', '/api/admin/moderation/chat-messages');
  state.messages = msgs;
  const lastRead = getLastRead('messages');
  setTabCount('messages', lastRead ? msgs.filter(e => new Date(e.message.createdAt) > lastRead).length : msgs.length);
}

async function refreshPlayers() {
  const players = state.players ?? await api('GET', '/api/admin/moderation/players');
  state.players = players;
  const lastRead = getLastRead('players');
  setTabCount('players', lastRead ? players.filter(p => new Date(p.registeredAt ?? p.createdAt) > lastRead).length : players.length);
}

async function refreshAvatars() {
  const players = state.avatars ?? await api('GET', '/api/admin/moderation/avatar-uploads');
  state.avatars = players;
  const lastRead = getLastRead('avatars');
  setTabCount('avatars', lastRead ? players.filter(p => new Date(p.avatarUpdatedAt) > lastRead).length : players.length);
}

export async function refreshAllCounts(path) {
  await Promise.all([
    refreshMessages().catch(() => {}),
    refreshPlayers().catch(() => {}),
    refreshAvatars().catch(() => {}),
  ]);
  pageNav(path);
}
