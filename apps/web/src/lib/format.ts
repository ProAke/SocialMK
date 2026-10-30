export type Lang = 'th' | 'en';

const TZ = 'Asia/Bangkok';

const localeOf = (lang: Lang) => (lang === 'th' ? 'th-TH' : 'en-US');

export function fmtInt(value: number | null | undefined, lang: Lang = 'th'): string {
  return new Intl.NumberFormat(localeOf(lang)).format(Math.round(Number(value ?? 0)));
}

export function fmtCompact(value: number | null | undefined, lang: Lang = 'th'): string {
  const n = Number(value ?? 0);
  if (Math.abs(n) < 10000) return new Intl.NumberFormat(localeOf(lang)).format(Math.round(n));
  return new Intl.NumberFormat(localeOf(lang), {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(n);
}

export function fmtTHB(value: number | null | undefined, lang: Lang = 'th', compact = false): string {
  const n = Number(value ?? 0);
  const formatted = compact
    ? new Intl.NumberFormat(localeOf(lang), { notation: 'compact', maximumFractionDigits: 1 }).format(n)
    : new Intl.NumberFormat(localeOf(lang), { maximumFractionDigits: 0 }).format(n);
  return `฿${formatted}`;
}

export function fmtPct(value: number | null | undefined, digits = 1): string {
  const n = Number(value ?? 0);
  return `${n.toFixed(digits)}%`;
}

export function fmtDelta(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;
}

export function safeDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function fmtDate(value: string | null | undefined, lang: Lang = 'th', short = false): string {
  const date = safeDate(value ?? undefined) ?? (value ? new Date(`${value.slice(0, 10)}T00:00:00+07:00`) : null);
  if (!date || Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(localeOf(lang), {
    timeZone: TZ,
    day: 'numeric',
    month: short ? 'short' : 'short',
    year: 'numeric',
  }).format(date);
}

export function fmtDayMonth(value: string | null | undefined, lang: Lang = 'th'): string {
  const date = value ? new Date(`${value.slice(0, 10)}T00:00:00+07:00`) : null;
  if (!date || Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(localeOf(lang), { timeZone: TZ, day: 'numeric', month: 'short' }).format(date);
}

export function fmtDateTime(value: string | null | undefined, lang: Lang = 'th'): string {
  const date = safeDate(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat(localeOf(lang), {
    timeZone: TZ,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function fmtTime(value: string | null | undefined): string {
  if (!value) return '—';
  return value.slice(11, 16);
}

export function relativeTime(value: string | null | undefined, lang: Lang = 'th'): string {
  const date = safeDate(value);
  if (!date) return '—';
  const diff = Date.now() - date.getTime();
  const minutes = Math.round(diff / 60000);
  const rtf = new Intl.RelativeTimeFormat(localeOf(lang), { numeric: 'auto' });
  if (Math.abs(minutes) < 60) return rtf.format(-minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(-hours, 'hour');
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return rtf.format(-days, 'day');
  const months = Math.round(days / 30);
  return rtf.format(-months, 'month');
}

export function initials(name: string): string {
  const clean = name.trim();
  if (!clean) return '?';
  const parts = clean.split(/\s+/);
  if (parts.length === 1) return clean.slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

/* ------------------------------ Bangkok dates ------------------------------ */

const isoFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function todayISO(): string {
  return isoFormatter.format(new Date());
}

export function addDaysISO(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round(
    (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86400000,
  );
}

export function startOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function monthMatrix(year: number, month: number): string[] {
  // month: 1-12
  const first = `${year}-${String(month).padStart(2, '0')}-01`;
  const dow = new Date(`${first}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  const start = addDaysISO(first, -dow);
  const cells: string[] = [];
  for (let i = 0; i < 42; i++) cells.push(addDaysISO(start, i));
  return cells;
}

export function monthLabel(year: number, month: number, lang: Lang): string {
  const date = new Date(Date.UTC(year, month - 1, 1));
  return new Intl.DateTimeFormat(localeOf(lang), {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function weekdayLabels(lang: Lang): string[] {
  const base = new Date(Date.UTC(2024, 0, 7)); // Sunday
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base.getTime() + i * 86400000);
    return new Intl.DateTimeFormat(localeOf(lang), { weekday: 'short', timeZone: 'UTC' }).format(d);
  });
}

export function dateKey(value: string | null | undefined): string {
  if (!value) return '';
  return value.slice(0, 10);
}

export function timeOf(value: string | null | undefined): string {
  if (!value) return '09:00';
  const match = value.match(/T(\d{2}:\d{2})/);
  return match ? match[1] : '09:00';
}

export function toDateTimeInput(date: string, time: string): string {
  return `${date}T${time}`;
}

export function greeting(lang: Lang): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }).format(new Date()),
  );
  if (lang === 'th') {
    if (hour < 12) return 'สวัสดีตอนเช้า';
    if (hour < 17) return 'สวัสดีตอนบ่าย';
    return 'สวัสดีตอนเย็น';
  }
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function truncate(text: string, max = 60): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function downloadBlob(content: BlobPart, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function downloadSvgAsPng(url: string, filename: string, width: number, height: number) {
  const svgText = await fetch(url).then((r) => r.text());
  const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('image load failed'));
    img.src = objectUrl;
  });
  const scale = Math.min(2, 2400 / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(objectUrl);
  const blobOut = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blobOut) return;
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blobOut);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 2000);
}

/** Copy to clipboard with a legacy fallback for non-secure contexts. */
export async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // fall through to the legacy path
    }
  }
  const area = document.createElement('textarea');
  area.value = value;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  try {
    document.execCommand('copy');
  } finally {
    document.body.removeChild(area);
  }
}
