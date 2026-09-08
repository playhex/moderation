import { state, api } from './api.js';

export function relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const future = diff < 0;
  const wrap = str => future ? `in ${str}` : `${str} ago`;
  const s = Math.floor(Math.abs(diff) / 1000);
  if (s < 60) return wrap(`${s}s`);
  const m = Math.floor(s / 60);
  if (m < 60) return wrap(`${m}m`);
  const h = Math.floor(m / 60);
  if (h < 24) return wrap(`${h}h`);
  return wrap(`${Math.floor(h / 24)}d`);
}

/** Formats a number of seconds like "4d 6h", or null if 0 or negative. */
export function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return null;
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m && !d) parts.push(`${m}m`);
  return parts.length ? parts.join(' ') : `${seconds}s`;
}

export function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

export function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Keys are playhex translation keys, values are English labels. */
export const REASONS = {
  'moderation_reason.chat_insults': 'Insults or inappropriate behavior in chat',
  'moderation_reason.avatar_inappropriate': 'Inappropriate avatar image',
  'moderation_reason.nickname_inappropriate': 'Inappropriate nickname',
};

export function getRoute() {
  const hash = location.hash.replace(/^#\/?/, '') || 'login';
  const [path, qs] = hash.split('?');
  return { path, params: new URLSearchParams(qs) };
}

export function navigate(path) {
  location.hash = '/' + path;
}

/**
 * "Seen" dates are stored server side (and no longer in local storage),
 * so they stay synchronized between all moderator devices.
 */
export async function loadSeen() {
  state.seen = await api('GET', '/api/admin/moderation/seen');
}

export function getLastRead(tab) {
  const v = state.seen?.[tab];
  return v ? new Date(v) : null;
}

export async function setLastRead(tab) {
  const date = new Date().toISOString();
  state.seen = { ...(state.seen ?? {}), [tab]: date };
  await api('POST', `/api/admin/moderation/seen/${tab}`, { date });
}

export function getTabCount(tab) {
  const v = localStorage.getItem(`tabCount:${tab}`);
  return v !== null ? parseInt(v, 10) : null;
}

export function setTabCount(tab, count) {
  localStorage.setItem(`tabCount:${tab}`, String(count));
}
