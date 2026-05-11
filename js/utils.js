export function relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
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
};

export function getRoute() {
  const hash = location.hash.replace(/^#\/?/, '') || 'login';
  const [path, qs] = hash.split('?');
  return { path, params: new URLSearchParams(qs) };
}

export function navigate(path) {
  location.hash = '/' + path;
}
