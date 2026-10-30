import { Router } from 'express';
import { z } from 'zod';
import { all, get, logActivity, run } from '../db.js';
import { hashPassword, signToken, verifyPassword } from '../auth.js';
import { attachAuth, handle, loadUser, secret, type AuthedRequest } from '../http.js';
import { HttpError } from '../util.js';

export const authRouter = Router();

function workspacesFor(userId: string) {
  return all(
    `SELECT w.id, w.name, w.slug, w.plan, w.industry, w.bridge_url, m.role
     FROM memberships m JOIN workspaces w ON w.id = m.workspace_id
     WHERE m.user_id = ?
     ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'editor' THEN 2 ELSE 3 END, m.rowid`,
    [userId],
  ).map((row: any) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    plan: row.plan,
    industry: row.industry,
    bridgeUrl: row.bridge_url,
    role: row.role,
  }));
}

authRouter.post(
  '/login',
  handle((req, res) => {
    const parsed = z
      .object({ email: z.string().email(), password: z.string().min(1) })
      .safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Email and password are required');
    const email = parsed.data.email.toLowerCase().trim();
    const user = get<any>('SELECT * FROM users WHERE lower(email) = ?', [email]);
    if (!user || !verifyPassword(parsed.data.password, user.password_hash)) {
      throw new HttpError(401, 'อีเมลหรือรหัสผ่านไม่ถูกต้อง / Invalid email or password');
    }
    const workspaces = workspacesFor(user.id);
    if (!workspaces.length) throw new HttpError(403, 'Account has no workspace');
    run('UPDATE users SET last_active_at = ? WHERE id = ?', [new Date().toISOString(), user.id]);
    const token = signToken({ sub: user.id, ws: workspaces[0].id }, secret());
    res.json({
      token,
      user: loadUser(user.id),
      workspaces,
      activeWorkspaceId: workspaces[0].id,
    });
  }),
);

authRouter.get(
  '/me',
  attachAuth,
  handle((req: AuthedRequest, res) => {
    res.json({
      user: req.auth.user,
      activeWorkspaceId: req.auth.workspaceId,
      role: req.auth.role,
      workspace: req.auth.workspace,
      workspaces: workspacesFor(req.auth.user.id),
    });
  }),
);

authRouter.patch(
  '/profile',
  attachAuth,
  handle((req: AuthedRequest, res) => {
    const parsed = z
      .object({
        name: z.string().min(1).max(80).optional(),
        title: z.string().max(120).optional(),
        locale: z.enum(['th', 'en']).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Invalid profile payload');
    const { name, title, locale } = parsed.data;
    run(
      `UPDATE users SET name = COALESCE(?, name), title = COALESCE(?, title), locale = COALESCE(?, locale) WHERE id = ?`,
      [name ?? null, title ?? null, locale ?? null, req.auth.user.id],
    );
    res.json({ user: loadUser(req.auth.user.id) });
  }),
);

authRouter.post(
  '/change-password',
  attachAuth,
  handle((req: AuthedRequest, res) => {
    const parsed = z
      .object({ currentPassword: z.string().min(1), newPassword: z.string().min(8) })
      .safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร');
    const row = get<any>('SELECT password_hash FROM users WHERE id = ?', [req.auth.user.id]);
    if (!row || !verifyPassword(parsed.data.currentPassword, row.password_hash)) {
      throw new HttpError(400, 'รหัสผ่านปัจจุบันไม่ถูกต้อง');
    }
    run('UPDATE users SET password_hash = ? WHERE id = ?', [hashPassword(parsed.data.newPassword), req.auth.user.id]);
    res.json({ ok: true });
  }),
);

const INVITE_TTL_DAYS = 14;

function inviteByToken(token: string) {
  return get<any>(
    `SELECT i.*, w.name AS workspace_name, w.slug AS workspace_slug, u.name AS invited_by_name
     FROM invites i
     JOIN workspaces w ON w.id = i.workspace_id
     LEFT JOIN users u ON u.id = i.invited_by
     WHERE i.token = ?`,
    [token],
  );
}

function expireIfStale(invite: any) {
  if (!invite || invite.status !== 'pending') return invite;
  const ageMs = Date.now() - new Date(invite.created_at).getTime();
  if (ageMs > INVITE_TTL_DAYS * 86_400_000) {
    run(`UPDATE invites SET status = 'expired' WHERE id = ?`, [invite.id]);
    return { ...invite, status: 'expired' };
  }
  return invite;
}

authRouter.get(
  '/invites/:token',
  handle((req, res) => {
    const invite = expireIfStale(inviteByToken(req.params.token));
    if (!invite) throw new HttpError(404, 'ไม่พบคำเชิญนี้ หรือลิงก์ไม่ถูกต้อง');
    res.json({
      email: invite.email,
      role: invite.role,
      status: invite.status,
      workspaceName: invite.workspace_name,
      workspaceSlug: invite.workspace_slug,
      invitedBy: invite.invited_by_name ?? null,
      createdAt: invite.created_at,
      expiresInDays: Math.max(
        0,
        INVITE_TTL_DAYS - Math.floor((Date.now() - new Date(invite.created_at).getTime()) / 86_400_000),
      ),
    });
  }),
);

authRouter.post(
  '/invites/:token/accept',
  attachAuth,
  handle((req: AuthedRequest, res) => {
    const invite = expireIfStale(inviteByToken(req.params.token));
    if (!invite) throw new HttpError(404, 'ไม่พบคำเชิญนี้ หรือลิงก์ไม่ถูกต้อง');
    if (invite.status === 'accepted') throw new HttpError(409, 'คำเชิญนี้ถูกใช้ไปแล้ว');
    if (invite.status !== 'pending') throw new HttpError(410, 'คำเชิญนี้หมดอายุหรือถูกเพิกถอนแล้ว');
    if (invite.email.toLowerCase() !== req.auth.user.email.toLowerCase()) {
      throw new HttpError(403, `คำเชิญนี้สำหรับ ${invite.email} กรุณาเข้าสู่ระบบด้วยอีเมลนั้น`);
    }
    const existing = get<any>('SELECT role FROM memberships WHERE workspace_id = ? AND user_id = ?', [
      invite.workspace_id,
      req.auth.user.id,
    ]);
    if (existing) {
      run('UPDATE memberships SET role = ? WHERE workspace_id = ? AND user_id = ?', [
        invite.role,
        invite.workspace_id,
        req.auth.user.id,
      ]);
    } else {
      run('INSERT INTO memberships (workspace_id, user_id, role) VALUES (?, ?, ?)', [
        invite.workspace_id,
        req.auth.user.id,
        invite.role,
      ]);
    }
    run(`UPDATE invites SET status = 'accepted' WHERE id = ?`, [invite.id]);
    logActivity(invite.workspace_id, req.auth.user.id, 'member.joined', req.auth.user.name, `บทบาท ${invite.role}`);
    res.json({
      ok: true,
      workspace: {
        id: invite.workspace_id,
        name: invite.workspace_name,
        slug: invite.workspace_slug,
        role: invite.role,
      },
    });
  }),
);

authRouter.post(
  '/logout',
  attachAuth,
  handle((_req, res) => {
    res.json({ ok: true });
  }),
);
