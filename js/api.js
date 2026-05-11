export const state = {
  apiBase: localStorage.getItem('apiBase') || 'http://localhost:3000',
  apiKey: localStorage.getItem('apiKey') || '',
  messages: null,
};

export async function api(method, path, body = null) {
  const res = await fetch(state.apiBase + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${state.apiKey}`,
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); msg = j.message || j.error || msg; } catch (_) {}
    throw new Error(msg);
  }

  if (res.status === 204) return null;
  return res.json();
}
