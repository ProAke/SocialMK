import { all, get } from './db.js';
import { PLATFORMS, addDays, clamp, mulberry32, pctChange, round, todayBkk } from './util.js';
import { enrichPost } from './http.js';

export interface SummaryOptions {
  workspaceId: string;
  brandId?: string | null;
  days?: number;
  from?: string | null;
  to?: string | null;
}

interface Totals {
  impressions: number;
  reach: number;
  engagements: number;
  clicks: number;
  spend: number;
  conversions: number;
  followers: number;
  engagementRate: number;
  ctr: number;
  cpa: number;
  roas: number;
  revenue: number;
}

const AVG_ORDER_VALUE = 780;

function totalsFor(workspaceId: string, from: string, to: string, brandId?: string | null): Totals {
  const params: unknown[] = [workspaceId, from, to];
  let filter = '';
  if (brandId) {
    filter = ' AND brand_id = ?';
    params.push(brandId);
  }
  const row = get<any>(
    `SELECT COALESCE(SUM(impressions),0) AS impressions, COALESCE(SUM(reach),0) AS reach,
            COALESCE(SUM(engagements),0) AS engagements, COALESCE(SUM(clicks),0) AS clicks,
            COALESCE(SUM(spend),0) AS spend, COALESCE(SUM(conversions),0) AS conversions
     FROM metrics WHERE workspace_id = ? AND date BETWEEN ? AND ?${filter}`,
    params,
  );
  const followerParams: unknown[] = [workspaceId, to, to];
  if (brandId) followerParams.push(brandId);
  const followerRow = get<any>(
    `SELECT COALESCE(SUM(f),0) AS followers FROM (
       SELECT platform, brand_id, followers AS f FROM metrics m
       WHERE workspace_id = ? AND date <= ? AND date = (
         SELECT MAX(date) FROM metrics
         WHERE workspace_id = m.workspace_id AND brand_id = m.brand_id AND platform = m.platform AND date <= ?
       )${filter}
       GROUP BY platform, brand_id
     )`,
    followerParams,
  );
  const impressions = row.impressions;
  const engagements = row.engagements;
  const clicks = row.clicks;
  const spend = row.spend;
  const conversions = row.conversions;
  const revenue = conversions * AVG_ORDER_VALUE;
  return {
    impressions,
    reach: row.reach,
    engagements,
    clicks,
    spend,
    conversions,
    followers: followerRow?.followers ?? 0,
    engagementRate: impressions ? round((engagements / impressions) * 100, 2) : 0,
    ctr: impressions ? round((clicks / impressions) * 100, 2) : 0,
    cpa: conversions ? round(spend / conversions, 0) : 0,
    roas: spend ? round(revenue / spend, 2) : 0,
    revenue,
  };
}

export function resolveRange(options: SummaryOptions) {
  const today = todayBkk();
  const days = clamp(Number(options.days) || 30, 7, 120);
  const to = options.to ?? today;
  const from = options.from ?? addDays(to, -(days - 1));
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(days - 1));
  return { from, to, prevFrom, prevTo, days };
}

export function computeSummary(options: SummaryOptions) {
  const { from, to, prevFrom, prevTo, days } = resolveRange(options);
  const ws = options.workspaceId;
  const brandId = options.brandId ?? null;

  const totals = totalsFor(ws, from, to, brandId);
  const previous = totalsFor(ws, prevFrom, prevTo, brandId);

  const params: unknown[] = [ws, from, to];
  let brandFilter = '';
  if (brandId) {
    brandFilter = ' AND brand_id = ?';
    params.push(brandId);
  }

  const series = all<any>(
    `SELECT date, SUM(impressions) AS impressions, SUM(reach) AS reach, SUM(engagements) AS engagements,
            SUM(clicks) AS clicks, SUM(spend) AS spend, SUM(conversions) AS conversions
     FROM metrics WHERE workspace_id = ? AND date BETWEEN ? AND ?${brandFilter}
     GROUP BY date ORDER BY date`,
    params,
  ).map((r) => ({
    date: r.date,
    impressions: r.impressions,
    reach: r.reach,
    engagements: r.engagements,
    clicks: r.clicks,
    spend: r.spend,
    conversions: r.conversions,
    engagementRate: r.impressions ? round((r.engagements / r.impressions) * 100, 2) : 0,
  }));

  const platformRows = all<any>(
    `SELECT platform, SUM(impressions) AS impressions, SUM(reach) AS reach, SUM(engagements) AS engagements,
            SUM(clicks) AS clicks, SUM(spend) AS spend, SUM(conversions) AS conversions
     FROM metrics WHERE workspace_id = ? AND date BETWEEN ? AND ?${brandFilter}
     GROUP BY platform ORDER BY engagements DESC`,
    params,
  );
  const engagementTotal = platformRows.reduce((acc, r) => acc + r.engagements, 0) || 1;
  const platforms = platformRows.map((r) => {
    const meta = PLATFORMS.find((p) => p.key === r.platform);
    return {
      platform: r.platform,
      label: meta?.label ?? r.platform,
      color: meta?.color ?? '#64748B',
      impressions: r.impressions,
      reach: r.reach,
      engagements: r.engagements,
      clicks: r.clicks,
      spend: r.spend,
      conversions: r.conversions,
      engagementRate: r.impressions ? round((r.engagements / r.impressions) * 100, 2) : 0,
      share: round((r.engagements / engagementTotal) * 100, 1),
    };
  });

  const followerSeries = all<any>(
    `SELECT platform, date, SUM(followers) AS followers FROM metrics
     WHERE workspace_id = ? AND date BETWEEN ? AND ?${brandFilter}
     GROUP BY platform, date ORDER BY date`,
    params,
  );
  const followerByPlatform = new Map<string, Array<{ date: string; followers: number }>>();
  for (const row of followerSeries) {
    if (!followerByPlatform.has(row.platform)) followerByPlatform.set(row.platform, []);
    followerByPlatform.get(row.platform)!.push({ date: row.date, followers: row.followers });
  }

  const brandRows = all<any>(
    `SELECT m.brand_id, b.name, b.color, SUM(m.impressions) AS impressions, SUM(m.reach) AS reach,
            SUM(m.engagements) AS engagements, SUM(m.clicks) AS clicks, SUM(m.spend) AS spend, SUM(m.conversions) AS conversions
     FROM metrics m LEFT JOIN brands b ON b.id = m.brand_id
     WHERE m.workspace_id = ? AND m.date BETWEEN ? AND ?${brandFilter}
     GROUP BY m.brand_id ORDER BY engagements DESC`,
    params,
  ).map((r) => ({
    brandId: r.brand_id,
    name: r.name ?? 'Unassigned',
    color: r.color ?? '#64748B',
    impressions: r.impressions,
    reach: r.reach,
    engagements: r.engagements,
    clicks: r.clicks,
    spend: r.spend,
    conversions: r.conversions,
    engagementRate: r.impressions ? round((r.engagements / r.impressions) * 100, 2) : 0,
  }));

  const postParams: unknown[] = [ws, from, to];
  let postFilter = '';
  if (brandId) {
    postFilter = ' AND p.brand_id = ?';
    postParams.push(brandId);
  }
  const topPosts = all<any>(
    `SELECT p.*, b.name AS brand_name, b.color AS brand_color, u.name AS owner_name, u.avatar_color AS owner_color, c.name AS campaign_name
     FROM posts p LEFT JOIN brands b ON b.id = p.brand_id
     LEFT JOIN users u ON u.id = p.owner_id LEFT JOIN campaigns c ON c.id = p.campaign_id
     WHERE p.workspace_id = ? AND p.status = 'published' AND date(p.published_at) BETWEEN ? AND ?${postFilter}
     ORDER BY p.published_at DESC LIMIT 40`,
    postParams,
  )
    .map((r) => enrichPost(r))
    .map((p: any) => ({ ...p, engagements: p.metrics.engagements ?? 0 }))
    .sort((a: any, b: any) => b.engagements - a.engagements)
    .slice(0, 6);

  const campaignRows = all<any>(
    `SELECT c.*, b.name AS brand_name, b.color AS brand_color FROM campaigns c LEFT JOIN brands b ON b.id = c.brand_id
     WHERE c.workspace_id = ? ORDER BY
       CASE c.status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 WHEN 'draft' THEN 2 ELSE 3 END, c.start_date DESC`,
    [ws],
  );

  return {
    range: { from, to, days, prevFrom, prevTo },
    totals,
    previous,
    deltas: {
      reach: round(pctChange(totals.reach, previous.reach), 1),
      impressions: round(pctChange(totals.impressions, previous.impressions), 1),
      engagements: round(pctChange(totals.engagements, previous.engagements), 1),
      followers: round(pctChange(totals.followers, previous.followers), 1),
      spend: round(pctChange(totals.spend, previous.spend), 1),
      engagementRate: round(pctChange(totals.engagementRate, previous.engagementRate), 1),
      clicks: round(pctChange(totals.clicks, previous.clicks), 1),
      conversions: round(pctChange(totals.conversions, previous.conversions), 1),
      roas: round(pctChange(totals.roas, previous.roas), 1),
    },
    series,
    platforms,
    brands: brandRows,
    followerSeries: Object.fromEntries(followerByPlatform),
    topPosts,
    campaigns: campaignRows.map((c: any) => ({
      id: c.id,
      name: c.name,
      brandName: c.brand_name,
      brandColor: c.brand_color,
      status: c.status,
      objective: c.objective,
      budget: c.budget,
      spend: c.spend,
      startDate: c.start_date,
      endDate: c.end_date,
      platforms: JSON.parse(c.platforms || '[]'),
      results: JSON.parse(c.results || '{}'),
    })),
  };
}

export function computeDemographics(workspaceId: string, brandId?: string | null) {
  const seedBase = `${workspaceId}:${brandId ?? 'all'}`;
  let hash = 0;
  for (const ch of seedBase) hash = (hash * 31 + ch.charCodeAt(0)) % 2147483647;
  const rng = mulberry32(hash);
  const ages = ['18–24', '25–34', '35–44', '45–54', '55+'];
  const weights = [0.14, 0.38, 0.27, 0.15, 0.06].map((w) => w * (0.85 + rng() * 0.3));
  const sum = weights.reduce((a, b) => a + b, 0);
  const cities = ['กรุงเทพฯ', 'นนทบุรี', 'ปทุมธานี', 'ชลบุรี', 'เชียงใหม่', 'ขอนแก่น', 'ภูเก็ต'];
  const cityWeights = [0.46, 0.13, 0.09, 0.08, 0.08, 0.06, 0.05].map((w) => w * (0.9 + rng() * 0.2));
  const citySum = cityWeights.reduce((a, b) => a + b, 0);
  return {
    source: 'platform-insights (Beta sample)',
    age: ages.map((label, i) => ({ label, value: round((weights[i] / sum) * 100, 1) })),
    gender: [
      { label: 'หญิง', value: round(54 + rng() * 12, 1) },
      { label: 'ชาย', value: round(30 + rng() * 10, 1) },
      { label: 'ไม่ระบุ', value: round(4 + rng() * 4, 1) },
    ],
    cities: cities.map((label, i) => ({ label, value: round((cityWeights[i] / citySum) * 100, 1) })),
    devices: [
      { label: 'Mobile', value: round(72 + rng() * 10, 1) },
      { label: 'Desktop', value: round(14 + rng() * 6, 1) },
      { label: 'Tablet', value: round(4 + rng() * 3, 1) },
    ],
    activeHours: [9, 12, 18, 19, 20, 21].map((hour) => ({
      hour,
      value: round(40 + rng() * 55, 0),
    })),
  };
}

export function computeHeatmap(workspaceId: string, brandId?: string | null) {
  const cells: Array<{ day: number; hour: number; value: number }> = [];
  const base = `${workspaceId}:${brandId ?? 'all'}`;
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      let hash = 7;
      for (const ch of `${base}:${day}:${hour}`) hash = (hash * 33 + ch.charCodeAt(0)) % 2147483647;
      const rng = mulberry32(hash)();
      const morning = Math.exp(-Math.pow(hour - 9.5, 2) / 9);
      const lunch = Math.exp(-Math.pow(hour - 12.5, 2) / 6);
      const evening = Math.exp(-Math.pow(hour - 20, 2) / 11);
      const weekendBoost = day === 0 || day === 6 ? 0.88 : 1;
      const value = clamp(Math.round((morning * 0.85 + lunch * 0.75 + evening * 1.25) * weekendBoost * (60 + rng * 45)), 2, 100);
      cells.push({ day, hour, value });
    }
  }
  const best = [...cells].sort((a, b) => b.value - a.value).slice(0, 5);
  return {
    cells,
    bestSlots: best.map((b) => ({
      day: ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'][b.day],
      hour: b.hour,
      value: b.value,
    })),
  };
}
