import { Router, type NextFunction, type Request, type Response } from 'express';
import { all, get, id, run } from '../db.js';
import { hashApiKey } from '../auth.js';
import { computeSummary } from '../analytics.js';
import { openApiSpec } from './admin.js';

export const publicRouter = Router();

interface KeyContext {
  workspaceId: string;
  scopes: string[];
  keyId: string;
  startedAt: number;
}

type KeyedRequest = Request & { apiKey?: KeyContext };

function record(req: KeyedRequest, res: Response) {
  const ctx = req.apiKey;
  if (!ctx) return;
  const latency = Date.now() - ctx.startedAt;
  run(
    `INSERT INTO api_logs (id, workspace_id, key_id, method, path, status, latency_ms, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id('log'), ctx.workspaceId, ctx.keyId, req.method, req.path, res.statusCode, latency, new Date().toISOString()],
  );
  run('UPDATE api_keys SET last_used_at = ?, request_count = request_count + 1 WHERE id = ?', [
    new Date().toISOString(),
    ctx.keyId,
  ]);
}

/* Fixed-window rate limiting per API key (per process). */
const RATE_LIMIT = 120;
const RATE_WINDOW_MS = 60_000;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function applyRateLimit(keyId: string, res: Response): boolean {
  const now = Date.now();
  let bucket = rateBuckets.get(keyId);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + RATE_WINDOW_MS };
    rateBuckets.set(keyId, bucket);
  }
  bucket.count += 1;
  const resetIn = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  res.setHeader('RateLimit-Limit', String(RATE_LIMIT));
  res.setHeader('RateLimit-Remaining', String(Math.max(0, RATE_LIMIT - bucket.count)));
  res.setHeader('RateLimit-Reset', String(resetIn));
  if (bucket.count > RATE_LIMIT) {
    res.setHeader('Retry-After', String(resetIn));
    return false;
  }
  return true;
}

function authenticate(req: KeyedRequest, res: Response, next: NextFunction) {
  const raw = req.headers['x-api-key'];
  if (!raw || typeof raw !== 'string') {
    res.status(401).json({ error: 'Missing x-api-key header' });
    return;
  }
  const key = get<any>('SELECT * FROM api_keys WHERE key_hash = ?', [hashApiKey(raw)]);
  if (!key || key.revoked_at) {
    res.status(401).json({ error: 'Invalid or revoked API key' });
    return;
  }
  req.apiKey = {
    workspaceId: key.workspace_id,
    scopes: JSON.parse(key.scopes || '[]'),
    keyId: key.id,
    startedAt: Date.now(),
  };
  res.on('finish', () => record(req, res));

  if (rateBuckets.size > 5000) {
    const now = Date.now();
    for (const [bucketKey, bucket] of rateBuckets) {
      if (bucket.resetAt <= now) rateBuckets.delete(bucketKey);
    }
  }
  if (!applyRateLimit(key.id, res)) {
    res.status(429).json({ error: 'Rate limit exceeded', limit: RATE_LIMIT, window: '60s' });
    return;
  }
  next();
}

function requireScope(scope: string) {
  return (req: KeyedRequest, res: Response, next: NextFunction) => {
    if (!req.apiKey?.scopes.includes(scope)) {
      res.status(403).json({ error: `Key is missing scope: ${scope}` });
      return;
    }
    next();
  };
}

publicRouter.get('/openapi.json', (_req, res) => {
  res.json(openApiSpec);
});

publicRouter.use(authenticate);

publicRouter.get('/brands', requireScope('posts:read'), (req: KeyedRequest, res) => {
  const rows = all<any>('SELECT id, name, industry, color FROM brands WHERE workspace_id = ?', [req.apiKey!.workspaceId]);
  res.json({ data: rows, meta: { count: rows.length } });
});

publicRouter.get('/posts', requireScope('posts:read'), (req: KeyedRequest, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const rows = all<any>(
    `SELECT p.id, p.title, p.body, p.status, p.platforms, p.hashtags, p.scheduled_at, p.published_at, b.name AS brand
     FROM posts p LEFT JOIN brands b ON b.id = p.brand_id
     WHERE p.workspace_id = ? ORDER BY COALESCE(p.scheduled_at, p.created_at) DESC LIMIT ?`,
    [req.apiKey!.workspaceId, limit],
  );
  res.json({
    data: rows.map((r) => ({
      id: r.id,
      brand: r.brand,
      title: r.title,
      body: r.body,
      status: r.status,
      platforms: JSON.parse(r.platforms || '[]'),
      hashtags: JSON.parse(r.hashtags || '[]'),
      scheduledAt: r.scheduled_at,
      publishedAt: r.published_at,
    })),
    meta: { count: rows.length, limit },
  });
});

publicRouter.get('/analytics/summary', requireScope('analytics:read'), (req: KeyedRequest, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 120);
  const brandId = typeof req.query.brandId === 'string' ? req.query.brandId : null;
  const summary = computeSummary({ workspaceId: req.apiKey!.workspaceId, days, brandId });
  res.json({
    data: {
      range: summary.range,
      totals: summary.totals,
      deltas: summary.deltas,
      platforms: summary.platforms,
      series: summary.series,
    },
    meta: { generatedAt: new Date().toISOString(), brand: brandId },
  });
});

publicRouter.get('/contacts', requireScope('contacts:read'), (req: KeyedRequest, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const includeRevoked = req.query.includeRevoked === 'true';
  const rows = all<any>(
    `SELECT id, type, name, email, platform, source, consent, sentiment, score, ltv, last_interaction_at
     FROM contacts WHERE workspace_id = ? ${includeRevoked ? '' : "AND consent = 'granted'"}
     ORDER BY score DESC LIMIT ?`,
    [req.apiKey!.workspaceId, limit],
  );
  res.json({
    data: rows.map((r) => ({
      id: r.id,
      type: r.type,
      name: r.name,
      email: r.email,
      platform: r.platform,
      source: r.source,
      consent: r.consent,
      sentiment: r.sentiment,
      score: r.score,
      ltv: r.ltv,
      lastInteractionAt: r.last_interaction_at,
    })),
    meta: { count: rows.length, consentFilter: includeRevoked ? 'all' : 'granted-only' },
  });
});

publicRouter.get('/campaigns', requireScope('campaigns:read'), (req: KeyedRequest, res) => {
  const rows = all<any>(
    `SELECT c.id, c.name, c.objective, c.status, c.budget, c.spend, c.start_date, c.end_date, c.platforms, c.results, b.name AS brand
     FROM campaigns c LEFT JOIN brands b ON b.id = c.brand_id WHERE c.workspace_id = ? ORDER BY c.created_at DESC`,
    [req.apiKey!.workspaceId],
  );
  res.json({
    data: rows.map((r) => ({
      id: r.id,
      name: r.name,
      brand: r.brand,
      objective: r.objective,
      status: r.status,
      budget: r.budget,
      spend: r.spend,
      startDate: r.start_date,
      endDate: r.end_date,
      platforms: JSON.parse(r.platforms || '[]'),
      results: JSON.parse(r.results || '{}'),
    })),
    meta: { count: rows.length },
  });
});
