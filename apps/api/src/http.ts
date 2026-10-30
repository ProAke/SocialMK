import type { NextFunction, Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, all, get, json } from './db.js';
import { ROLE_RANK, verifyToken } from './auth.js';
import { HttpError } from './util.js';

export interface AuthContext {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    title: string | null;
    avatarColor: string | null;
    locale: string;
  };
  workspace: { id: string; name: string; slug: string; plan: string; bridgeUrl: string | null; timezone: string };
  workspaceId: string;
  role: string;
}

export type AuthedRequest = Request & { auth: AuthContext };

let SECRET = '';
export function secret(): string {
  if (SECRET) return SECRET;
  if (process.env.SOCIALMK_JWT_SECRET) {
    SECRET = process.env.SOCIALMK_JWT_SECRET;
    return SECRET;
  }
  const file = path.join(DATA_DIR, 'secret.key');
  if (fs.existsSync(file)) {
    SECRET = fs.readFileSync(file, 'utf8').trim();
  } else {
    SECRET = Buffer.from(crypto.getRandomValues(new Uint8Array(48))).toString('base64url');
    fs.writeFileSync(file, SECRET, { mode: 0o600 });
  }
  return SECRET;
}

function bearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7);
}

export function loadUser(userId: string) {
  const row = get<{
    id: string;
    name: string;
    email: string;
    role: string;
    title: string | null;
    avatar_color: string | null;
    locale: string;
  }>('SELECT id, name, email, role, title, avatar_color, locale FROM users WHERE id = ?', [userId]);
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    title: row.title,
    avatarColor: row.avatar_color,
    locale: row.locale,
  };
}

export function attachAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = bearer(req);
    if (!token) throw new HttpError(401, 'Missing bearer token');
    const payload = verifyToken(token, secret());
    if (!payload?.sub) throw new HttpError(401, 'Invalid or expired token');
    const user = loadUser(String(payload.sub));
    if (!user) throw new HttpError(401, 'User no longer exists');

    const requested = (req.headers['x-workspace-id'] as string) || String(payload.ws ?? '');
    const memberships = all<{ workspace_id: string; role: string }>(
      'SELECT workspace_id, role FROM memberships WHERE user_id = ?',
      [user.id],
    );
    if (!memberships.length) throw new HttpError(403, 'No workspace access');
    const target = memberships.find((m) => m.workspace_id === requested) ?? memberships[0];
    const ws = get<{
      id: string;
      name: string;
      slug: string;
      plan: string;
      bridge_url: string | null;
      timezone: string;
    }>('SELECT id, name, slug, plan, bridge_url, timezone FROM workspaces WHERE id = ?', [target.workspace_id]);
    if (!ws) throw new HttpError(404, 'Workspace not found');

    (req as AuthedRequest).auth = {
      user,
      workspace: {
        id: ws.id,
        name: ws.name,
        slug: ws.slug,
        plan: ws.plan,
        bridgeUrl: ws.bridge_url,
        timezone: ws.timezone,
      },
      workspaceId: ws.id,
      role: target.role,
    };
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(minimum: keyof typeof ROLE_RANK) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const role = (req as AuthedRequest).auth?.role;
    if (!role || (ROLE_RANK[role] ?? 0) < ROLE_RANK[minimum]) {
      next(new HttpError(403, 'You do not have permission for this action'));
      return;
    }
    next();
  };
}

type Handler = (req: AuthedRequest, res: Response) => unknown;

export function handle(fn: Handler) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = fn(req as AuthedRequest, res);
      if (result instanceof Promise) result.catch(next);
    } catch (error) {
      next(error);
    }
  };
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (res.headersSent) return;
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message, code: error.code });
    return;
  }
  console.error(error);
  res.status(500).json({ error: 'Internal server error' });
}

export function enrichPost(row: Record<string, any>) {
  return {
    ...row,
    hashtags: json<string[]>(row.hashtags, []),
    platforms: json<string[]>(row.platforms, []),
    media: json<Array<Record<string, unknown>>>(row.media, []),
    metrics: json<Record<string, number>>(row.metrics, {}),
    aiGenerated: Boolean(row.ai_generated),
    brandId: row.brand_id ?? null,
    campaignId: row.campaign_id ?? null,
    ownerId: row.owner_id ?? null,
    scheduledAt: row.scheduled_at,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    contentType: row.content_type,
    brandName: row.brand_name ?? null,
    brandColor: row.brand_color ?? null,
    ownerName: row.owner_name ?? null,
    ownerColor: row.owner_color ?? null,
    campaignName: row.campaign_name ?? null,
  };
}

export function parseJsonField<T>(value: unknown, fallback: T): T {
  return json<T>(typeof value === 'string' ? value : null, fallback);
}
