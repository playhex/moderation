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

async function refreshVideos() {
  const videos = state.videos ?? await api('GET', '/api/admin/moderation/videos');
  state.videos = videos;
  const lastRead = getLastRead('videos');
  setTabCount('videos', lastRead ? videos.filter(v => new Date(v.createdAt) > lastRead).length : videos.length);
}

async function refreshPuzzles() {
  const puzzles = state.puzzles ?? await api('GET', '/api/admin/moderation/puzzles');
  state.puzzles = puzzles;
  const lastRead = getLastRead('puzzles');
  setTabCount('puzzles', lastRead ? puzzles.filter(p => new Date(p.updatedAt) > lastRead).length : puzzles.length);
}

async function refreshAutomaticActions() {
  const actions = state.automaticActions ?? await api('GET', '/api/admin/moderation/automatic-actions');
  state.automaticActions = actions;
  const lastRead = getLastRead('automatic-actions');
  setTabCount('automatic-actions', lastRead ? actions.filter(a => new Date(a.createdAt) > lastRead).length : actions.length);
}

export async function refreshAllCounts(path) {
  await Promise.all([
    refreshMessages().catch(() => {}),
    refreshPlayers().catch(() => {}),
    refreshAvatars().catch(() => {}),
    refreshVideos().catch(() => {}),
    refreshPuzzles().catch(() => {}),
    refreshAutomaticActions().catch(() => {}),
  ]);
  pageNav(path);
}
