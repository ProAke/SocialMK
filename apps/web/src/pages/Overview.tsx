import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  api,
  type ActivityItem,
  type AnalyticsSummary,
  type Brand,
  type Connection,
  type Post,
} from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import {
  fmtCompact,
  fmtDayMonth,
  fmtInt,
  fmtPct,
  fmtTHB,
  fmtTime,
  greeting,
  relativeTime,
  timeOf,
} from '../lib/format';
import { Icon } from '../components/Icon';
import { PlatformIcon, PlatformStack } from '../components/PlatformIcon';
import { AreaChart, Donut, Sparkline } from '../components/Charts';
import {
  Avatar,
  Badge,
  Card,
  Delta,
  Empty,
  PageHeader,
  Segmented,
  Skeleton,
  StatusBadge,
} from '../components/UI';

interface OverviewResponse {
  summary: AnalyticsSummary;
  upcoming: Post[];
  statusCounts: Record<string, number>;
  connections: { total: number; connected: number; attention: number; followers: number };
  contacts: { total: number; customers: number };
  today: string;
  weekRange: { from: string; to: string };
}

interface Insight {
  headline: string;
  bullets: string[];
  recommendation: string;
}

const METRIC_KEYS = ['reach', 'engagements', 'spend'] as const;
type MetricKey = (typeof METRIC_KEYS)[number];

export function OverviewPage() {
  const { t, lang } = useI18n();
  const { user, workspace, can } = useAuth();
  const navigate = useNavigate();

  const [data, setData] = useState<OverviewResponse | null>(null);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [insight, setInsight] = useState<Insight | null>(null);
  const [days, setDays] = useState(30);
  const [brandId, setBrandId] = useState('all');
  const [metric, setMetric] = useState<MetricKey>('reach');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [overview, brandList, conns, acts, ai] = await Promise.all([
        api.get<OverviewResponse>('/overview', { days, brandId }),
        api.get<Brand[]>('/brands'),
        api.get<Connection[]>('/connections'),
        api.get<ActivityItem[]>('/activity', { limit: 6 }),
        api.get<Insight>('/ai/insight', { days, brandId, language: lang }),
      ]);
      setData(overview);
      setBrands(brandList);
      setConnections(conns);
      setActivity(acts);
      setInsight(ai);
    } finally {
      setLoading(false);
    }
  }, [days, brandId, lang]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = data?.summary;
  const series = summary?.series ?? [];
  const labels = series.map((row) => fmtDayMonth(row.date, lang));
  const values = series.map((row) => Number((row as any)[metric] ?? 0));

  const followerSpark = useMemo(() => {
    if (!summary) return [];
    const totals = new Map<string, number>();
    for (const rows of Object.values(summary.followerSeries ?? {})) {
      for (const row of rows) totals.set(row.date, (totals.get(row.date) ?? 0) + row.followers);
    }
    return [...totals.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, value]) => value);
  }, [summary]);

  const attention = connections.filter((c) => c.status !== 'connected');
  const engagementShare = summary?.platforms ?? [];

  if (!data || !summary) {
    return (
      <div className="page">
        <PageHeader title={t('overview.title')} subtitle={t('overview.subtitle', { workspace: workspace?.name ?? '' })} />
        <div className="grid grid-4">
          {[0, 1, 2, 3].map((i) => (
            <div className="card kpi" key={i}>
              <Skeleton height={12} width="55%" />
              <Skeleton height={30} width="70%" style={{ marginTop: 8 }} />
              <Skeleton height={10} width="45%" style={{ marginTop: 8 }} />
            </div>
          ))}
        </div>
        <div className="grid grid-side section">
          <div className="card"><Skeleton height={260} /></div>
          <div className="card"><Skeleton height={260} /></div>
        </div>
      </div>
    );
  }

  const pipeline = [
    { key: 'draft', label: t('calendar.status.draft'), color: 'var(--faint)' },
    { key: 'review', label: t('calendar.status.review'), color: 'var(--amber)' },
    { key: 'approved', label: t('calendar.status.approved'), color: 'var(--sky)' },
    { key: 'scheduled', label: t('calendar.status.scheduled'), color: 'var(--primary)' },
    { key: 'published', label: t('calendar.status.published'), color: 'var(--teal)' },
  ];

  return (
    <div className="page">
      <PageHeader
        title={t('overview.title')}
        subtitle={t('overview.subtitle', { workspace: workspace?.name ?? '' })}
        actions={
          <>
            <select className="select sm" value={brandId} onChange={(event) => setBrandId(event.target.value)} style={{ width: 160 }}>
              <option value="all">{t('calendar.allBrands')}</option>
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>{brand.name}</option>
              ))}
            </select>
            <Segmented
              value={String(days)}
              onChange={(key) => setDays(Number(key))}
              options={[
                { key: '7', label: t('analytics.days7') },
                { key: '30', label: t('analytics.days30') },
                { key: '90', label: t('analytics.days90') },
              ]}
            />
            <Link className="btn primary" to="/calendar">
              <Icon name="plus" size={15} /> {t('overview.quickCreate')}
            </Link>
          </>
        }
      />

      <div className="row between wrap" style={{ marginBottom: 16 }}>
        <div className="row" style={{ gap: 10 }}>
          <Avatar name={user?.name ?? ''} color={user?.avatarColor} />
          <div>
            <div style={{ fontWeight: 600 }}>
              {t('overview.greeting', { greeting: greeting(lang), name: (user?.name ?? '').split(' ')[0] })}
            </div>
            <div className="small muted">
              {new Intl.DateTimeFormat(lang === 'th' ? 'th-TH' : 'en-US', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                timeZone: 'Asia/Bangkok',
              }).format(new Date())}
            </div>
          </div>
        </div>
        <div className="row wrap" style={{ gap: 6 }}>
          {pipeline.map((stage) => (
            <span key={stage.key} className="badge" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <span className="dot" style={{ background: stage.color }} />
              {stage.label} {data.statusCounts[stage.key] ?? 0}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-4">
        <KpiCard
          label={t('overview.kpiReach')}
          value={fmtCompact(summary.totals.reach, lang)}
          delta={summary.deltas.reach}
          deltaLabel={t('overview.vsPrev')}
          spark={series.map((row) => row.reach)}
          color="var(--primary)"
        />
        <KpiCard
          label={t('overview.kpiEngagement')}
          value={fmtPct(summary.totals.engagementRate, 2)}
          delta={summary.deltas.engagementRate}
          deltaLabel={t('overview.vsPrev')}
          spark={series.map((row) => row.engagementRate)}
          color="var(--teal)"
          footnote={`${fmtCompact(summary.totals.engagements, lang)} ${t('overview.engagementsUnit')}`}
        />
        <KpiCard
          label={t('overview.kpiFollowers')}
          value={fmtCompact(summary.totals.followers, lang)}
          delta={summary.deltas.followers}
          deltaLabel={t('overview.vsPrev')}
          spark={followerSpark}
          color="var(--sky)"
        />
        <KpiCard
          label={t('overview.kpiSpend')}
          value={fmtTHB(summary.totals.spend, lang, true)}
          delta={summary.deltas.spend}
          deltaLabel={t('overview.vsPrev')}
          spark={series.map((row) => row.spend)}
          color="var(--amber)"
          footnote={`ROAS ${summary.totals.roas.toFixed(2)}x`}
        />
      </div>

      <div className="grid grid-side section">
        <Card
          title={t('overview.performance')}
          subtitle={t('overview.performanceSub')}
          action={
            <Segmented
              value={metric}
              onChange={(key) => setMetric(key as MetricKey)}
              options={[
                { key: 'reach', label: t('overview.trendReach') },
                { key: 'engagements', label: t('overview.trendEngagement') },
                { key: 'spend', label: t('overview.trendSpend') },
              ]}
            />
          }
        >
          <AreaChart
            values={values}
            labels={labels}
            label={t(`overview.trend${metric === 'reach' ? 'Reach' : metric === 'engagements' ? 'Engagement' : 'Spend'}`)}
            format={(value) => (metric === 'spend' ? fmtTHB(value, lang, true) : fmtCompact(value, lang))}
            height={236}
            color={metric === 'spend' ? 'var(--amber)' : metric === 'engagements' ? 'var(--teal)' : 'var(--primary)'}
          />
          <div className="divider" />
          <div className="grid grid-2" style={{ gap: 18 }}>
            <div>
              <div className="eyebrow" style={{ marginBottom: 10 }}>{t('overview.topContent')}</div>
              {summary.topPosts.slice(0, 3).map((post) => (
                <button
                  key={post.id}
                  className="row"
                  onClick={() => navigate('/analytics')}
                  style={{ width: '100%', background: 'none', border: 'none', padding: '6px 0', cursor: 'pointer', textAlign: 'left' }}
                >
                  <span className="plat-icon sm" style={{ background: post.brandColor ?? 'var(--primary)' }}>
                    <Icon name="file" size={11} />
                  </span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span className="small truncate" style={{ display: 'block' }}>{post.title}</span>
                    <span className="tiny faint">{post.brandName} · {fmtCompact(post.metrics.engagements ?? 0, lang)} {t('overview.engagementsUnit')}</span>
                  </span>
                  <Icon name="chevron-right" size={13} style={{ color: 'var(--faint)' }} />
                </button>
              ))}
            </div>
            <div>
              <div className="eyebrow" style={{ marginBottom: 10 }}>{t('overview.platformMix')}</div>
              <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
                <Donut
                  size={104}
                  thickness={11}
                  centerValue={`${engagementShare.length}`}
                  centerLabel={t('connections.channels')}
                  segments={engagementShare.map((p) => ({ label: p.label, value: p.engagements, color: p.color }))}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  {engagementShare.slice(0, 4).map((platform) => (
                    <div key={platform.platform} className="row between" style={{ padding: '3px 0' }}>
                      <span className="row" style={{ gap: 6, minWidth: 0 }}>
                        <span className="swatch" style={{ width: 7, height: 7, borderRadius: 2, background: platform.color }} />
                        <span className="tiny truncate">{platform.label}</span>
                      </span>
                      <span className="tiny muted">{platform.share.toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Card>

        <div className="col" style={{ gap: 16 }}>
          <div className="ai-card">
            <div className="ai-head">
              <Icon name="sparkles" size={14} /> {t('overview.aiInsight')}
              <span className="spacer" />
              <span className="tiny" style={{ letterSpacing: 0, textTransform: 'none', opacity: 0.7 }}>{days}d</span>
            </div>
            <div className="small" style={{ marginTop: 8, fontWeight: 600, lineHeight: 1.5 }}>
              {insight?.headline ?? t('overview.aiInsightSub')}
            </div>
            <ul className="ai-bullets" style={{ padding: 0, margin: '10px 0 0' }}>
              {(insight?.bullets ?? []).slice(0, 4).map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
            {insight?.recommendation ? (
              <div className="ai-note">
                <strong>{t('overview.aiRecommend')}:</strong> {insight.recommendation}
              </div>
            ) : null}
          </div>

          <Card
            title={t('overview.upcoming')}
            subtitle={t('overview.upcomingSub')}
            action={
              <Link className="card-link" to="/calendar">
                {t('common.viewAll')} <Icon name="chevron-right" size={12} />
              </Link>
            }
          >
            {data.upcoming.length === 0 ? (
              <Empty icon="calendar" title={t('overview.noUpcoming')} />
            ) : (
              <div className="col" style={{ gap: 2 }}>
                {data.upcoming.slice(0, 5).map((post) => (
                  <button
                    key={post.id}
                    onClick={() => navigate('/calendar')}
                    className="row"
                    style={{ background: 'none', border: 'none', padding: '7px 0', cursor: 'pointer', textAlign: 'left', gap: 10 }}
                  >
                    <span style={{ width: 40, flex: 'none', textAlign: 'center' }}>
                      <span className="small" style={{ display: 'block', fontWeight: 600 }}>{fmtTime(post.scheduledAt)}</span>
                      <span className="tiny faint">{fmtDayMonth(post.scheduledAt, lang)}</span>
                    </span>
                    <span
                      style={{ width: 3, alignSelf: 'stretch', borderRadius: 3, background: post.brandColor ?? 'var(--primary)' }}
                    />
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span className="small truncate" style={{ display: 'block' }}>{post.title}</span>
                      <span className="tiny faint">
                        {post.brandName} · {post.platforms.map((p) => t(`platform.${p}`)).join(', ')}
                      </span>
                    </span>
                    <PlatformStack platforms={post.platforms} max={2} />
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Card
            title={t('overview.connectionHealth')}
            subtitle={t('overview.connectionHealthSub')}
            action={
              <Link className="card-link" to="/connections">
                {t('overview.manage')} <Icon name="chevron-right" size={12} />
              </Link>
            }
          >
            <div className="row between" style={{ marginBottom: 8 }}>
              <span className="small muted">{t('connections.channels')}</span>
              <span className="small">
                <b>{data.connections.connected}</b>/{data.connections.total}
              </span>
            </div>
            {attention.length === 0 ? (
              <div className="row" style={{ gap: 8, color: 'var(--teal)' }}>
                <Icon name="check-circle" size={16} />
                <span className="small">{t('overview.allHealthy')}</span>
              </div>
            ) : (
              attention.slice(0, 3).map((connection) => (
                <div key={connection.id} className="row between" style={{ padding: '6px 0' }}>
                  <span className="row" style={{ gap: 8, minWidth: 0 }}>
                    <PlatformIcon platform={connection.platform} size="sm" />
                    <span style={{ minWidth: 0 }}>
                      <span className="small truncate" style={{ display: 'block' }}>{connection.accountName}</span>
                      <span className="tiny faint">
                        {connection.daysToExpiry !== null && connection.daysToExpiry <= 7
                          ? t('connections.tokenExpiry', { days: Math.max(connection.daysToExpiry, 0) })
                          : t('connections.status.attention')}
                      </span>
                    </span>
                  </span>
                  <StatusBadge status={connection.status} />
                </div>
              ))
            )}
          </Card>
        </div>
      </div>

      <div className="grid grid-side section">
        <Card
          title={t('overview.brandCompare')}
          subtitle={t('overview.brandCompareSub')}
          flush
          action={
            <Link className="card-link" to="/analytics">
              {t('common.viewAll')} <Icon name="chevron-right" size={12} />
            </Link>
          }
        >
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('common.brand')}</th>
                  <th className="num">{t('common.reach')}</th>
                  <th className="num">{t('common.engagement')}</th>
                  <th className="num">{t('analytics.engagementRate')}</th>
                  <th className="num">{t('common.spend')}</th>
                  <th style={{ width: 120 }}>{t('analytics.share')}</th>
                </tr>
              </thead>
              <tbody>
                {summary.brands.map((brand) => {
                  const totalEngagement = summary.brands.reduce((acc, item) => acc + item.engagements, 0) || 1;
                  const share = (brand.engagements / totalEngagement) * 100;
                  return (
                    <tr key={brand.brandId}>
                      <td>
                        <span className="row" style={{ gap: 8 }}>
                          <span className="swatch" style={{ width: 8, height: 8, borderRadius: 3, background: brand.color }} />
                          <span className="strong">{brand.name}</span>
                        </span>
                      </td>
                      <td className="num">{fmtCompact(brand.reach, lang)}</td>
                      <td className="num">{fmtCompact(brand.engagements, lang)}</td>
                      <td className="num">{fmtPct(brand.engagementRate, 2)}</td>
                      <td className="num">{fmtTHB(brand.spend, lang, true)}</td>
                      <td>
                        <div className="row" style={{ gap: 8 }}>
                          <div className="progress" style={{ flex: 1 }}>
                            <span style={{ width: `${share}%`, background: brand.color }} />
                          </div>
                          <span className="tiny muted">{share.toFixed(0)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card
          title={t('overview.recentActivity')}
          action={
            <Link className="card-link" to="/team">
              {t('common.viewAll')} <Icon name="chevron-right" size={12} />
            </Link>
          }
        >
          <div className="timeline">
            {activity.map((item) => (
              <div className="tl-item" key={item.id}>
                <Avatar name={item.userName} color={item.userColor} size="sm" />
                <div className="tl-body">
                  <div className="tl-title">
                    <b>{item.userName}</b> · {item.target}
                  </div>
                  <div className="tl-meta">{item.detail || item.action} · {relativeTime(item.at, lang)}</div>
                </div>
              </div>
            ))}
            {!activity.length ? <Empty icon="clock" title={t('common.noData')} /> : null}
          </div>
        </Card>
      </div>

      {can('editor') ? (
        <div className="card section" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="plat-icon" style={{ background: 'var(--primary-weak)', color: 'var(--primary)' }}>
            <Icon name="wand" size={18} />
          </span>
          <div style={{ minWidth: 200, flex: 1 }}>
            <div style={{ fontWeight: 600 }}>{t('calendar.aiPlan')}</div>
            <div className="small muted">{t('calendar.planSub')}</div>
          </div>
          <button className="btn" onClick={() => navigate('/studio')}>
            <Icon name="sparkles" size={15} /> {t('nav.studio')}
          </button>
          <button className="btn primary" onClick={() => navigate('/calendar')}>
            {t('overview.planMonth')} <Icon name="arrow-up-right" size={15} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function KpiCard({
  label,
  value,
  delta,
  deltaLabel,
  spark,
  color,
  footnote,
}: {
  label: string;
  value: string;
  delta: number;
  deltaLabel: string;
  spark: number[];
  color: string;
  footnote?: string;
}) {
  return (
    <div className="card kpi">
      <div className="kpi-top">
        <span className="kpi-label">{label}</span>
        <Delta value={delta} />
      </div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-foot">
        <span>{footnote ?? deltaLabel}</span>
      </div>
      <div className="kpi-spark">
        <Sparkline values={spark} color={color} height={42} />
      </div>
    </div>
  );
}
