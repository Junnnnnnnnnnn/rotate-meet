// Shared event-session helpers used by the form API, submit route, the
// Telegram /date command, and notification formatting. Sessions live in the
// public.event_sessions table; this module owns slug generation, date/time
// formatting, and the human label conventions.

export type EventSession = {
  id: string;
  event_date: string; // 'YYYY-MM-DD' (Postgres date → string via supabase-js)
  venue: string;
  time_label: string;
  is_active: boolean;
};

const DOW_SHORT = ['일', '월', '화', '수', '목', '금', '토'];
const DOW_LONG = [
  '일요일',
  '월요일',
  '화요일',
  '수요일',
  '목요일',
  '금요일',
  '토요일',
];

// Parse a 'YYYY-MM-DD' as UTC midnight so weekday/month/day are stable
// regardless of server timezone.
function utcDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00Z`);
}

// Format + real-calendar check (rejects e.g. 2025-02-30 / 2025-13-01).
export function isValidDateStr(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = utcDate(s);
  if (Number.isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === s;
}

export function dowShort(dateStr: string): string {
  return DOW_SHORT[utcDate(dateStr).getUTCDay()];
}

export function dowLong(dateStr: string): string {
  return DOW_LONG[utcDate(dateStr).getUTCDay()];
}

// '5월 24일'
export function monthDayKo(dateStr: string): string {
  const d = utcDate(dateStr);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
}

// '2025-05-24(토)' — used in the Telegram /date list.
export function dateParen(dateStr: string): string {
  return `${dateStr}(${dowShort(dateStr)})`;
}

// '5/24(토) 신촌점 오후 7시' — stored on signups.event_session_label and
// shown in operator notifications.
export function notifyLabel(s: {
  event_date: string;
  venue: string;
  time_label: string;
}): string {
  const d = utcDate(s.event_date);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${dowShort(s.event_date)}) ${s.venue} ${s.time_label}`;
}

// Slug = `${date}-${4hex}`. Date-prefixed for readability/sort; random suffix
// avoids collisions when the same day has multiple venues. Korean venue names
// are never romanized — the human label is built from columns separately.
export function genSlug(dateStr: string): string {
  const hex = Math.floor(Math.random() * 0x10000)
    .toString(16)
    .padStart(4, '0');
  return `${dateStr}-${hex}`;
}

// Normalize an operator-typed time to a Korean '오전/오후 N시[ M분]' label.
// Accepts '19시', '19', '19:00', '19:30', '오후 7시', '7pm', etc.
// Unparseable input is returned trimmed as-is.
export function parseTimeLabel(input: string): string {
  const raw = input.trim();
  const hasPM = /오후|pm/i.test(raw);
  const hasAM = /오전|am/i.test(raw);
  const m = raw.match(/(\d{1,2})\s*(?::|시)?\s*(\d{1,2})?\s*분?/);
  if (!m) return raw;

  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  if (!Number.isFinite(h) || h > 23 || min > 59) return raw;

  if (hasPM && h >= 1 && h <= 11) h += 12;
  else if (hasAM && h === 12) h = 0;

  let period: string;
  let dispH: number;
  if (h === 0) {
    period = '오전';
    dispH = 12;
  } else if (h < 12) {
    period = '오전';
    dispH = h;
  } else if (h === 12) {
    period = '오후';
    dispH = 12;
  } else {
    period = '오후';
    dispH = h - 12;
  }
  return min > 0 ? `${period} ${dispH}시 ${min}분` : `${period} ${dispH}시`;
}
