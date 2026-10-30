import { Router } from 'express';
import { z } from 'zod';
import { all, get, id, logActivity, run } from '../db.js';
import { hashApiKey, randomToken } from '../auth.js';
import { handle, requireRole, type AuthedRequest } from '../http.js';
import { HttpError } from '../util.js';

export const adminRouter = Router();

adminRouter.get(
  '/team',
  handle((req: AuthedRequest, res) => {
    const members = all<any>(
      `SELECT u.id, u.name, u.email, u.title, u.avatar_color, u.last_active_at, u.created_at, m.role
       FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.workspace_id = ?
       ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'editor' THEN 2 ELSE 3 END, u.name`,
      [req.auth.workspaceId],
    );
    const invites = all<any>(
      `SELECT i.*, u.name AS inviter FROM invites i LEFT JOIN users u ON u.id = i.invited_by
       WHERE i.workspace_id = ? ORDER BY i.created_at DESC`,
      [req.auth.workspaceId],
    );
    res.json({
      members: members.map((m) => ({
        id: m.id,
        name: m.name,
        email: m.email,
        title: m.title,
        avatarColor: m.avatar_color,
        role: m.role,
        lastActiveAt: m.last_active_at,
        joinedAt: m.created_at,
      })),
      invites: invites.map((i) => ({
        id: i.id,
        email: i.email,
        role: i.role,
        status: i.status,
        invitedBy: i.inviter,
        createdAt: i.created_at,
        inviteUrl: `/invite/${i.token}`,
      })),
    });
  }),
);

adminRouter.patch(
  '/team/:userId',
  requireRole('admin'),
  handle((req: AuthedRequest, res) => {
    const parsed = z.object({ role: z.enum(['owner', 'admin', 'editor', 'analyst']) }).safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Invalid role');
    const member = get<any>(
      `SELECT m.*, u.name FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.workspace_id = ? AND m.user_id = ?`,
      [req.auth.workspaceId, req.params.userId],
    );
    if (!member) throw new HttpError(404, 'Member not found');
    if (member.role === 'owner' && req.auth.role !== 'owner') {
      throw new HttpError(403, 'เฉพาะ Owner เท่านั้นที่เปลี่ยนสิทธิ์ Owner ได้');
    }
    if (parsed.data.role === 'owner' && req.auth.role !== 'owner') {
      throw new HttpError(403, 'เฉพาะ Owner เท่านั้นที่แต่งตั้ง Owner ได้');
    }
    run('UPDATE memberships SET role = ? WHERE workspace_id = ? AND user_id = ?', [
      parsed.data.role,
      req.auth.workspaceId,
      req.params.userId,
    ]);
    logActivity(req.auth.workspaceId, req.auth.user.id, 'member.role_changed', member.name, `เป็น ${parsed.data.role}`);
    res.json({ ok: true });
  }),
);

adminRouter.delete(
  '/team/:userId',
  requireRole('admin'),
  handle((req: AuthedRequest, res) => {
    const member = get<any>(
      `SELECT m.role, u.name FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.workspace_id = ? AND m.user_id = ?`,
      [req.auth.workspaceId, req.params.userId],
    );
    if (!member) throw new HttpError(404, 'Member not found');
    if (member.role === 'owner' && req.auth.role !== 'owner') throw new HttpError(403, 'ไม่สามารถลบ Owner ได้');
    if (req.params.userId === req.auth.user.id) throw new HttpError(400, 'ไม่สามารถลบตัวเองออกจาก workspace ได้');
    run('DELETE FROM memberships WHERE workspace_id = ? AND user_id = ?', [req.auth.workspaceId, req.params.userId]);
    logActivity(req.auth.workspaceId, req.auth.user.id, 'member.removed', member.name, '');
    res.json({ ok: true });
  }),
);

adminRouter.post(
  '/team/invites',
  requireRole('admin'),
  handle((req: AuthedRequest, res) => {
    const parsed = z
      .object({ email: z.string().email(), role: z.enum(['admin', 'editor', 'analyst']).default('editor') })
      .safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'อีเมลไม่ถูกต้อง');
    const existing = get('SELECT id FROM invites WHERE workspace_id = ? AND email = ? AND status = ?', [
      req.auth.workspaceId,
      parsed.data.email,
      'pending',
    ]);
    if (existing) throw new HttpError(409, 'มีคำเชิญที่ยังไม่ตอบรับสำหรับอีเมลนี้แล้ว');
    const token = randomToken(16);
    const inviteId = id('inv');
    run(
      `INSERT INTO invites (id, workspace_id, email, role, status, token, invited_by, created_at)
       VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)`,
      [inviteId, req.auth.workspaceId, parsed.data.email, parsed.data.role, token, req.auth.user.id, new Date().toISOString()],
    );
    logActivity(req.auth.workspaceId, req.auth.user.id, 'member.invited', parsed.data.email, `บทบาท ${parsed.data.role}`);
    res.status(201).json({
      id: inviteId,
      email: parsed.data.email,
      role: parsed.data.role,
      status: 'pending',
      inviteUrl: `/invite/${token}`,
      emailSent: true,
    });
  }),
);

adminRouter.post(
  '/team/invites/:id/resend',
  requireRole('admin'),
  handle((req: AuthedRequest, res) => {
    const invite = get<any>('SELECT * FROM invites WHERE id = ? AND workspace_id = ?', [
      req.params.id,
      req.auth.workspaceId,
    ]);
    if (!invite) throw new HttpError(404, 'Invite not found');
    run(`UPDATE invites SET status = 'pending', created_at = ? WHERE id = ?`, [new Date().toISOString(), invite.id]);
    logActivity(req.auth.workspaceId, req.auth.user.id, 'invite.resent', invite.email, '');
    res.json({ ok: true, inviteUrl: `/invite/${invite.token}` });
  }),
);

adminRouter.delete(
  '/team/invites/:id',
  requireRole('admin'),
  handle((req: AuthedRequest, res) => {
    const invite = get<any>('SELECT * FROM invites WHERE id = ? AND workspace_id = ?', [
      req.params.id,
      req.auth.workspaceId,
    ]);
    if (!invite) throw new HttpError(404, 'Invite not found');
    run('DELETE FROM invites WHERE id = ?', [invite.id]);
    logActivity(req.auth.workspaceId, req.auth.user.id, 'invite.revoked', invite.email, '');
    res.json({ ok: true });
  }),
);

/* --------------------------- API keys --------------------------- */

adminRouter.get(
  '/api-keys',
  handle((req: AuthedRequest, res) => {
    const rows = all<any>(
      `SELECT k.*, u.name AS creator FROM api_keys k LEFT JOIN users u ON u.id = k.created_by
       WHERE k.workspace_id = ? ORDER BY k.created_at DESC`,
      [req.auth.workspaceId],
    );
    res.json(
      rows.map((k) => ({
        id: k.id,
        name: k.name,
        prefix: k.prefix,
        scopes: JSON.parse(k.scopes || '[]'),
        createdBy: k.creator,
        createdAt: k.created_at,
        lastUsedAt: k.last_used_at,
        revokedAt: k.revoked_at,
        requestCount: k.request_count,
      })),
    );
  }),
);

adminRouter.post(
  '/api-keys',
  requireRole('admin'),
  handle((req: AuthedRequest, res) => {
    const parsed = z
      .object({
        name: z.string().min(1).max(80),
        scopes: z.array(z.enum(['posts:read', 'posts:write', 'analytics:read', 'contacts:read', 'campaigns:read'])).min(1),
      })
      .safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'ข้อมูลคีย์ไม่ครบ');
    const raw = `smk_live_${randomToken(20).replace(/[^a-zA-Z0-9]/g, '').slice(0, 32)}`;
    const keyId = id('key');
    run(
      `INSERT INTO api_keys (id, workspace_id, name, prefix, key_hash, scopes, created_by, created_at, last_used_at, revoked_at, request_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 0)`,
      [
        keyId,
        req.auth.workspaceId,
        parsed.data.name,
        raw.slice(0, 16),
        hashApiKey(raw),
        JSON.stringify(parsed.data.scopes),
        req.auth.user.id,
        new Date().toISOString(),
      ],
    );
    logActivity(req.auth.workspaceId, req.auth.user.id, 'apikey.created', parsed.data.name, parsed.data.scopes.join(', '));
    res.status(201).json({
      id: keyId,
      name: parsed.data.name,
      key: raw,
      prefix: raw.slice(0, 16),
      scopes: parsed.data.scopes,
      note: 'คัดลอกคีย์นี้ทันที — ระบบจะแสดงเพียงครั้งเดียว',
    });
  }),
);

adminRouter.delete(
  '/api-keys/:id',
  requireRole('admin'),
  handle((req: AuthedRequest, res) => {
    const key = get<any>('SELECT * FROM api_keys WHERE id = ? AND workspace_id = ?', [
      req.params.id,
      req.auth.workspaceId,
    ]);
    if (!key) throw new HttpError(404, 'Key not found');
    run('UPDATE api_keys SET revoked_at = ? WHERE id = ?', [new Date().toISOString(), key.id]);
    logActivity(req.auth.workspaceId, req.auth.user.id, 'apikey.revoked', key.name, '');
    res.json({ ok: true });
  }),
);

adminRouter.get(
  '/api-logs',
  handle((req: AuthedRequest, res) => {
    const rows = all<any>(
      `SELECT * FROM api_logs WHERE workspace_id = ? ORDER BY at DESC LIMIT 80`,
      [req.auth.workspaceId],
    );
    res.json(
      rows.map((l) => ({
        id: l.id,
        method: l.method,
        path: l.path,
        status: l.status,
        latencyMs: l.latency_ms,
        at: l.at,
      })),
    );
  }),
);

/* --------------------------- webhooks --------------------------- */

adminRouter.get(
  '/webhooks',
  handle((req: AuthedRequest, res) => {
    const rows = all<any>('SELECT * FROM webhooks WHERE workspace_id = ? ORDER BY created_at DESC', [
      req.auth.workspaceId,
    ]);
    res.json(
      rows.map((w) => ({
        id: w.id,
        url: w.url,
        events: JSON.parse(w.events || '[]'),
        active: Boolean(w.active),
        secretPreview: `${String(w.secret).slice(0, 6)}••••`,
        lastDeliveryAt: w.last_delivery_at,
        createdAt: w.created_at,
      })),
    );
  }),
);

adminRouter.post(
  '/webhooks',
  requireRole('admin'),
  handle((req: AuthedRequest, res) => {
    const parsed = z
      .object({
        url: z.string().url(),
        events: z.array(z.string()).min(1),
      })
      .safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'URL หรือเหตุการณ์ไม่ถูกต้อง');
    const webhookId = id('whk');
    run(
      `INSERT INTO webhooks (id, workspace_id, url, events, secret, active, last_delivery_at, created_at)
       VALUES (?, ?, ?, ?, ?, 1, NULL, ?)`,
      [
        webhookId,
        req.auth.workspaceId,
        parsed.data.url,
        JSON.stringify(parsed.data.events),
        randomToken(16),
        new Date().toISOString(),
      ],
    );
    logActivity(req.auth.workspaceId, req.auth.user.id, 'webhook.created', parsed.data.url, '');
    res.status(201).json({ id: webhookId, ok: true });
  }),
);

adminRouter.patch(
  '/webhooks/:id',
  requireRole('admin'),
  handle((req: AuthedRequest, res) => {
    const parsed = z.object({ active: z.boolean() }).safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Invalid payload');
    run('UPDATE webhooks SET active = ? WHERE id = ? AND workspace_id = ?', [
      parsed.data.active ? 1 : 0,
      req.params.id,
      req.auth.workspaceId,
    ]);
    res.json({ ok: true });
  }),
);

adminRouter.delete(
  '/webhooks/:id',
  requireRole('admin'),
  handle((req: AuthedRequest, res) => {
    run('DELETE FROM webhooks WHERE id = ? AND workspace_id = ?', [req.params.id, req.auth.workspaceId]);
    res.json({ ok: true });
  }),
);

adminRouter.post(
  '/webhooks/:id/test',
  requireRole('admin'),
  handle((req: AuthedRequest, res) => {
    const webhook = get<any>('SELECT * FROM webhooks WHERE id = ? AND workspace_id = ?', [
      req.params.id,
      req.auth.workspaceId,
    ]);
    if (!webhook) throw new HttpError(404, 'Webhook not found');
    run('UPDATE webhooks SET last_delivery_at = ? WHERE id = ?', [new Date().toISOString(), webhook.id]);
    res.json({
      ok: true,
      delivered: false,
      note: 'Beta sandbox: ไม่มีการส่ง HTTP ออกจริง — ตรวจสอบ signature และ retry policy ในเอกสาร',
      sample: {
        event: JSON.parse(webhook.events || '[]')[0],
        workspace: req.auth.workspace.name,
        at: new Date().toISOString(),
      },
    });
  }),
);

adminRouter.get(
  '/changelog',
  handle((_req, res) => {
    res.json({
      current: '0.1.0-beta.1',
      releasedAt: '2026-10-30',
      channel: 'beta',
      entries: [
        {
          version: '0.1.0-beta.1',
          date: '2026-10-30',
          highlights: [
            'ศูนย์บัญชาการโซเชียลครบวงจร: ปฏิทินคอนเทนต์, AI Studio, แคมเปญ, รายงาน',
            'รองรับ 9 ช่องทางเชื่อมต่อ + Workspace Bridge (mng.uarea.in)',
            'Public API พร้อมคีย์, ขอบเขตสิทธิ์ และบันทึกการเรียกใช้งาน',
            'ระบบทีม 4 บทบาท พร้อมประวัติกิจกรรม',
          ],
        },
      ],
      roadmap: [
        { version: '0.2.0-beta', eta: '2026-Q1', items: ['ตั้งเวลาโพสต์จริงผ่าน Graph API', 'Unified inbox (คอมเมนต์ + DM)', 'แดชบอร์ดเปรียบเทียบคู่แข่ง'] },
        { version: '0.3.0-beta', eta: '2026-Q2', items: ['Auto-boost ด้วยกฎอัตโนมัติ', 'AI ปรับภาพตามแบรนด์ไกด์ไลน์', 'รายงานส่งอัตโนมัติทางอีเมล/LINE'] },
        { version: '1.0.0', eta: '2026-Q3', items: ['SSO & SCIM', 'Audit log ครบถ้วน', 'SLA และการรับรอง ISO 27001'] },
      ],
    });
  }),
);

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'SocialMK Public API',
    version: '0.1.0-beta.1',
    description: 'ดึงข้อมูลคอนเทนต์ แคมเปญ ผู้ติดต่อ และรายงานสรุปจาก SocialMK',
  },
  servers: [{ url: '/api/v1' }],
  security: [{ ApiKeyAuth: [] }],
  components: {
    securitySchemes: {
      ApiKeyAuth: { type: 'apiKey', in: 'header', name: 'x-api-key' },
    },
  },
  paths: {
    '/posts': { get: { summary: 'List posts', parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer' } }] } },
    '/analytics/summary': { get: { summary: 'Workspace performance summary', parameters: [{ name: 'days', in: 'query', schema: { type: 'integer', default: 30 } }] } },
    '/contacts': { get: { summary: 'List contacts (consent-aware)' } },
    '/campaigns': { get: { summary: 'List campaigns with pacing' } },
    '/brands': { get: { summary: 'List brands in the workspace' } },
  },
};
