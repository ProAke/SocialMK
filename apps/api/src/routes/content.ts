import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import { DATA_DIR, all, get, id, logActivity, run } from '../db.js';
import { enrichPost, handle, requireRole, type AuthedRequest } from '../http.js';
import { HttpError, addDays, todayBkk } from '../util.js';
import { generateCopy, generateInsight, generatePlan, renderCover, type ArtStyle, type Lang } from '../ai.js';
import { computeSummary } from '../analytics.js';

export const contentRouter = Router();

function normalizeDateTime(value?: string | null): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T09:00:00+07:00`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return `${value}:00+07:00`;
  return value;
}

const postSelect = `SELECT p.*, b.name AS brand_name, b.color AS brand_color,
  u.name AS owner_name, u.avatar_color AS owner_color, c.name AS campaign_name
  FROM posts p LEFT JOIN brands b ON b.id = p.brand_id
  LEFT JOIN users u ON u.id = p.owner_id LEFT JOIN campaigns c ON c.id = p.campaign_id`;

contentRouter.get(
  '/posts',
  handle((req: AuthedRequest, res) => {
    const { from, to, brandId, status, platform, q, limit } = req.query as Record<string, string>;
    const params: unknown[] = [req.auth.workspaceId];
    let sql = `${postSelect} WHERE p.workspace_id = ?`;
    if (brandId && brandId !== 'all') {
      sql += ' AND p.brand_id = ?';
      params.push(brandId);
    }
    if (status && status !== 'all') {
      const statuses = status.split(',');
      sql += ` AND p.status IN (${statuses.map(() => '?').join(',')})`;
      params.push(...statuses);
    }
    if (platform && platform !== 'all') {
      sql += ' AND p.platforms LIKE ?';
      params.push(`%"${platform}"%`);
    }
    if (from) {
      sql += ' AND date(p.scheduled_at) >= ?';
      params.push(from);
    }
    if (to) {
      sql += ' AND date(p.scheduled_at) <= ?';
      params.push(to);
    }
    if (q) {
      sql += ' AND (p.title LIKE ? OR p.body LIKE ?)';
      params.push(`%${q}%`, `%${q}%`);
    }
    sql += ' ORDER BY COALESCE(p.scheduled_at, p.created_at) ASC LIMIT ?';
    params.push(Math.min(Number(limit) || 400, 500));
    res.json(all(sql, params).map((row) => enrichPost(row)));
  }),
);

contentRouter.get(
  '/posts/:id',
  handle((req: AuthedRequest, res) => {
    const row = get(`${postSelect} WHERE p.id = ? AND p.workspace_id = ?`, [req.params.id, req.auth.workspaceId]);
    if (!row) throw new HttpError(404, 'Post not found');
    res.json(enrichPost(row));
  }),
);

const postSchema = z.object({
  brandId: z.string().min(3),
  title: z.string().min(1).max(160),
  body: z.string().max(6000).optional(),
  hashtags: z.array(z.string().max(60)).max(30).optional(),
  platforms: z.array(z.string().min(2)).min(1).max(10),
  media: z.array(z.record(z.any())).max(10).optional(),
  status: z.enum(['idea', 'draft', 'review', 'approved', 'scheduled', 'published', 'archived']).optional(),
  contentType: z.string().max(30).optional(),
  pillar: z.string().max(60).optional(),
  scheduledAt: z.string().nullable().optional(),
  campaignId: z.string().nullable().optional(),
  notes: z.string().max(2000).optional(),
  aiGenerated: z.boolean().optional(),
  ownerId: z.string().nullable().optional(),
});

contentRouter.post(
  '/posts',
  requireRole('editor'),
  handle((req: AuthedRequest, res) => {
    const parsed = postSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, `ข้อมูลโพสต์ไม่ครบ: ${parsed.error.issues[0]?.message ?? ''}`);
    const d = parsed.data;
    const brand = get('SELECT id, name FROM brands WHERE id = ? AND workspace_id = ?', [d.brandId, req.auth.workspaceId]);
    if (!brand) throw new HttpError(400, 'Brand not found in this workspace');
    const postId = id('pst');
    const now = new Date().toISOString();
    const status = d.status ?? 'draft';
    run(
      `INSERT INTO posts (id, workspace_id, brand_id, title, body, hashtags, platforms, media, status, content_type, pillar,
        scheduled_at, published_at, owner_id, campaign_id, ai_generated, notes, metrics, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?)`,
      [
        postId,
        req.auth.workspaceId,
        d.brandId,
        d.title,
        d.body ?? '',
        JSON.stringify(d.hashtags ?? []),
        JSON.stringify(d.platforms),
        JSON.stringify(d.media ?? []),
        status,
        d.contentType ?? 'image',
        d.pillar ?? null,
        normalizeDateTime(d.scheduledAt),
        status === 'published' ? now : null,
        d.ownerId ?? req.auth.user.id,
        d.campaignId ?? null,
        d.aiGenerated ? 1 : 0,
        d.notes ?? '',
        now,
        now,
      ],
    );
    logActivity(req.auth.workspaceId, req.auth.user.id, 'post.created', d.title, status);
    res.status(201).json(enrichPost(get(`${postSelect} WHERE p.id = ?`, [postId])!));
  }),
);

contentRouter.patch(
  '/posts/:id',
  requireRole('editor'),
  handle((req: AuthedRequest, res) => {
    const existing = get<any>('SELECT * FROM posts WHERE id = ? AND workspace_id = ?', [
      req.params.id,
      req.auth.workspaceId,
    ]);
    if (!existing) throw new HttpError(404, 'Post not found');
    const parsed = postSchema.partial().safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Invalid post payload');
    const d = parsed.data;
    const status = d.status ?? existing.status;
    const publishedAt =
      status === 'published' ? existing.published_at ?? new Date().toISOString() : existing.published_at;
    run(
      `UPDATE posts SET brand_id = COALESCE(?, brand_id), title = COALESCE(?, title), body = COALESCE(?, body),
        hashtags = COALESCE(?, hashtags), platforms = COALESCE(?, platforms), media = COALESCE(?, media),
        status = ?, content_type = COALESCE(?, content_type), pillar = COALESCE(?, pillar),
        scheduled_at = ?, published_at = ?, campaign_id = ?, notes = COALESCE(?, notes),
        ai_generated = COALESCE(?, ai_generated), updated_at = ?
       WHERE id = ?`,
      [
        d.brandId ?? null,
        d.title ?? null,
        d.body ?? null,
        d.hashtags ? JSON.stringify(d.hashtags) : null,
        d.platforms ? JSON.stringify(d.platforms) : null,
        d.media ? JSON.stringify(d.media) : null,
        status,
        d.contentType ?? null,
        d.pillar ?? null,
        d.scheduledAt !== undefined ? normalizeDateTime(d.scheduledAt) : existing.scheduled_at,
        publishedAt,
        d.campaignId !== undefined ? d.campaignId : existing.campaign_id,
        d.notes ?? null,
        d.aiGenerated === undefined ? null : d.aiGenerated ? 1 : 0,
        new Date().toISOString(),
        req.params.id,
      ],
    );
    if (d.status && d.status !== existing.status) {
      logActivity(
        req.auth.workspaceId,
        req.auth.user.id,
        `post.${d.status}`,
        d.title ?? existing.title,
        `เปลี่ยนสถานะเป็น ${d.status}`,
      );
    } else {
      logActivity(req.auth.workspaceId, req.auth.user.id, 'post.updated', d.title ?? existing.title, '');
    }
    res.json(enrichPost(get(`${postSelect} WHERE p.id = ?`, [req.params.id])!));
  }),
);

contentRouter.post(
  '/posts/:id/duplicate',
  requireRole('editor'),
  handle((req: AuthedRequest, res) => {
    const existing = get<any>('SELECT * FROM posts WHERE id = ? AND workspace_id = ?', [
      req.params.id,
      req.auth.workspaceId,
    ]);
    if (!existing) throw new HttpError(404, 'Post not found');
    const newId = id('pst');
    const now = new Date().toISOString();
    run(
      `INSERT INTO posts (id, workspace_id, brand_id, title, body, hashtags, platforms, media, status, content_type, pillar,
        scheduled_at, published_at, owner_id, campaign_id, ai_generated, notes, metrics, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, NULL, NULL, ?, NULL, ?, ?, '{}', ?, ?)`,
      [
        newId,
        req.auth.workspaceId,
        existing.brand_id,
        `${existing.title} (สำเนา)`,
        existing.body,
        existing.hashtags,
        existing.platforms,
        existing.media,
        existing.content_type,
        existing.pillar,
        req.auth.user.id,
        existing.ai_generated,
        existing.notes,
        now,
        now,
      ],
    );
    res.status(201).json(enrichPost(get(`${postSelect} WHERE p.id = ?`, [newId])!));
  }),
);

contentRouter.delete(
  '/posts/:id',
  requireRole('editor'),
  handle((req: AuthedRequest, res) => {
    const existing = get<any>('SELECT title FROM posts WHERE id = ? AND workspace_id = ?', [
      req.params.id,
      req.auth.workspaceId,
    ]);
    if (!existing) throw new HttpError(404, 'Post not found');
    run('DELETE FROM posts WHERE id = ?', [req.params.id]);
    logActivity(req.auth.workspaceId, req.auth.user.id, 'post.deleted', existing.title, '');
    res.json({ ok: true });
  }),
);

contentRouter.get(
  '/assets',
  handle((req: AuthedRequest, res) => {
    const rows = all<any>(
      `SELECT a.*, b.name AS brand_name, b.color AS brand_color FROM assets a
       LEFT JOIN brands b ON b.id = a.brand_id WHERE a.workspace_id = ? ORDER BY a.created_at DESC LIMIT 100`,
      [req.auth.workspaceId],
    );
    res.json(
      rows.map((a) => ({
        id: a.id,
        name: a.name,
        kind: a.kind,
        url: a.url,
        width: a.width,
        height: a.height,
        prompt: a.prompt,
        source: a.source,
        brandId: a.brand_id,
        brandName: a.brand_name,
        brandColor: a.brand_color,
        createdAt: a.created_at,
      })),
    );
  }),
);

contentRouter.delete(
  '/assets/:id',
  requireRole('editor'),
  handle((req: AuthedRequest, res) => {
    const asset = get<any>('SELECT * FROM assets WHERE id = ? AND workspace_id = ?', [
      req.params.id,
      req.auth.workspaceId,
    ]);
    if (!asset) throw new HttpError(404, 'Asset not found');
    run('DELETE FROM assets WHERE id = ?', [asset.id]);
    if (asset.url?.startsWith('/media/assets/')) {
      const file = path.join(DATA_DIR, 'assets', path.basename(asset.url));
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
    res.json({ ok: true });
  }),
);

/* ----------------------------- AI ----------------------------- */

contentRouter.post(
  '/ai/copy',
  handle((req: AuthedRequest, res) => {
    const parsed = z
      .object({
        brandId: z.string().optional(),
        platform: z.string().default('facebook'),
        objective: z.enum(['awareness', 'engagement', 'conversion', 'education', 'community']).default('engagement'),
        language: z.enum(['th', 'en']).default('th'),
        keywords: z.string().max(300).optional(),
        offer: z.string().max(300).optional(),
        product: z.string().max(160).optional(),
        variants: z.number().int().min(1).max(5).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Invalid brief');
    const brand = parsed.data.brandId
      ? get<any>('SELECT * FROM brands WHERE id = ? AND workspace_id = ?', [
          parsed.data.brandId,
          req.auth.workspaceId,
        ])
      : null;
    const variants = generateCopy(
      {
        brandName: brand?.name ?? req.auth.workspace.name,
        industry: brand?.industry ?? undefined,
        audience: brand?.audience ?? undefined,
        tone: brand?.tone ?? undefined,
        platform: parsed.data.platform,
        objective: parsed.data.objective,
        language: parsed.data.language as Lang,
        keywords: parsed.data.keywords,
        offer: parsed.data.offer,
        product: parsed.data.product,
      },
      parsed.data.variants ?? 3,
    );
    res.json({ variants, brand: brand ? { id: brand.id, name: brand.name, color: brand.color } : null });
  }),
);

contentRouter.post(
  '/ai/image',
  requireRole('editor'),
  handle((req: AuthedRequest, res) => {
    const parsed = z
      .object({
        brandId: z.string().optional(),
        style: z.enum(['gradient-mesh', 'bold-type', 'editorial', 'product', 'tech-grid', 'festive']).default('gradient-mesh'),
        headline: z.string().min(1).max(120),
        subline: z.string().max(160).optional(),
        badge: z.string().max(40).optional(),
        width: z.number().int().min(400).max(2400).default(1080),
        height: z.number().int().min(400).max(2400).default(1080),
        save: z.boolean().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Invalid image brief');
    const brand = parsed.data.brandId
      ? get<any>('SELECT * FROM brands WHERE id = ? AND workspace_id = ?', [
          parsed.data.brandId,
          req.auth.workspaceId,
        ])
      : null;
    const svg = renderCover({
      style: parsed.data.style as ArtStyle,
      width: parsed.data.width,
      height: parsed.data.height,
      headline: parsed.data.headline,
      subline: parsed.data.subline,
      badge: parsed.data.badge,
      brand: brand?.name ?? req.auth.workspace.name,
      color: brand?.color ?? '#5B5BD6',
      accent: brand?.accent ?? '#7CF7D4',
    });
    let asset = null;
    if (parsed.data.save !== false) {
      const assetId = id('ast');
      const fileName = `${assetId}.svg`;
      fs.mkdirSync(path.join(DATA_DIR, 'assets'), { recursive: true });
      fs.writeFileSync(path.join(DATA_DIR, 'assets', fileName), svg, 'utf8');
      run(
        `INSERT INTO assets (id, workspace_id, brand_id, name, kind, url, width, height, prompt, source, created_at)
         VALUES (?, ?, ?, ?, 'ai', ?, ?, ?, ?, 'SocialMK AI Studio', ?)`,
        [
          assetId,
          req.auth.workspaceId,
          brand?.id ?? null,
          parsed.data.headline.slice(0, 60),
          `/media/assets/${fileName}`,
          parsed.data.width,
          parsed.data.height,
          `${parsed.data.style} · ${parsed.data.badge ?? ''}`,
          new Date().toISOString(),
        ],
      );
      logActivity(req.auth.workspaceId, req.auth.user.id, 'asset.generated', parsed.data.headline.slice(0, 60), parsed.data.style);
      asset = { id: assetId, url: `/media/assets/${fileName}`, width: parsed.data.width, height: parsed.data.height };
    }
    res.json({ svg, asset });
  }),
);

contentRouter.post(
  '/ai/plan',
  handle((req: AuthedRequest, res) => {
    const parsed = z
      .object({
        brandId: z.string(),
        month: z.string().regex(/^\d{4}-\d{2}$/),
        platforms: z.array(z.string()).default(['facebook', 'instagram']),
        postsPerWeek: z.number().int().min(1).max(7).default(3),
        language: z.enum(['th', 'en']).default('th'),
        objective: z.enum(['awareness', 'engagement', 'conversion', 'education', 'community']).optional(),
        topics: z.string().max(300).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Invalid plan brief');
    const brand = get<any>('SELECT * FROM brands WHERE id = ? AND workspace_id = ?', [
      parsed.data.brandId,
      req.auth.workspaceId,
    ]);
    if (!brand) throw new HttpError(404, 'Brand not found');
    const items = generatePlan({
      brandName: brand.name,
      brandId: brand.id,
      month: parsed.data.month,
      platforms: parsed.data.platforms,
      postsPerWeek: parsed.data.postsPerWeek,
      language: parsed.data.language as Lang,
      objective: parsed.data.objective,
      topics: parsed.data.topics || brand.industry || brand.name,
    });
    res.json({
      items,
      summary: {
        total: items.length,
        platforms: [...new Set(items.map((i) => i.platform))],
        pillars: [...new Set(items.map((i) => i.pillar))],
        month: parsed.data.month,
      },
    });
  }),
);

contentRouter.post(
  '/ai/plan/apply',
  requireRole('editor'),
  handle((req: AuthedRequest, res) => {
    const parsed = z
      .object({
        brandId: z.string(),
        items: z
          .array(
            z.object({
              date: z.string(),
              time: z.string(),
              platform: z.string(),
              title: z.string().min(1),
              body: z.string().default(''),
              hashtags: z.array(z.string()).default([]),
              pillar: z.string().default('Educate'),
              contentType: z.string().default('image'),
            }),
          )
          .min(1)
          .max(120),
      })
      .safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Invalid plan');
    const now = new Date().toISOString();
    const stmt = `INSERT INTO posts (id, workspace_id, brand_id, title, body, hashtags, platforms, media, status, content_type, pillar,
        scheduled_at, published_at, owner_id, campaign_id, ai_generated, notes, metrics, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, '[]', 'draft', ?, ?, ?, NULL, ?, NULL, 1, '', '{}', ?, ?)`;
    const created: string[] = [];
    for (const item of parsed.data.items) {
      const postId = id('pst');
      created.push(postId);
      run(stmt, [
        postId,
        req.auth.workspaceId,
        parsed.data.brandId,
        item.title,
        item.body,
        JSON.stringify(item.hashtags),
        JSON.stringify([item.platform]),
        item.contentType,
        item.pillar,
        normalizeDateTime(`${item.date}T${item.time}`),
        req.auth.user.id,
        now,
        now,
      ]);
    }
    logActivity(req.auth.workspaceId, req.auth.user.id, 'plan.applied', `${parsed.data.items.length} คอนเทนต์`, 'สร้างจาก AI Planner');
    res.status(201).json({ created: created.length, ids: created });
  }),
);

contentRouter.get(
  '/ai/insight',
  handle((req: AuthedRequest, res) => {
    const days = Number(req.query.days) || 30;
    const brandId = (req.query.brandId as string) || null;
    const language = (req.query.language as Lang) || 'th';
    const summary = computeSummary({
      workspaceId: req.auth.workspaceId,
      brandId: brandId && brandId !== 'all' ? brandId : null,
      days,
    });
    const top = summary.platforms[0] ?? { platform: 'facebook', label: 'Facebook', share: 0 };
    const weakest = summary.platforms[summary.platforms.length - 1] ?? top;
    const brand =
      brandId && brandId !== 'all'
        ? get<{ name: string }>('SELECT name FROM brands WHERE id = ? AND workspace_id = ?', [
            brandId,
            req.auth.workspaceId,
          ])
        : null;
    const pending = get<any>(
      `SELECT COUNT(*) AS n FROM posts WHERE workspace_id = ? AND status IN ('review','approved')`,
      [req.auth.workspaceId],
    );
    const expiring = all<any>(
      `SELECT account_name, platform FROM connections WHERE workspace_id = ? AND status = 'attention'`,
      [req.auth.workspaceId],
    );
    const insight = generateInsight({
      language,
      brandName: brand?.name ?? req.auth.workspace.name,
      rangeDays: summary.range.days,
      reach: summary.totals.reach,
      reachDelta: summary.deltas.reach,
      engagementRate: summary.totals.engagementRate,
      engagementDelta: summary.deltas.engagementRate,
      topPlatform: { platform: top.platform, label: top.label, share: top.share },
      weakestPlatform: { platform: weakest.platform, label: weakest.label, share: weakest.share },
      spend: summary.totals.spend,
      roas: summary.totals.roas,
      pendingPosts: pending?.n ?? 0,
      expiringConnections: expiring.map((e) => `${e.account_name}`),
    });
    res.json({ ...insight, generatedAt: new Date().toISOString(), range: summary.range });
  }),
);

const ART_DIR = path.join(DATA_DIR, 'assets');
fs.mkdirSync(ART_DIR, { recursive: true });

export function sampleWeekRange() {
  const today = todayBkk();
  return { from: addDays(today, -6), to: today };
}
