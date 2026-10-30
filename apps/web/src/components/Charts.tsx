import { useId, useMemo, useState } from 'react';
import { fmtCompact } from '../lib/format';
import { useI18n } from '../lib/i18n';

interface Point {
  x: number;
  y: number;
}

function smoothPath(points: Point[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(
      2,
    )} ${p2.y.toFixed(2)}`;
  }
  return d;
}

export function AreaChart({
  values,
  labels,
  compare,
  height = 228,
  color = 'var(--primary)',
  label,
  format = (value: number) => fmtCompact(value),
  showAxis = true,
}: {
  values: number[];
  labels: string[];
  compare?: number[];
  height?: number;
  color?: string;
  label?: string;
  format?: (value: number) => string;
  showAxis?: boolean;
}) {
  const gradientId = useId().replace(/[:]/g, '');
  const [hover, setHover] = useState<number | null>(null);
  const W = 1000;
  const H = 260;

  const max = useMemo(() => {
    const all = [...values, ...(compare ?? [])];
    return Math.max(...all, 1) * 1.12;
  }, [values, compare]);

  const buildPoints = (series: number[]): Point[] =>
    series.map((value, index) => ({
      x: (index / Math.max(series.length - 1, 1)) * W,
      y: H - (value / max) * (H - 18) - 6,
    }));

  const points = buildPoints(values);
  const comparePoints = compare ? buildPoints(compare) : null;
  const line = smoothPath(points);
  const area = `${line} L ${W} ${H} L 0 ${H} Z`;
  const compareLine = comparePoints ? smoothPath(comparePoints) : '';

  const step = Math.max(1, Math.ceil(labels.length / 7));

  return (
    <div className="chart-frame">
      <div style={{ position: 'relative', height }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          style={{ width: '100%', height: '100%', display: 'block', overflow: 'visible' }}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const ratio = (event.clientX - rect.left) / rect.width;
            const index = Math.round(ratio * (values.length - 1));
            setHover(Math.max(0, Math.min(values.length - 1, index)));
          }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.28" />
              <stop offset="70%" stopColor={color} stopOpacity="0.05" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75, 1].map((ratio) => (
            <line
              key={ratio}
              x1={0}
              x2={W}
              y1={H - ratio * (H - 20) - 6}
              y2={H - ratio * (H - 20) - 6}
              stroke="var(--border)"
              strokeWidth={1}
              strokeDasharray="4 6"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <path d={area} fill={`url(#${gradientId})`} />
          {compareLine ? (
            <path
              d={compareLine}
              fill="none"
              stroke="var(--faint)"
              strokeWidth={1.6}
              strokeDasharray="5 5"
              vectorEffect="non-scaling-stroke"
              opacity={0.7}
            />
          ) : null}
          <path
            d={line}
            fill="none"
            stroke={color}
            strokeWidth={2.4}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          {hover !== null ? (
            <line
              x1={points[hover]?.x}
              x2={points[hover]?.x}
              y1={0}
              y2={H}
              stroke="var(--border-strong)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
        </svg>
        {hover !== null && points[hover] ? (
          <>
            <div
              style={{
                position: 'absolute',
                left: `${(hover / Math.max(values.length - 1, 1)) * 100}%`,
                top: `${(points[hover].y / H) * 100}%`,
                width: 9,
                height: 9,
                borderRadius: 99,
                background: color,
                border: '2px solid var(--surface)',
                transform: 'translate(-50%, -50%)',
                boxShadow: '0 0 0 4px color-mix(in srgb, var(--primary) 18%, transparent)',
              }}
            />
            <div
              className="chart-tip"
              style={{
                left: `${Math.min(92, Math.max(8, (hover / Math.max(values.length - 1, 1)) * 100))}%`,
                top: `${(points[hover].y / H) * 100}%`,
              }}
            >
              <div style={{ opacity: 0.7 }}>{labels[hover]}</div>
              <div style={{ fontWeight: 600 }}>
                {label ? `${label}: ` : ''}
                {format(values[hover])}
              </div>
              {compare && compare[hover] !== undefined ? (
                <div style={{ opacity: 0.65 }}>ก่อนหน้า: {format(compare[hover])}</div>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
      {showAxis ? (
        <div className="chart-axis">
          {labels
            .filter((_, index) => index % step === 0)
            .map((text) => (
              <span key={text}>{text}</span>
            ))}
        </div>
      ) : null}
    </div>
  );
}

export function Sparkline({
  values,
  color = 'var(--primary)',
  height = 44,
  fill = true,
}: {
  values: number[];
  color?: string;
  height?: number;
  fill?: boolean;
}) {
  const gradientId = useId().replace(/[:]/g, '');
  if (!values.length) return <div style={{ height }} />;
  const W = 120;
  const H = 40;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const points = values.map((value, index) => ({
    x: (index / Math.max(values.length - 1, 1)) * W,
    y: H - ((value - min) / range) * (H - 6) - 3,
  }));
  const path = smoothPath(points);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill ? <path d={`${path} L ${W} ${H} L 0 ${H} Z`} fill={`url(#${gradientId})`} /> : null}
      <path d={path} fill="none" stroke={color} strokeWidth={1.7} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
    </svg>
  );
}

export function MultiLine({
  series,
  labels,
  height = 230,
  format = (value: number) => fmtCompact(value),
}: {
  series: Array<{ name: string; color: string; values: number[] }>;
  labels: string[];
  height?: number;
  format?: (value: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 1000;
  const H = 240;
  const max = Math.max(...series.flatMap((s) => s.values), 1) * 1.08;
  const step = Math.max(1, Math.ceil(labels.length / 7));

  return (
    <div>
      <div className="chart-legend" style={{ marginBottom: 10 }}>
        {series.map((s) => (
          <span key={s.name} className="item">
            <span className="swatch" style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
      <div
        style={{ position: 'relative', height }}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const ratio = (event.clientX - rect.left) / rect.width;
          setHover(Math.max(0, Math.min(labels.length - 1, Math.round(ratio * (labels.length - 1)))));
        }}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
          {[0.25, 0.5, 0.75, 1].map((ratio) => (
            <line
              key={ratio}
              x1={0}
              x2={W}
              y1={H - ratio * (H - 16) - 4}
              y2={H - ratio * (H - 16) - 4}
              stroke="var(--border)"
              strokeDasharray="4 6"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {series.map((s) => {
            const points = s.values.map((value, index) => ({
              x: (index / Math.max(s.values.length - 1, 1)) * W,
              y: H - (value / max) * (H - 16) - 4,
            }));
            return (
              <path
                key={s.name}
                d={smoothPath(points)}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
          {hover !== null ? (
            <line
              x1={(hover / Math.max(labels.length - 1, 1)) * W}
              x2={(hover / Math.max(labels.length - 1, 1)) * W}
              y1={0}
              y2={H}
              stroke="var(--border-strong)"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
        </svg>
        {hover !== null ? (
          <div
            className="chart-tip"
            style={{
              left: `${Math.min(90, Math.max(10, (hover / Math.max(labels.length - 1, 1)) * 100))}%`,
              top: 8,
              transform: 'translate(-50%, 0)',
            }}
          >
            <div style={{ opacity: 0.7 }}>{labels[hover]}</div>
            {series.map((s) => (
              <div key={s.name} style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
                <span style={{ opacity: 0.8 }}>{s.name}</span>
                <b>{format(s.values[hover] ?? 0)}</b>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <div className="chart-axis">
        {labels
          .filter((_, index) => index % step === 0)
          .map((text) => (
            <span key={text}>{text}</span>
          ))}
      </div>
    </div>
  );
}

export function Donut({
  segments,
  size = 156,
  thickness = 15,
  centerLabel,
  centerValue,
}: {
  segments: Array<{ label: string; value: number; color: string }>;
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  const total = segments.reduce((acc, s) => acc + s.value, 0) || 1;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--surface-3)" strokeWidth={thickness} />
        {segments.map((segment) => {
          const length = (segment.value / total) * circumference;
          const dash = `${Math.max(length - 2, 0)} ${circumference - Math.max(length - 2, 0)}`;
          const element = (
            <circle
              key={segment.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={segment.color}
              strokeWidth={thickness}
              strokeDasharray={dash}
              strokeDashoffset={-offset}
              strokeLinecap="round"
            />
          );
          offset += length;
          return element;
        })}
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 0,
        }}
      >
        <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.5px' }}>{centerValue}</span>
        <span className="tiny muted">{centerLabel}</span>
      </div>
    </div>
  );
}

export function BarList({
  items,
  format = (value: number) => fmtCompact(value),
  max: providedMax,
}: {
  items: Array<{ label: string; value: number; color?: string }>;
  format?: (value: number) => string;
  max?: number;
}) {
  const max = providedMax ?? Math.max(...items.map((item) => item.value), 1);
  return (
    <div>
      {items.map((item) => (
        <div className="bar-line" key={item.label}>
          <span className="bar-label truncate">{item.label}</span>
          <span className="bar-track">
            <span
              className="bar-fill"
              style={{ width: `${Math.max(2, (item.value / max) * 100)}%`, background: item.color ?? 'var(--primary)' }}
            />
          </span>
          <span className="bar-value">{format(item.value)}</span>
        </div>
      ))}
    </div>
  );
}

const DAY_LABELS_TH = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const DAY_LABELS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function Heatmap({
  cells,
  lang = 'th',
}: {
  cells: Array<{ day: number; hour: number; value: number }>;
  lang?: 'th' | 'en';
}) {
  const [hover, setHover] = useState<{ day: number; hour: number; value: number } | null>(null);
  const { t } = useI18n();
  const days = lang === 'th' ? DAY_LABELS_TH : DAY_LABELS_EN;
  const alpha = (value: number) => 0.06 + (value / 100) * 0.86;
  return (
    <div>
      <div className="heatmap">
        <span />
        {Array.from({ length: 24 }, (_, hour) => (
          <span key={hour} className="hm-head">
            {hour % 3 === 0 ? hour : ''}
          </span>
        ))}
        {days.map((day, dayIndex) => (
          <span key={day} style={{ display: 'contents' }}>
            <span className="hm-label">{day}</span>
            {Array.from({ length: 24 }, (_, hour) => {
              const cell = cells.find((c) => c.day === dayIndex && c.hour === hour);
              const value = cell?.value ?? 0;
              return (
                <span
                  key={hour}
                  className="hm-cell"
                  style={{ background: `color-mix(in srgb, var(--primary) ${alpha(value) * 100}%, transparent)` }}
                  onMouseEnter={() => setHover({ day: dayIndex, hour, value })}
                  onMouseLeave={() => setHover(null)}
                  title={`${day} ${hour}:00 · ${value}`}
                />
              );
            })}
          </span>
        ))}
      </div>
      <div className="row between" style={{ marginTop: 10 }}>
        <span className="tiny faint">
          {hover ? `${days[hover.day]} ${String(hover.hour).padStart(2, '0')}:00 · ${hover.value}` : `${days[0]}–${days[6]}`}
        </span>
        <span className="row tiny faint" style={{ gap: 6 }}>
          {t('analytics.low')}
          {[0.15, 0.35, 0.55, 0.75, 0.95].map((a) => (
            <span
              key={a}
              style={{
                width: 12,
                height: 12,
                borderRadius: 3,
                background: `color-mix(in srgb, var(--primary) ${a * 100}%, transparent)`,
              }}
            />
          ))}
          {t('analytics.high')}
        </span>
      </div>
    </div>
  );
}
