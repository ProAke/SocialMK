export class HttpError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const TIMEZONE = 'Asia/Bangkok';

const bkkFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** YYYY-MM-DD in Asia/Bangkok. */
export function todayBkk(): string {
  return bkkFormatter.format(new Date());
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

export function diffDays(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86400000);
}

export function isoNow(): string {
  return new Date().toISOString();
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

export function round(n: number, digits = 0): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/** Deterministic PRNG so demo data is stable across re-seeds. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pctChange(current: number, previous: number): number {
  if (!previous) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

export function sum<T>(rows: T[], key: keyof T): number {
  return rows.reduce((acc, row) => acc + Number(row[key] ?? 0), 0);
}

export function safeJsonParse<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export const PLATFORMS = [
  { key: 'facebook', label: 'Facebook', group: 'social', color: '#1877F2' },
  { key: 'instagram', label: 'Instagram', group: 'social', color: '#E1306C' },
  { key: 'tiktok', label: 'TikTok', group: 'social', color: '#111827' },
  { key: 'line', label: 'LINE OA', group: 'social', color: '#06C755' },
  { key: 'linkedin', label: 'LinkedIn', group: 'social', color: '#0A66C2' },
  { key: 'x', label: 'X (Twitter)', group: 'social', color: '#111827' },
  { key: 'youtube', label: 'YouTube', group: 'social', color: '#FF0000' },
  { key: 'threads', label: 'Threads', group: 'social', color: '#111827' },
  { key: 'google_drive', label: 'Google Drive', group: 'google', color: '#1FA463' },
  { key: 'gmail', label: 'Gmail', group: 'google', color: '#EA4335' },
  { key: 'google_calendar', label: 'Google Calendar', group: 'google', color: '#4285F4' },
] as const;

export function platformLabel(key: string): string {
  return PLATFORMS.find((p) => p.key === key)?.label ?? key;
}
