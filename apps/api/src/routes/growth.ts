import { Router } from 'express';
import { z } from 'zod';
import { all, get, id, logActivity, run } from '../db.js';
import { enrichPost, handle, requireRole, type AuthedRequest } from '../http.js';
import { HttpError, addDays, clamp, diffDays, round, todayBkk } from '../util.js';
import { computeDemographics, computeHeatmap, computeSummary } from '../analytics.js';

export const growthRouter = Router();

function campaignRows(workspaceId: string) {
  const today = todayBkk();
  const rows = all<any>(
    `SELECT c.*, b.name AS brand_name, b.color AS brand_color FROM campaigns c
     LEFT JOIN brands b ON b.id = c.brand_id WHERE c.workspace_id = ?
     ORDER BY CASE c.status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 WHEN 'draft' THEN 2 ELSE 3 END,
              COALESCE(c.start_date, '') DESC`,
    [workspaceId],
  );
  return rows.map((c) => {
    const start = c.start_date ?? today;
    const end = c.end_date ?? today;
    const totalDays = Math.max(diffDays(start, end), 1);
    const elapsed = clamp(diffDays(start, today), 0, totalDays);
    const expectedSpend = (c.budget * elapsed) / totalDays;
    const results = JSON.parse(c.results || '{}');
    return {
      id: c.id,
      name: c.name,
      brandId: c.brand_id,
      brandName: c.brand_name,
      brandColor: c.brand_color,
      objective: c.objective,
      status: c.status,
      budget: c.budget,
      spend: c.spend,
      startDate: c.start_date,
      endDate: c.end_date,
      platforms: JSON.parse(c.platforms || '[]'),
      results,
      boostPostId: c.boost_post_id,
      pacing: expectedSpend ? round((c.spend / expectedSpend) * 100, 0) : 0,
      budgetUsed: c.budget ? round((c.spend / c.budget) * 100, 0) : 0,
      daysLeft: Math.max(diffDays(today, end), 0),
      dailyBudget: round(c.budget / totalDays, 0),
      roas: c.spend && results.revenue ? round(results.revenue / c.spend, 2) : 0,
      cpl: results.leads ? round(c.spend / results.leads, 0) : 0,
    };
  });
}

growthRouter.get(
  '/campaigns',
  handle((req: AuthedRequest, res) => {
    res.json(campaignRows(req.auth.workspaceId));
  }),
);

const campaignSchema = z.object({
  brandId: z.string(),
  name: z.string().min(1).max(120),
  objective: z.enum(['awareness', 'engagement', 'conversion', 'lead_generation', 'traffic']),
  status: z.enum(['draft', 'active', 'paused', 'completed']).default('draft'),
  budget: z.number().min(0).max(100_000_000),
  startDate: z.string(),
  endDate: z.string(),
  platforms: z.array(z.string()).min(1),
  boostPostId: z.string().nullable().optional(),
});

growthRouter.post(
  '/campaigns',
  requireRole('editor'),
  handle((req: AuthedRequest, res) => {
    const parsed = campaignSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'ข้อมูลแคมเปญไม่ครบ');
    const d = parsed.data;
    const brand = get('SELECT id FROM brands WHERE id = ? AND workspace_id = ?', [d.brandId, req.auth.workspaceId]);
    if (!brand) throw new HttpError(400, 'Brand not found');
    const campaignId = id('cmp');
    run(
      `INSERT INTO campaigns (id, workspace_id, brand_id, name, objective, status, budget, spend, start_date, end_date, platforms, results, boost_post_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, '{}', ?, ?)`,
      [
        campaignId,
        req.auth.workspaceId,
        d.brandId,
        d.name,
        d.objective,
        d.status,
        d.budget,
        d.startDate,
        d.endDate,
        JSON.stringify(d.platforms),
        d.boostPostId ?? null,
        new Date().toISOString(),
      ],
    );
    logActivity(req.auth.workspaceId, req.auth.user.id, 'campaign.created', d.name, `งบ ฿${d.budget.toLocaleString('th-TH')}`);
    res.status(201).json(campaignRows(req.auth.workspaceId).find((c) => c.id === campaignId));
  }),
);

growthRouter.patch(
  '/campaigns/:id',
  requireRole('editor'),
  handle((req: AuthedRequest, res) => {
    const existing = get<any>('SELECT * FROM campaigns WHERE id = ? AND workspace_id = ?', [
      req.params.id,
      req.auth.workspaceId,
    ]);
    if (!existing) throw new HttpError(404, 'Campaign not found');
    const parsed = campaignSchema.partial().safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Invalid campaign payload');
    const d = parsed.data;
    run(
      `UPDATE campaigns SET name = COALESCE(?, name), objective = COALESCE(?, objective), status = COALESCE(?, status),
        budget = COALESCE(?, budget), start_date = COALESCE(?, start_date), end_date = COALESCE(?, end_date),
        platforms = COALESCE(?, platforms), boost_post_id = COALESCE(?, boost_post_id) WHERE id = ?`,
      [
        d.name ?? null,
        d.objective ?? null,
        d.status ?? null,
        d.budget ?? null,
        d.startDate ?? null,
        d.endDate ?? null,
        d.platforms ? JSON.stringify(d.platforms) : null,
        d.boostPostId ?? null,
        req.params.id,
      ],
    );
    logActivity(
      req.auth.workspaceId,
      req.auth.user.id,
      d.status && d.status !== existing.status ? `campaign.${d.status}` : 'campaign.updated',
      d.name ?? existing.name,
      '',
    );
    res.json(campaignRows(req.auth.workspaceId).find((c) => c.id === req.params.id));
  }),
);

growthRouter.delete(
  '/campaigns/:id',
  requireRole('admin'),
  handle((req: AuthedRequest, res) => {
    const existing = get<any>('SELECT name FROM campaigns WHERE id = ? AND workspace_id = ?', [
      req.params.id,
      req.auth.workspaceId,
    ]);
    if (!existing) throw new HttpError(404, 'Campaign not found');
    run('DELETE FROM campaigns WHERE id = ?', [req.params.id]);
    logActivity(req.auth.workspaceId, req.auth.user.id, 'campaign.deleted', existing.name, '');
    res.json({ ok: true });
  }),
);

growthRouter.get(
  '/campaigns/boostable',
  handle((req: AuthedRequest, res) => {
    const rows = all<any>(
      `SELECT p.*, b.name AS brand_name, b.color AS brand_color, u.name AS owner_name, u.avatar_color AS owner_color
       FROM posts p LEFT JOIN brands b ON b.id = p.brand_id LEFT JOIN users u ON u.id = p.owner_id
       WHERE p.workspace_id = ? AND p.status = 'published'
       ORDER BY p.published_at DESC LIMIT 12`,
      [req.auth.workspaceId],
    );
    res.json(rows.map((r) => enrichPost(r)));
  }),
);

/* ------------------------- analytics ------------------------- */

growthRouter.get(
  '/analytics/summary',
  handle((req: AuthedRequest, res) => {
    const brandId = (req.query.brandId as string) || null;
    const summary = computeSummary({
      workspaceId: req.auth.workspaceId,
      brandId: brandId && brandId !== 'all' ? brandId : null,
      days: Number(req.query.days) || 30,
      from: (req.query.from as string) || null,
      to: (req.query.to as string) || null,
    });
    res.json(summary);
  }),
);

growthRouter.get(
  '/analytics/demographics',
  handle((req: AuthedRequest, res) => {
    const brandId = (req.query.brandId as string) || null;
    res.json(computeDemographics(req.auth.workspaceId, brandId && brandId !== 'all' ? brandId : null));
  }),
);

growthRouter.get(
  '/analytics/heatmap',
  handle((req: AuthedRequest, res) => {
    const brandId = (req.query.brandId as string) || null;
    res.json(computeHeatmap(req.auth.workspaceId, brandId && brandId !== 'all' ? brandId : null));
  }),
);

function csvEscape(value: unknown): string {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

growthRouter.get(
  '/analytics/export.csv',
  handle((req: AuthedRequest, res) => {
    const brandId = (req.query.brandId as string) || null;
    const summary = computeSummary({
      workspaceId: req.auth.workspaceId,
      brandId: brandId && brandId !== 'all' ? brandId : null,
      days: Number(req.query.days) || 30,
    });
    const lines: string[] = [];
    lines.push(`SocialMK export — ${req.auth.workspace.name}`);
    lines.push(`Range,${summary.range.from},${summary.range.to}`);
    lines.push('');
    lines.push('Date,Impressions,Reach,Engagements,Clicks,Spend (THB),Conversions,Engagement rate (%)');
    for (const row of summary.series) {
      lines.push(
        [row.date, row.impressions, row.reach, row.engagements, row.clicks, row.spend, row.conversions, row.engagementRate]
          .map(csvEscape)
          .join(','),
      );
    }
    lines.push('');
    lines.push('Platform,Impressions,Reach,Engagements,Clicks,Spend (THB),Conversions,Engagement rate (%)');
    for (const row of summary.platforms) {
      lines.push(
        [row.label, row.impressions, row.reach, row.engagements, row.clicks, row.spend, row.conversions, row.engagementRate]
          .map(csvEscape)
          .join(','),
      );
    }
    lines.push('');
    lines.push('Brand,Impressions,Reach,Engagements,Clicks,Spend (THB),Conversions');
    for (const row of summary.brands) {
      lines.push([row.name, row.impressions, row.reach, row.engagements, row.clicks, row.spend, row.conversions].map(csvEscape).join(','));
    }
    const filename = `socialmk-report-${summary.range.from}-to-${summary.range.to}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(`\uFEFF${lines.join('\n')}`);
  }),
);

/* ------------------------- contacts ------------------------- */

const contactSchema = z.object({
  type: z.enum(['customer', 'prospect']).default('prospect'),
  name: z.string().min(1).max(120),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().max(40).optional().or(z.literal('')),
  platform: z.string().max(40).optional(),
  handle: z.string().max(80).optional(),
  tags: z.array(z.string().max(40)).max(12).optional(),
  source: z.string().max(80).optional(),
  ltv: z.number().min(0).max(100_000_000).optional(),
  consent: z.enum(['granted', 'revoked', 'pending']).default('granted'),
  sentiment: z.enum(['positive', 'neutral', 'negative']).default('neutral'),
  score: z.number().int().min(0).max(100).optional(),
  note: z.string().max(600).optional(),
});

function contactRows(workspaceId: string, query: Record<string, string>) {
  const params: unknown[] = [workspaceId];
  let sql = 'SELECT * FROM contacts WHERE workspace_id = ?';
  if (query.type && query.type !== 'all') {
    sql += ' AND type = ?';
    params.push(query.type);
  }
  if (query.consent && query.consent !== 'all') {
    sql += ' AND consent = ?';
    params.push(query.consent);
  }
  if (query.platform && query.platform !== 'all') {
    sql += ' AND platform = ?';
    params.push(query.platform);
  }
  if (query.q) {
    sql += ' AND (name LIKE ? OR email LIKE ? OR note LIKE ?)';
    params.push(`%${query.q}%`, `%${query.q}%`, `%${query.q}%`);
  }
  sql += ' ORDER BY score DESC, created_at DESC LIMIT 500';
  return all<any>(sql, params).map((c) => ({
    id: c.id,
    type: c.type,
    name: c.name,
    email: c.email,
    phone: c.phone,
    platform: c.platform,
    handle: c.handle,
    tags: JSON.parse(c.tags || '[]'),
    source: c.source,
    ltv: c.ltv,
    consent: c.consent,
    sentiment: c.sentiment,
    score: c.score,
    lastInteractionAt: c.last_interaction_at,
    note: c.note,
    createdAt: c.created_at,
  }));
}

growthRouter.get(
  '/contacts',
  handle((req: AuthedRequest, res) => {
    res.json(contactRows(req.auth.workspaceId, req.query as Record<string, string>));
  }),
);

growthRouter.get(
  '/contacts/segments',
  handle((req: AuthedRequest, res) => {
    const ws = req.auth.workspaceId;
    const base = get<any>(
      `SELECT COUNT(*) AS total,
        SUM(CASE WHEN type='customer' THEN 1 ELSE 0 END) AS customers,
        SUM(CASE WHEN type='prospect' THEN 1 ELSE 0 END) AS prospects,
        SUM(CASE WHEN consent='revoked' THEN 1 ELSE 0 END) AS revoked,
        SUM(CASE WHEN sentiment='positive' THEN 1 ELSE 0 END) AS positive,
        COALESCE(SUM(ltv),0) AS ltv
       FROM contacts WHERE workspace_id = ?`,
      [ws],
    );
    const platforms = all<any>(
      `SELECT platform, COUNT(*) AS n FROM contacts WHERE workspace_id = ? AND platform IS NOT NULL GROUP BY platform ORDER BY n DESC`,
      [ws],
    );
    return res.json({
      total: base?.total ?? 0,
      customers: base?.customers ?? 0,
      prospects: base?.prospects ?? 0,
      revoked: base?.revoked ?? 0,
      positive: base?.positive ?? 0,
      totalLtv: base?.ltv ?? 0,
      platforms,
    });
  }),
);

growthRouter.post(
  '/contacts',
  requireRole('editor'),
  handle((req: AuthedRequest, res) => {
    const parsed = contactSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'ข้อมูลผู้ติดต่อไม่ถูกต้อง');
    const d = parsed.data;
    const contactId = id('cnt');
    run(
      `INSERT INTO contacts (id, workspace_id, type, name, email, phone, platform, handle, tags, source, ltv, consent, sentiment, score, last_interaction_at, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        contactId,
        req.auth.workspaceId,
        d.type,
        d.name,
        d.email || null,
        d.phone || null,
        d.platform ?? null,
        d.handle ?? null,
        JSON.stringify(d.tags ?? []),
        d.source ?? 'Manual',
        d.ltv ?? 0,
        d.consent,
        d.sentiment,
        d.score ?? 50,
        new Date().toISOString(),
        d.note ?? '',
        new Date().toISOString(),
      ],
    );
    logActivity(req.auth.workspaceId, req.auth.user.id, 'contact.created', d.name, `ที่มา: ${d.source ?? 'Manual'}`);
    res.status(201).json(contactRows(req.auth.workspaceId, {}).find((c) => c.id === contactId));
  }),
);

growthRouter.patch(
  '/contacts/:id',
  requireRole('editor'),
  handle((req: AuthedRequest, res) => {
    const existing = get<any>('SELECT * FROM contacts WHERE id = ? AND workspace_id = ?', [
      req.params.id,
      req.auth.workspaceId,
    ]);
    if (!existing) throw new HttpError(404, 'Contact not found');
    const parsed = contactSchema.partial().safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Invalid contact payload');
    const d = parsed.data;
    run(
      `UPDATE contacts SET type = COALESCE(?, type), name = COALESCE(?, name), email = COALESCE(?, email),
        phone = COALESCE(?, phone), platform = COALESCE(?, platform), tags = COALESCE(?, tags), source = COALESCE(?, source),
        ltv = COALESCE(?, ltv), consent = COALESCE(?, consent), sentiment = COALESCE(?, sentiment),
        score = COALESCE(?, score), note = COALESCE(?, note), last_interaction_at = ? WHERE id = ?`,
      [
        d.type ?? null,
        d.name ?? null,
        d.email ?? null,
        d.phone ?? null,
        d.platform ?? null,
        d.tags ? JSON.stringify(d.tags) : null,
        d.source ?? null,
        d.ltv ?? null,
        d.consent ?? null,
        d.sentiment ?? null,
        d.score ?? null,
        d.note ?? null,
        new Date().toISOString(),
        req.params.id,
      ],
    );
    logActivity(req.auth.workspaceId, req.auth.user.id, 'contact.updated', d.name ?? existing.name, '');
    res.json(contactRows(req.auth.workspaceId, {}).find((c) => c.id === req.params.id));
  }),
);

growthRouter.delete(
  '/contacts/:id',
  requireRole('admin'),
  handle((req: AuthedRequest, res) => {
    const existing = get<any>('SELECT name FROM contacts WHERE id = ? AND workspace_id = ?', [
      req.params.id,
      req.auth.workspaceId,
    ]);
    if (!existing) throw new HttpError(404, 'Contact not found');
    run('DELETE FROM contacts WHERE id = ?', [req.params.id]);
    logActivity(req.auth.workspaceId, req.auth.user.id, 'contact.deleted', existing.name, 'ลบตามคำขอ PDPA');
    res.json({ ok: true });
  }),
);

growthRouter.get(
  '/contacts/export.csv',
  handle((req: AuthedRequest, res) => {
    const rows = contactRows(req.auth.workspaceId, req.query as Record<string, string>);
    const lines = ['Name,Type,Email,Platform,Tags,Source,LTV,Consent,Sentiment,Score,Last interaction'];
    for (const c of rows) {
      lines.push(
        [c.name, c.type, c.email, c.platform, c.tags.join('|'), c.source, c.ltv, c.consent, c.sentiment, c.score, c.lastInteractionAt]
          .map(csvEscape)
          .join(','),
      );
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="socialmk-contacts-${todayBkk()}.csv"`);
    res.send(`\uFEFF${lines.join('\n')}`);
  }),
);

growthRouter.get(
  '/activity',
  handle((req: AuthedRequest, res) => {
    const rows = all<any>(
      `SELECT a.*, u.name AS user_name, u.avatar_color AS user_color FROM activity a
       LEFT JOIN users u ON u.id = a.user_id WHERE a.workspace_id = ? ORDER BY a.at DESC LIMIT ?`,
      [req.auth.workspaceId, Math.min(Number(req.query.limit) || 40, 100)],
    );
    res.json(
      rows.map((a) => ({
        id: a.id,
        action: a.action,
        target: a.target,
        detail: a.detail,
        at: a.at,
        userName: a.user_name ?? 'System',
        userColor: a.user_color ?? '#64748B',
      })),
    );
  }),
);

growthRouter.get(
  '/overview',
  handle((req: AuthedRequest, res) => {
    const ws = req.auth.workspaceId;
    const brandId = typeof req.query.brandId === 'string' && req.query.brandId !== 'all' ? req.query.brandId : null;
    const brandFilter = brandId ? ' AND p.brand_id = ?' : '';
    const brandParams = brandId ? [brandId] : [];
    const summary = computeSummary({ workspaceId: ws, days: Number(req.query.days) || 30, brandId });
    const upcoming = all<any>(
      `SELECT p.*, b.name AS brand_name, b.color AS brand_color, u.name AS owner_name, u.avatar_color AS owner_color
       FROM posts p LEFT JOIN brands b ON b.id = p.brand_id LEFT JOIN users u ON u.id = p.owner_id
       WHERE p.workspace_id = ? AND p.status IN ('scheduled','approved','review')${brandFilter}
       ORDER BY p.scheduled_at ASC LIMIT 6`,
      [ws, ...brandParams],
    ).map((r) => enrichPost(r));
    const statusCounts = all<any>(
      `SELECT p.status, COUNT(*) AS n FROM posts p WHERE p.workspace_id = ?${brandFilter} GROUP BY p.status`,
      [ws, ...brandParams],
    );
    const connections = all<any>(
      `SELECT platform, status, account_name, followers FROM connections WHERE workspace_id = ?`,
      [ws],
    );
    const contacts = get<any>(
      `SELECT COUNT(*) AS total, SUM(CASE WHEN type='customer' THEN 1 ELSE 0 END) AS customers FROM contacts WHERE workspace_id = ?`,
      [ws],
    );
    res.json({
      summary,
      upcoming,
      statusCounts: Object.fromEntries(statusCounts.map((s) => [s.status, s.n])),
      connections: {
        total: connections.length,
        connected: connections.filter((c) => c.status === 'connected').length,
        attention: connections.filter((c) => c.status !== 'connected').length,
        followers: connections.reduce((acc, c) => acc + (c.followers ?? 0), 0),
      },
      contacts: { total: contacts?.total ?? 0, customers: contacts?.customers ?? 0 },
      today: todayBkk(),
      weekRange: { from: addDays(todayBkk(), -6), to: todayBkk() },
    });
  }),
);
