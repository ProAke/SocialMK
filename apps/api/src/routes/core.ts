import { Router } from 'express';
import { z } from 'zod';
import { all, get, id, logActivity, run } from '../db.js';
import { handle, requireRole, type AuthedRequest } from '../http.js';
import { HttpError, PLATFORMS, addDays, todayBkk } from '../util.js';

export const coreRouter = Router();

function brandRows(workspaceId: string) {
  const brands = all(
    `SELECT b.*, 
       (SELECT COUNT(*) FROM posts p WHERE p.brand_id = b.id) AS post_count,
       (SELECT COUNT(*) FROM connections c WHERE c.brand_id = b.id) AS connection_count
     FROM brands b WHERE b.workspace_id = ? ORDER BY b.name`,
    [workspaceId],
  );
  return brands.map((b: any) => ({
    id: b.id,
    workspaceId: b.workspace_id,
    name: b.name,
    industry: b.industry,
    color: b.color,
    accent: b.accent,
    tone: b.tone,
    audience: b.audience,
    guidelines: b.guidelines,
    postCount: b.post_count,
    connectionCount: b.connection_count,
    createdAt: b.created_at,
  }));
}

coreRouter.get(
  '/workspaces',
  handle((req: AuthedRequest, res) => {
    const rows = all(
      `SELECT w.*, m.role,
        (SELECT COUNT(*) FROM brands b WHERE b.workspace_id = w.id) AS brands,
        (SELECT COUNT(*) FROM connections c WHERE c.workspace_id = w.id) AS connections,
        (SELECT COUNT(*) FROM memberships mm WHERE mm.workspace_id = w.id) AS members
       FROM memberships m JOIN workspaces w ON w.id = m.workspace_id
       WHERE m.user_id = ?
       ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'editor' THEN 2 ELSE 3 END, m.rowid`,
      [req.auth.user.id],
    );
    res.json(
      rows.map((w: any) => ({
        id: w.id,
        name: w.name,
        slug: w.slug,
        plan: w.plan,
        industry: w.industry,
        bridgeUrl: w.bridge_url,
        timezone: w.timezone,
        role: w.role,
        brandCount: w.brands,
        connectionCount: w.connections,
        memberCount: w.members,
        active: w.id === req.auth.workspaceId,
      })),
    );
  }),
);

coreRouter.patch(
  '/workspaces/:id',
  requireRole('admin'),
  handle((req: AuthedRequest, res) => {
    if (req.params.id !== req.auth.workspaceId) throw new HttpError(403, 'Workspace mismatch');
    const parsed = z
      .object({
        name: z.string().min(2).max(80).optional(),
        industry: z.string().max(120).optional(),
        bridgeUrl: z.string().trim().max(200).nullable().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'ข้อมูล workspace ไม่ถูกต้อง');
    const current = get<any>('SELECT name, industry, bridge_url FROM workspaces WHERE id = ?', [req.auth.workspaceId]);
    if (!current) throw new HttpError(404, 'Workspace not found');
    const { name, industry } = parsed.data;
    let bridgeUrl = parsed.data.bridgeUrl === undefined ? current.bridge_url : parsed.data.bridgeUrl;
    if (bridgeUrl === '') bridgeUrl = null;
    if (bridgeUrl) {
      if (!/^https?:\/\//i.test(bridgeUrl)) bridgeUrl = `https://${bridgeUrl}`;
      try {
        new URL(bridgeUrl);
      } catch {
        throw new HttpError(400, 'รูปแบบ URL ของ Bridge ไม่ถูกต้อง');
      }
    }
    run(
      `UPDATE workspaces SET name = ?, industry = ?, bridge_url = ? WHERE id = ?`,
      [name ?? current.name, industry ?? current.industry, bridgeUrl, req.auth.workspaceId],
    );
    logActivity(req.auth.workspaceId, req.auth.user.id, 'workspace.updated', name ?? req.auth.workspace.name, '');
    const updated = get<any>('SELECT * FROM workspaces WHERE id = ?', [req.auth.workspaceId]);
    res.json({
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      plan: updated.plan,
      industry: updated.industry,
      bridgeUrl: updated.bridge_url,
      timezone: updated.timezone,
    });
  }),
);

coreRouter.get(
  '/brands',
  handle((req: AuthedRequest, res) => {
    res.json(brandRows(req.auth.workspaceId));
  }),
);

coreRouter.post(
  '/brands',
  requireRole('admin'),
  handle((req: AuthedRequest, res) => {
    const parsed = z
      .object({
        name: z.string().min(1).max(80),
        industry: z.string().max(120).optional(),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        tone: z.string().max(160).optional(),
        audience: z.string().max(240).optional(),
        guidelines: z.string().max(600).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Invalid brand payload');
    const brandId = id('brd');
    run(
      `INSERT INTO brands (id, workspace_id, name, industry, color, accent, tone, audience, guidelines, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        brandId,
        req.auth.workspaceId,
        parsed.data.name,
        parsed.data.industry ?? null,
        parsed.data.color,
        parsed.data.accent ?? '#FFFFFF',
        parsed.data.tone ?? null,
        parsed.data.audience ?? null,
        parsed.data.guidelines ?? null,
        new Date().toISOString(),
      ],
    );
    logActivity(req.auth.workspaceId, req.auth.user.id, 'brand.created', parsed.data.name, '');
    res.status(201).json(brandRows(req.auth.workspaceId).find((b) => b.id === brandId));
  }),
);

coreRouter.patch(
  '/brands/:id',
  requireRole('admin'),
  handle((req: AuthedRequest, res) => {
    const existing = get('SELECT id FROM brands WHERE id = ? AND workspace_id = ?', [
      req.params.id,
      req.auth.workspaceId,
    ]);
    if (!existing) throw new HttpError(404, 'Brand not found');
    const parsed = z
      .object({
        name: z.string().min(1).max(80).optional(),
        industry: z.string().max(120).optional(),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        tone: z.string().max(160).optional(),
        audience: z.string().max(240).optional(),
        guidelines: z.string().max(600).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Invalid brand payload');
    const fields = parsed.data;
    run(
      `UPDATE brands SET name = COALESCE(?, name), industry = COALESCE(?, industry), color = COALESCE(?, color),
        accent = COALESCE(?, accent), tone = COALESCE(?, tone), audience = COALESCE(?, audience), guidelines = COALESCE(?, guidelines)
       WHERE id = ?`,
      [
        fields.name ?? null,
        fields.industry ?? null,
        fields.color ?? null,
        fields.accent ?? null,
        fields.tone ?? null,
        fields.audience ?? null,
        fields.guidelines ?? null,
        req.params.id,
      ],
    );
    logActivity(req.auth.workspaceId, req.auth.user.id, 'brand.updated', fields.name ?? req.params.id, '');
    res.json(brandRows(req.auth.workspaceId).find((b) => b.id === req.params.id));
  }),
);

coreRouter.delete(
  '/brands/:id',
  requireRole('admin'),
  handle((req: AuthedRequest, res) => {
    const existing = get<{ name: string }>('SELECT name FROM brands WHERE id = ? AND workspace_id = ?', [
      req.params.id,
      req.auth.workspaceId,
    ]);
    if (!existing) throw new HttpError(404, 'Brand not found');
    run('DELETE FROM brands WHERE id = ?', [req.params.id]);
    logActivity(req.auth.workspaceId, req.auth.user.id, 'brand.deleted', existing.name, '');
    res.json({ ok: true });
  }),
);

function connectionRows(workspaceId: string) {
  const rows = all(
    `SELECT c.*, b.name AS brand_name, b.color AS brand_color
     FROM connections c LEFT JOIN brands b ON b.id = c.brand_id
     WHERE c.workspace_id = ? ORDER BY c.platform`,
    [workspaceId],
  );
  const today = todayBkk();
  return rows.map((c: any) => {
    const meta = PLATFORMS.find((p) => p.key === c.platform);
    const expires = c.token_expires_at ? String(c.token_expires_at).slice(0, 10) : null;
    return {
      id: c.id,
      workspaceId: c.workspace_id,
      brandId: c.brand_id,
      brandName: c.brand_name,
      brandColor: c.brand_color,
      platform: c.platform,
      platformLabel: meta?.label ?? c.platform,
      platformColor: meta?.color ?? '#64748B',
      accountName: c.account_name,
      handle: c.handle,
      status: c.status === 'connected' && expires && expires <= addDays(today, 7) ? 'attention' : c.status,
      followers: c.followers,
      scopes: JSON.parse(c.scopes || '[]'),
      tokenExpiresAt: c.token_expires_at,
      daysToExpiry: expires ? Math.round((new Date(expires).getTime() - new Date(today).getTime()) / 86400000) : null,
      connectedAt: c.connected_at,
      lastSyncAt: c.last_sync_at,
      health: c.health,
    };
  });
}

coreRouter.get(
  '/connections',
  handle((req: AuthedRequest, res) => {
    res.json(connectionRows(req.auth.workspaceId));
  }),
);

coreRouter.post(
  '/connections',
  requireRole('admin'),
  handle((req: AuthedRequest, res) => {
    const parsed = z
      .object({
        platform: z.string().min(2).max(40),
        accountName: z.string().min(1).max(120),
        brandId: z.string().optional().nullable(),
        followers: z.number().int().min(0).max(100_000_000).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Invalid connection payload');
    const platform = PLATFORMS.find((p) => p.key === parsed.data.platform);
    if (!platform) throw new HttpError(400, 'Unknown platform');
    const existing = get('SELECT id FROM connections WHERE workspace_id = ? AND platform = ? AND account_name = ?', [
      req.auth.workspaceId,
      parsed.data.platform,
      parsed.data.accountName,
    ]);
    if (existing) throw new HttpError(409, 'This account is already connected');
    const connId = id('con');
    const now = new Date().toISOString();
    const isGoogle = platform.group === 'google';
    run(
      `INSERT INTO connections (id, workspace_id, brand_id, platform, account_name, handle, status, followers, scopes, token_expires_at, connected_at, last_sync_at, health, meta)
       VALUES (?, ?, ?, ?, ?, ?, 'connected', ?, ?, ?, ?, ?, ?, ?)`,
      [
        connId,
        req.auth.workspaceId,
        parsed.data.brandId ?? null,
        parsed.data.platform,
        parsed.data.accountName,
        `@${parsed.data.accountName.toLowerCase().replace(/[^a-z0-9.]+/g, '').slice(0, 24)}`,
        parsed.data.followers ?? (isGoogle ? 0 : 1200 + Math.floor(Math.random() * 18000)),
        JSON.stringify(isGoogle ? ['drive.file', 'readonly'] : ['read_insights', 'publish_content', 'manage_comments']),
        addDays(todayBkk(), 60),
        now,
        now,
        100,
        JSON.stringify({ syncWindow: '90d' }),
      ],
    );
    logActivity(req.auth.workspaceId, req.auth.user.id, 'connection.connected', `${platform.label} — ${parsed.data.accountName}`, '');
    res.status(201).json(connectionRows(req.auth.workspaceId).find((c) => c.id === connId));
  }),
);

coreRouter.post(
  '/connections/:id/sync',
  requireRole('editor'),
  handle((req: AuthedRequest, res) => {
    const conn = get<any>('SELECT * FROM connections WHERE id = ? AND workspace_id = ?', [
      req.params.id,
      req.auth.workspaceId,
    ]);
    if (!conn) throw new HttpError(404, 'Connection not found');
    const now = new Date().toISOString();
    run('UPDATE connections SET last_sync_at = ?, health = MIN(100, health + 3), status = ? WHERE id = ?', [
      now,
      conn.status === 'expired' ? 'expired' : 'connected',
      conn.id,
    ]);
    logActivity(req.auth.workspaceId, req.auth.user.id, 'connection.synced', conn.account_name, 'ซิงก์ข้อมูลสำเร็จ');
    res.json({ ok: true, lastSyncAt: now, account: conn.account_name });
  }),
);

coreRouter.delete(
  '/connections/:id',
  requireRole('admin'),
  handle((req: AuthedRequest, res) => {
    const conn = get<any>('SELECT * FROM connections WHERE id = ? AND workspace_id = ?', [
      req.params.id,
      req.auth.workspaceId,
    ]);
    if (!conn) throw new HttpError(404, 'Connection not found');
    run('DELETE FROM connections WHERE id = ?', [conn.id]);
    logActivity(req.auth.workspaceId, req.auth.user.id, 'connection.disconnected', conn.account_name, '');
    res.json({ ok: true });
  }),
);

coreRouter.post(
  '/bridge/sync',
  requireRole('admin'),
  handle((req: AuthedRequest, res) => {
    const bridge = req.body?.bridgeUrl ? String(req.body.bridgeUrl) : req.auth.workspace.bridgeUrl;
    if (!bridge) throw new HttpError(400, 'ยังไม่ได้ตั้งค่า Workspace Bridge');
    const counts = get<any>(
      `SELECT
        (SELECT COUNT(*) FROM posts WHERE workspace_id = ?) AS posts,
        (SELECT COUNT(*) FROM contacts WHERE workspace_id = ?) AS contacts,
        (SELECT COUNT(*) FROM campaigns WHERE workspace_id = ?) AS campaigns`,
      [req.auth.workspaceId, req.auth.workspaceId, req.auth.workspaceId],
    );
    const syncedAt = new Date().toISOString();
    run('UPDATE connections SET last_sync_at = ? WHERE workspace_id = ?', [syncedAt, req.auth.workspaceId]);
    logActivity(
      req.auth.workspaceId,
      req.auth.user.id,
      'bridge.synced',
      bridge,
      `ซิงก์ ${counts.posts} โพสต์ · ${counts.contacts} คอนแทค · ${counts.campaigns} แคมเปญ`,
    );
    res.json({
      ok: true,
      bridgeUrl: bridge,
      syncedAt,
      pushed: { posts: counts.posts, campaigns: counts.campaigns },
      pulled: { contacts: counts.contacts, orders: 42 },
      note: 'Beta: bridge sync is simulated end-to-end; connect a real endpoint in Settings.',
    });
  }),
);

coreRouter.get(
  '/notifications',
  handle((req: AuthedRequest, res) => {
    const ws = req.auth.workspaceId;
    const items: Array<{ id: string; kind: string; title: string; detail: string; at: string; href?: string }> = [];
    const today = todayBkk();
    const expiring = connectionRows(ws).filter((c) => c.status === 'attention');
    for (const c of expiring) {
      items.push({
        id: `conn-${c.id}`,
        kind: 'connection',
        title: `${c.platformLabel} ต้องตรวจสอบการเชื่อมต่อ`,
        detail: c.daysToExpiry !== null && c.daysToExpiry <= 7
          ? `โทเคนจะหมดอายุใน ${Math.max(c.daysToExpiry, 0)} วัน`
          : 'สุขภาพการเชื่อมต่อต่ำกว่าเกณฑ์',
        at: c.lastSyncAt ?? today,
        href: '/connections',
      });
    }
    const pending = all<any>(
      `SELECT id, title, status, scheduled_at FROM posts WHERE workspace_id = ? AND status IN ('review','approved') ORDER BY scheduled_at LIMIT 5`,
      [ws],
    );
    for (const p of pending) {
      items.push({
        id: `post-${p.id}`,
        kind: 'approval',
        title: p.status === 'review' ? 'คอนเทนต์รออนุมัติ' : 'คอนเทนต์พร้อมเผยแพร่',
        detail: p.title,
        at: p.scheduled_at ?? today,
        href: '/calendar',
      });
    }
    const budgets = all<any>(
      `SELECT id, name, budget, spend FROM campaigns WHERE workspace_id = ? AND status = 'active'`,
      [ws],
    );
    for (const c of budgets) {
      if (c.budget > 0 && c.spend / c.budget > 0.85) {
        items.push({
          id: `campaign-${c.id}`,
          kind: 'budget',
          title: 'งบโฆษณาใกล้เต็ม',
          detail: `${c.name} ใช้งบ ${Math.round((c.spend / c.budget) * 100)}%`,
          at: today,
          href: '/campaigns',
        });
      }
    }
    const invites = get<any>(
      `SELECT COUNT(*) AS n FROM invites WHERE workspace_id = ? AND status = 'pending'`,
      [ws],
    );
    if (invites?.n) {
      items.push({
        id: 'invites',
        kind: 'team',
        title: 'มีคำเชิญทีมที่ยังไม่ตอบรับ',
        detail: `${invites.n} คำเชิญ`,
        at: today,
        href: '/team',
      });
    }
    res.json(items);
  }),
);

coreRouter.get(
  '/meta',
  handle((_req, res) => {
    res.json({
      version: '0.1.0-beta.1',
      platforms: PLATFORMS,
      roles: [
        { key: 'owner', label: 'Owner', description: 'ทุกสิทธิ์ รวมถึงการลบ workspace' },
        { key: 'admin', label: 'Admin', description: 'จัดการการเชื่อมต่อ ทีม แบรนด์ และ API' },
        { key: 'editor', label: 'Editor', description: 'สร้างและแก้ไขคอนเทนต์ ส่งขออนุมัติ' },
        { key: 'analyst', label: 'Analyst', description: 'อ่านรายงานและส่งออกข้อมูล' },
      ],
      postStatuses: ['idea', 'draft', 'review', 'approved', 'scheduled', 'published', 'archived'],
      objectives: ['awareness', 'engagement', 'conversion', 'education', 'community'],
      artStyles: ['gradient-mesh', 'bold-type', 'editorial', 'product', 'tech-grid', 'festive'],
      limits: { postsPerPage: 100, apiRatePerMinute: 120 },
    });
  }),
);
