const pad = (n: number) => String(n).padStart(2, '0');

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function clock(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const daysAgo = (ts: number, now: number) => Math.round((startOfDay(now) - startOfDay(ts)) / 86_400_000);

/** Short form for the chat list: 14:02 · Yesterday · Mon · Oct 3 · Oct 3, 2025 */
export function shortTime(ts: number, now = Date.now()): string {
  const days = daysAgo(ts, now);
  const d = new Date(ts);
  if (days <= 0) return clock(ts);
  if (days === 1) return 'Yesterday';
  if (days < 7) return WEEKDAYS[d.getDay()]!;
  const date = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === new Date(now).getFullYear() ? date : `${date}, ${d.getFullYear()}`;
}

/** For date separators in the chat. */
export function dayLabel(ts: number, now = Date.now()): string {
  const days = daysAgo(ts, now);
  const d = new Date(ts);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return WEEKDAYS_LONG[d.getDay()]!;
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export function lastSeen(ts: number | undefined, now = Date.now()): string {
  if (!ts) return 'offline';
  const min = Math.floor((now - ts) / 60_000);
  if (min < 1) return 'last seen just now';
  if (min < 60) return `last seen ${min} min ago`;
  const days = daysAgo(ts, now);
  if (days <= 0) return `last seen at ${clock(ts)}`;
  return `last seen ${shortTime(ts, now)}`;
}

/** 42.3 s → "42.3s", 75 s → "1:15" */
export function duration(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}
