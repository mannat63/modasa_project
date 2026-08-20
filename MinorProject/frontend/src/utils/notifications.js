/**
 * Lightweight notification bus + persistent feed.
 *
 * Notifications are scoped to an audience:
 *   - 'admin'      → shown to the admin (e.g. driver flags)
 *   - 'driver:T01' → shown to a specific driver truck (e.g. route deploys)
 *   - 'all'        → shown to everyone
 *
 * Backed by localStorage so it survives reloads AND syncs across tabs
 * (admin tab ↔ driver tab) via the native 'storage' event.
 */

const KEY = 'waste-notifications';
const EVENT = 'waste-notif-changed';
const MAX = 60;

function readAll() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function writeAll(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** Does this notification target the given audience? */
function matches(notif, audience) {
  if (notif.audience === 'all') return true;
  return notif.audience === audience;
}

/**
 * Push a notification.
 * @param {object} n
 * @param {string} n.audience  'admin' | 'driver:T01' | 'all'
 * @param {string} n.title
 * @param {string} n.message
 * @param {'flag'|'deploy'|'block'|'priority'|'ack'|'info'} [n.kind]
 */
export function pushNotification({ audience = 'all', title, message = '', kind = 'info' }) {
  const list = readAll();
  list.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    audience, title, message, kind,
    ts: Date.now(),
    read: false,
  });
  writeAll(list);
}

/** Get notifications visible to an audience (newest first). */
export function getNotifications(audience) {
  return readAll().filter((n) => matches(n, audience));
}

export function unreadCount(audience) {
  return readAll().filter((n) => matches(n, audience) && !n.read).length;
}

export function markAllRead(audience) {
  const list = readAll().map((n) => (matches(n, audience) ? { ...n, read: true } : n));
  writeAll(list);
}

export function clearNotifications(audience) {
  const list = readAll().filter((n) => !matches(n, audience));
  writeAll(list);
}

/** Subscribe to any change (same-tab + cross-tab). Returns unsubscribe fn. */
export function onNotificationsChange(cb) {
  const local = () => cb();
  const cross = (e) => { if (e.key === KEY) cb(); };
  window.addEventListener(EVENT, local);
  window.addEventListener('storage', cross);
  return () => {
    window.removeEventListener(EVENT, local);
    window.removeEventListener('storage', cross);
  };
}
