import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, downloadFile, type AnalyticsSummary, type Brand } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useToast } from '../lib/toast';
import { fmtCompact, fmtDayMonth, fmtPct, fmtTHB, relativeTime } from '../lib/format';
import { Icon } from '../components/Icon';
import { PlatformIcon } from '../components/PlatformIcon';
import { AreaChart, BarList, Donut, Heatmap, MultiLine } from '../components/Charts';
import { Badge, Card, Delta, Empty, PageHeader, Segmented, Skeleton } from '../components/UI';

interface Demographics {
  source: string;
  age: Array<{ label: string; value: number }>;
  gender: Array<{ label: string; value: number }>;
  cities: Array<{ label: string; value: number }>;
  devices: Array<{ label: string; value: number }>;
  activeHours: Array<{ hour: number; value: number }>;
}

interface HeatmapResponse {
  cells: Array<{ day: number; hour: number; value: number }>;
  bestSlots: Array<{ day: string; hour: number; value: number }>;
}

interface Insight {
  headline: string;
  bullets: string[];
  recommendation: string;
  generatedAt: string;
}

type MetricKey = 'reach' | 'engagements' | 'clicks';

export function AnalyticsPage() {
  const { t, lang } = useI18n();
  const toast = useToast();

  const [days, setDays] = useState(30);
  const [brandId, setBrandId] = useState('all');
  const [brands, setBrands] = useState<Brand[]>([]);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [demo, setDemo] = useState<Demographics | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapResponse | null>(null);
  const [insight, setInsight] = useState<Insight | null>(null);
  const [metric, setMetric] = useState<MetricKey>('reach');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryData, demoData, heatmapData, insightData, brandList] = await Promise.all([
        api.get<AnalyticsSummary>('/analytics/summary', { days, brandId }),
        api.get<Demographics>('/analytics/demographics', { brandId }),
        api.get<HeatmapResponse>('/analytics/heatmap', { brandId }),
        api.get<Insight>('/ai/insight', { days, brandId, language: lang }),
        api.get<Brand[]>('/brands'),
      ]);
      setSummary(summaryData);
      setDemo(demoData);
      setHeatmap(heatmapData);
      setInsight(insightData);
      setBrands(brandList);
    } finally {
      setLoading(false);
    }
  }, [days, brandId, lang]);

  useEffect(() => {
    void load();
  }, [load]);

  const labels = useMemo(() => (summary?.series ?? []).map((row) => fmtDayMonth(row.date, lang)), [summary, lang]);

  const followerSeries = useMemo(() => {
    if (!summary) return { labels: [] as string[], series: [] as Array<{ name: string; color: string; values: number[] }> };
    const platformRows = summary.platforms.slice(0, 5);
    const dates = [...new Set(summary.series.map((row) => row.date))].sort();
    const series = platformRows.map((platform) => {
      const rows = summary.followerSeries[platform.platform] ?? [];
      const map = new Map(rows.map((row) => [row.date, row.followers]));
      return {
        name: platform.label,
        color: platform.color,
        values: dates.map((date) => map.get(date) ?? 0),
      };
    });
    return { labels: dates.map((date) => fmtDayMonth(date, lang)), series };
  }, [summary, lang]);

  const exportCsv = async () => {
    try {
      await downloadFile('/analytics/export.csv', { days, brandId });
      toast.push(t('common.export'), { detail: t('analytics.exportNote') });
    } catch {
      toast.push(t('error.generic'), { kind: 'error' });
    }
  };

  if (!summary || !demo || !heatmap) {
    return (
      <div className="page">
        <PageHeader title={t('analytics.title')} subtitle={t('analytics.subtitle')} />
        <div className="grid grid-4">
          {[0, 1, 2, 3].map((key) => <div key={key} className="card"><Skeleton height={54} /></div>)}
        </div>
        <div className="card section"><Skeleton height={280} /></div>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        title={t('analytics.title')}
        subtitle={t('analytics.subtitle')}
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
            <button className="btn" onClick={exportCsv}>
              <Icon name="download" size={15} /> {t('analytics.exportCsv')}
            </button>
          </>
        }
      />

      <div className="grid grid-4">
        <MiniKpi label={t('common.impressions')} value={fmtCompact(summary.totals.impressions, lang)} delta={summary.deltas.impressions} />
        <MiniKpi label={t('common.reach')} value={fmtCompact(summary.totals.reach, lang)} delta={summary.deltas.reach} />
        <MiniKpi label={t('analytics.engagementRate')} value={fmtPct(summary.totals.engagementRate, 2)} delta={summary.deltas.engagementRate} />
        <MiniKpi label={t('common.spend')} value={fmtTHB(summary.totals.spend, lang, true)} delta={summary.deltas.spend} footnote={`ROAS ${summary.totals.roas.toFixed(2)}x`} />
      </div>

      <div className="grid grid-side section">
        <Card
          title={t('analytics.reachTrend')}
          subtitle={`${summary.range.from} → ${summary.range.to}`}
          action={
            <Segmented
              value={metric}
              onChange={(key) => setMetric(key as MetricKey)}
              options={[
                { key: 'reach', label: t('common.reach') },
                { key: 'engagements', label: t('common.engagement') },
                { key: 'clicks', label: t('common.clicks') },
              ]}
            />
          }
        >
          <AreaChart
            values={summary.series.map((row) => Number(row[metric]))}
            labels={labels}
            height={250}
            label={metric === 'reach' ? t('common.reach') : metric === 'clicks' ? t('common.clicks') : t('common.engagement')}
            color={metric === 'reach' ? 'var(--primary)' : metric === 'clicks' ? 'var(--amber)' : 'var(--teal)'}
            format={(value) => fmtCompact(value, lang)}
          />
          {loading ? <div className="tiny faint" style={{ marginTop: 6 }}>{t('common.loading')}</div> : null}
        </Card>

        <div className="col" style={{ gap: 16 }}>
          <div className="ai-card">
            <div className="ai-head">
              <Icon name="sparkles" size={14} /> {t('analytics.aiSummary')}
            </div>
            <div className="small strong" style={{ marginTop: 8, lineHeight: 1.5 }}>{insight?.headline}</div>
            <ul className="ai-bullets" style={{ padding: 0, margin: '10px 0 0' }}>
              {(insight?.bullets ?? []).map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
            <div className="ai-note">
              <strong>{t('overview.aiRecommend')}:</strong> {insight?.recommendation}
            </div>
            <div className="tiny faint" style={{ marginTop: 8 }}>
              {insight ? t('analytics.generatedAt', { time: relativeTime(insight.generatedAt, lang) }) : ''}
            </div>
          </div>

          <Card title={t('analytics.platformTable')} flush>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('common.platforms')}</th>
                    <th className="num">{t('common.engagement')}</th>
                    <th className="num">{t('analytics.engagementRate')}</th>
                    <th className="num">{t('analytics.spend')}</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.platforms.map((platform) => (
                    <tr key={platform.platform}>
                      <td>
                        <span className="row" style={{ gap: 8 }}>
                          <PlatformIcon platform={platform.platform} size="sm" />
                          <span className="small">{platform.label}</span>
                        </span>
                      </td>
                      <td className="num">{fmtCompact(platform.engagements, lang)}</td>
                      <td className="num">{fmtPct(platform.engagementRate, 2)}</td>
                      <td className="num">{fmtTHB(platform.spend, lang, true)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>

      <div className="grid grid-2 section">
        <Card title={t('analytics.followerGrowth')} subtitle={t('analytics.followerGrowthSub')}>
          {followerSeries.series.length ? (
            <MultiLine
              series={followerSeries.series}
              labels={followerSeries.labels}
              height={216}
              format={(value) => fmtCompact(value, lang)}
            />
          ) : (
            <Empty icon="chart" title={t('common.noData')} />
          )}
        </Card>

        <Card title={t('analytics.audience')} subtitle={t('analytics.audienceSub')}>
          <div className="row" style={{ gap: 18, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <Donut
              size={132}
              thickness={13}
              centerValue={fmtCompact(summary.totals.followers, lang)}
              centerLabel={t('common.followers')}
              segments={demo.gender.map((item, index) => ({
                label: item.label,
                value: item.value,
                color: ['#8f8ff0', '#7cf7d4', '#f6c86b'][index] ?? '#94a3b8',
              }))}
            />
            <div style={{ flex: 1, minWidth: 190 }}>
              <div className="eyebrow" style={{ marginBottom: 6 }}>{t('analytics.age')}</div>
              <BarList
                items={demo.age.map((item, index) => ({
                  label: item.label,
                  value: item.value,
                  color: ['#5b5bd6', '#7c7cf0', '#8f8ff0', '#a5b4fc', '#c7d2fe'][index],
                }))}
                format={(value) => `${value}%`}
                max={Math.max(...demo.age.map((item) => item.value))}
              />
              <div className="eyebrow" style={{ margin: '10px 0 6px' }}>{t('analytics.cities')}</div>
              <BarList
                items={demo.cities.slice(0, 4).map((item) => ({ label: item.label, value: item.value, color: 'var(--teal)' }))}
                format={(value) => `${value}%`}
                max={Math.max(...demo.cities.map((item) => item.value))}
              />
            </div>
          </div>
          <div className="divider" />
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {demo.devices.map((device) => (
              <span key={device.label} className="badge" style={{ background: 'var(--surface-2)' }}>
                {device.label} {device.value}%
              </span>
            ))}
            <span className="tiny faint">{t('analytics.dataNotice')}</span>
          </div>
        </Card>
      </div>

      <div className="grid grid-side section">
        <Card title={t('analytics.heatmap')} subtitle={t('analytics.heatmapSub')}>
          <Heatmap cells={heatmap.cells} lang={lang} />
        </Card>
        <Card title={t('analytics.bestTimes')} subtitle={t('analytics.bestSlot')}>
          <div className="col" style={{ gap: 8 }}>
            {heatmap.bestSlots.map((slot, index) => (
              <div key={`${slot.day}-${slot.hour}`} className="row between" style={{ padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                <span className="row" style={{ gap: 9 }}>
                  <span className="badge" style={{ background: 'var(--primary-weak)', color: 'var(--primary)' }}>#{index + 1}</span>
                  <span className="small">{slot.day} · {String(slot.hour).padStart(2, '0')}:00</span>
                </span>
                <span className="small muted">{slot.value}</span>
              </div>
            ))}
          </div>
          <div className="notice info" style={{ marginTop: 12 }}>
            <Icon name="info" size={15} />
            <span>{t('calendar.aiPlan')}: {t('calendar.planSub')}</span>
          </div>
        </Card>
      </div>

      <Card
        title={t('analytics.topContent')}
        subtitle={t('analytics.exportNote')}
        flush
        className="section"
        action={<Badge tone="">{summary.range.days}d</Badge>}
      >
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('calendar.postTitle')}</th>
                <th>{t('common.brand')}</th>
                <th className="num">{t('common.reach')}</th>
                <th className="num">{t('common.engagement')}</th>
                <th className="num">{t('common.clicks')}</th>
                <th>{t('common.date')}</th>
              </tr>
            </thead>
            <tbody>
              {summary.topPosts.map((post) => (
                <tr key={post.id}>
                  <td style={{ maxWidth: 340 }}>
                    <div className="strong truncate">{post.title}</div>
                    <div className="tiny muted">{post.platforms.join(' · ')}</div>
                  </td>
                  <td>
                    <span className="row" style={{ gap: 6 }}>
                      <span className="swatch" style={{ width: 7, height: 7, borderRadius: 2, background: post.brandColor ?? 'var(--primary)' }} />
                      <span className="small">{post.brandName}</span>
                    </span>
                  </td>
                  <td className="num">{fmtCompact(post.metrics.reach ?? 0, lang)}</td>
                  <td className="num">{fmtCompact(post.metrics.engagements ?? 0, lang)}</td>
                  <td className="num">{fmtCompact(post.metrics.clicks ?? 0, lang)}</td>
                  <td className="small muted">{post.publishedAt?.slice(0, 10)}</td>
                </tr>
              ))}
              {!summary.topPosts.length ? (
                <tr>
                  <td colSpan={6}><Empty icon="chart" title={t('analytics.noTopContent')} /></td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function MiniKpi({ label, value, delta, footnote }: { label: string; value: string; delta: number; footnote?: string }) {
  return (
    <div className="card kpi">
      <div className="kpi-top">
        <span className="kpi-label">{label}</span>
        <Delta value={delta} />
      </div>
      <div className="kpi-value" style={{ fontSize: 22 }}>{value}</div>
      {footnote ? <div className="kpi-foot">{footnote}</div> : null}
    </div>
  );
}
