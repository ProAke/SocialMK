import type { ReactNode } from 'react';

export const PLATFORM_META: Record<
  string,
  { label: string; color: string; group: 'social' | 'google' | 'future'; glyph: ReactNode }
> = {
  facebook: {
    label: 'Facebook',
    color: '#1877F2',
    group: 'social',
    glyph: (
      <path
        fill="currentColor"
        d="M13.6 21v-6.9h2.3l.35-2.7h-2.65V9.7c0-.78.22-1.31 1.34-1.31h1.43V6c-.25-.03-1.1-.1-2.09-.1-2.07 0-3.48 1.26-3.48 3.58v2h-2.34v2.7h2.34V21h2.8Z"
      />
    ),
  },
  instagram: {
    label: 'Instagram',
    color: '#E1306C',
    group: 'social',
    glyph: (
      <g fill="none" stroke="currentColor" strokeWidth="1.9">
        <rect x="3.6" y="3.6" width="16.8" height="16.8" rx="5" />
        <circle cx="12" cy="12" r="4.1" />
        <circle cx="17.1" cy="6.9" r="1.15" fill="currentColor" stroke="none" />
      </g>
    ),
  },
  tiktok: {
    label: 'TikTok',
    color: '#111827',
    group: 'social',
    glyph: (
      <path
        fill="currentColor"
        d="M14.2 3h2.3c.3 1.7 1.35 2.9 3.1 3.1v2.3c-1.2 0-2.3-.4-3.3-1.05v6.2a5.35 5.35 0 1 1-4.6-5.3v2.4a3 3 0 1 0 2.2 2.9V3Z"
      />
    ),
  },
  line: {
    label: 'LINE OA',
    color: '#06C755',
    group: 'social',
    glyph: (
      <g>
        <path
          fill="currentColor"
          d="M12 4.2c-4.5 0-8.1 2.7-8.1 6 0 1.9 1.2 3.6 3.1 4.8-.15.9-.7 2.1-1.5 2.9 1.6-.2 3.1-1.1 4-1.7.8.2 1.7.3 2.5.3 4.5 0 8.1-2.7 8.1-6.1S16.5 4.2 12 4.2Z"
        />
        <text x="12" y="13.2" textAnchor="middle" fontSize="5.4" fontWeight="700" fill="#06C755" fontFamily="Inter, sans-serif">
          LINE
        </text>
      </g>
    ),
  },
  linkedin: {
    label: 'LinkedIn',
    color: '#0A66C2',
    group: 'social',
    glyph: (
      <g fill="currentColor">
        <path d="M6.3 9.4H3.7V20h2.6V9.4ZM5 4a1.55 1.55 0 1 0 0 3.1A1.55 1.55 0 0 0 5 4Z" />
        <path d="M20.3 20h-2.6v-5.5c0-1.35-.5-2.25-1.7-2.25-.95 0-1.5.63-1.75 1.24-.1.22-.12.53-.12.84V20h-2.6s.03-9.3 0-10.6h2.6v1.5c.35-.55 1.15-1.55 2.9-1.55 2.15 0 3.75 1.4 3.75 4.4V20Z" />
      </g>
    ),
  },
  x: {
    label: 'X (Twitter)',
    color: '#111827',
    group: 'social',
    glyph: (
      <path
        fill="currentColor"
        d="M17.4 4h2.7l-5.9 6.8L21.4 20h-5.4l-4.2-5.5L6.9 20H4.2l6.3-7.2L3.4 4h5.5l3.8 5 4.7-5Zm-.95 14.2h1.5L7.6 5.7H6L16.45 18.2Z"
      />
    ),
  },
  youtube: {
    label: 'YouTube',
    color: '#FF0000',
    group: 'social',
    glyph: (
      <g fill="none" stroke="currentColor" strokeWidth="1.7">
        <rect x="2.6" y="5.6" width="18.8" height="12.8" rx="3.6" />
        <path d="M10.2 9.3v5.4l4.8-2.7-4.8-2.7Z" fill="currentColor" stroke="none" />
      </g>
    ),
  },
  threads: {
    label: 'Threads',
    color: '#1F2937',
    group: 'social',
    glyph: (
      <g fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M16.4 8.2c-1.2-1.3-2.7-2-4.6-2-3.4 0-5.6 2.4-5.6 5.9 0 3.6 2.2 5.9 5.6 5.9 3 0 4.7-1.6 4.7-3.7 0-1.9-1.3-3.2-3.4-3.2-1.7 0-3 .9-3 2.2 0 1.1.9 1.8 2.1 1.8 2.2 0 3.6-1.9 3.6-4.6 0-1.4-.5-2.6-1.4-3.4" />
      </g>
    ),
  },
  google_drive: {
    label: 'Google Drive',
    color: '#1FA463',
    group: 'google',
    glyph: (
      <g fill="currentColor">
        <path d="M9.4 3h5.2l6.1 10.6h-5.2L9.4 3Z" />
        <path d="M8.7 4.6 2.4 15.4 5 19.9 11.3 9.1 8.7 4.6Z" opacity="0.92" />
        <path d="M6.4 21h11.5l2.6-4.6H9L6.4 21Z" opacity="0.82" />
      </g>
    ),
  },
  gmail: {
    label: 'Gmail',
    color: '#EA4335',
    group: 'google',
    glyph: (
      <g fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="2.9" y="5.4" width="18.2" height="13.2" rx="2.2" />
        <path d="M3.6 6.6 12 13.2l8.4-6.6" />
      </g>
    ),
  },
  google_calendar: {
    label: 'Google Calendar',
    color: '#1A73E8',
    group: 'google',
    glyph: (
      <g fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3.6" y="4.6" width="16.8" height="16" rx="2.4" />
        <path d="M8 2.8v3.4M16 2.8v3.4M3.6 9.4h16.8" />
        <text x="12" y="17.4" textAnchor="middle" fontSize="6.4" fontWeight="700" fill="currentColor" stroke="none" fontFamily="Inter, sans-serif">
          31
        </text>
      </g>
    ),
  },
  zalo: {
    label: 'Zalo OA',
    color: '#0068FF',
    group: 'future',
    glyph: (
      <text x="12" y="16.4" textAnchor="middle" fontSize="10" fontWeight="700" fill="currentColor" fontFamily="Inter, sans-serif">
        Za
      </text>
    ),
  },
  pantip: {
    label: 'Pantip',
    color: '#7C3AED',
    group: 'future',
    glyph: (
      <text x="12" y="16.2" textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor" fontFamily="Inter, sans-serif">
        P
      </text>
    ),
  },
  lemon8: {
    label: 'Lemon8',
    color: '#EAB308',
    group: 'future',
    glyph: (
      <text x="12" y="16.2" textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor" fontFamily="Inter, sans-serif">
        L8
      </text>
    ),
  },
  bluesky: {
    label: 'Bluesky',
    color: '#2563EB',
    group: 'future',
    glyph: (
      <text x="12" y="16.2" textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor" fontFamily="Inter, sans-serif">
        bs
      </text>
    ),
  },
  mastodon: {
    label: 'Mastodon',
    color: '#6364FF',
    group: 'future',
    glyph: (
      <text x="12" y="16.2" textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor" fontFamily="Inter, sans-serif">
        m
      </text>
    ),
  },
};

export function PlatformIcon({
  platform,
  size = 'md',
  ghost = false,
  className,
}: {
  platform: string;
  size?: 'sm' | 'md' | 'lg';
  ghost?: boolean;
  className?: string;
}) {
  const meta = PLATFORM_META[platform] ?? {
    label: platform,
    color: '#64748B',
    glyph: <circle cx="12" cy="12" r="7" fill="currentColor" />,
  };
  const height = size === 'sm' ? 13 : size === 'lg' ? 19 : 17;
  return (
    <span
      className={`plat-icon ${size === 'sm' ? 'sm' : size === 'lg' ? 'lg' : ''} ${ghost ? 'ghost' : ''} ${className ?? ''}`}
      style={{ background: ghost ? undefined : meta.color }}
      title={meta.label}
      aria-label={meta.label}
    >
      <svg width={height} height={height} viewBox="0 0 24 24" fill="none">
        {meta.glyph}
      </svg>
    </span>
  );
}

export function PlatformStack({ platforms, max = 4 }: { platforms: string[]; max?: number }) {
  const shown = platforms.slice(0, max);
  const rest = platforms.length - shown.length;
  return (
    <span className="row" style={{ gap: 4 }}>
      {shown.map((p) => (
        <PlatformIcon key={p} platform={p} size="sm" />
      ))}
      {rest > 0 ? <span className="tiny muted">+{rest}</span> : null}
    </span>
  );
}

export const ALL_PLATFORMS = Object.entries(PLATFORM_META).map(([key, value]) => ({
  key,
  label: value.label,
  color: value.color,
  group: value.group,
}));
