import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');
export const DATA_DIR = process.env.SOCIALMK_DATA_DIR
  ? path.resolve(process.env.SOCIALMK_DATA_DIR)
  : path.join(ROOT, 'data');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'assets'), { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'socialmk.db'));
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA busy_timeout = 5000');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'editor',
  title TEXT,
  avatar_color TEXT,
  locale TEXT NOT NULL DEFAULT 'th',
  last_active_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'beta',
  industry TEXT,
  timezone TEXT NOT NULL DEFAULT 'Asia/Bangkok',
  bridge_url TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memberships (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS brands (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  industry TEXT,
  color TEXT NOT NULL,
  accent TEXT,
  tone TEXT,
  audience TEXT,
  guidelines TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS connections (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  brand_id TEXT REFERENCES brands(id) ON DELETE SET NULL,
  platform TEXT NOT NULL,
  account_name TEXT,
  handle TEXT,
  status TEXT NOT NULL,
  followers INTEGER NOT NULL DEFAULT 0,
  scopes TEXT,
  token_expires_at TEXT,
  connected_at TEXT,
  last_sync_at TEXT,
  health INTEGER NOT NULL DEFAULT 100,
  meta TEXT
);

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  brand_id TEXT REFERENCES brands(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  hashtags TEXT NOT NULL DEFAULT '[]',
  platforms TEXT NOT NULL DEFAULT '[]',
  media TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft',
  content_type TEXT NOT NULL DEFAULT 'image',
  pillar TEXT,
  scheduled_at TEXT,
  published_at TEXT,
  owner_id TEXT,
  campaign_id TEXT,
  ai_generated INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  metrics TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  brand_id TEXT REFERENCES brands(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  objective TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  budget REAL NOT NULL DEFAULT 0,
  spend REAL NOT NULL DEFAULT 0,
  start_date TEXT,
  end_date TEXT,
  platforms TEXT NOT NULL DEFAULT '[]',
  results TEXT NOT NULL DEFAULT '{}',
  boost_post_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS metrics (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  brand_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  date TEXT NOT NULL,
  impressions INTEGER NOT NULL DEFAULT 0,
  reach INTEGER NOT NULL DEFAULT 0,
  engagements INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  followers INTEGER NOT NULL DEFAULT 0,
  spend REAL NOT NULL DEFAULT 0,
  conversions INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_metrics_key ON metrics(workspace_id, brand_id, platform, date);
CREATE INDEX IF NOT EXISTS idx_metrics_date ON metrics(date);

CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'prospect',
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  platform TEXT,
  handle TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  source TEXT,
  ltv REAL NOT NULL DEFAULT 0,
  consent TEXT NOT NULL DEFAULT 'granted',
  sentiment TEXT NOT NULL DEFAULT 'neutral',
  score INTEGER NOT NULL DEFAULT 50,
  last_interaction_at TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invites (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  token TEXT NOT NULL,
  invited_by TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  scopes TEXT NOT NULL DEFAULT '[]',
  created_by TEXT,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT,
  request_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS webhooks (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  url TEXT NOT NULL,
  events TEXT NOT NULL DEFAULT '[]',
  secret TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  last_delivery_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS api_logs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  key_id TEXT,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status INTEGER NOT NULL,
  latency_ms INTEGER NOT NULL,
  at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activity (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT,
  action TEXT NOT NULL,
  target TEXT,
  detail TEXT,
  at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  brand_id TEXT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'ai',
  url TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  prompt TEXT,
  source TEXT,
  created_at TEXT NOT NULL
);
`;

db.exec(SCHEMA);

export type Row = Record<string, any>;

/** node:sqlite only accepts null/number/string/bigint/Buffer bindings. */
function normalize(params: unknown[]): Array<string | number | bigint | null | Uint8Array> {
  return params.map((value) => {
    if (value === undefined) return null;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (value === null) return null;
    if (typeof value === 'number' || typeof value === 'string' || typeof value === 'bigint') return value;
    if (value instanceof Uint8Array) return value;
    return String(value);
  });
}

export function all<T = Row>(sql: string, params: unknown[] = []): T[] {
  return db.prepare(sql).all(...normalize(params)) as T[];
}

export function get<T = Row>(sql: string, params: unknown[] = []): T | undefined {
  return db.prepare(sql).get(...normalize(params)) as T | undefined;
}

export function run(sql: string, params: unknown[] = []) {
  return db.prepare(sql).run(...normalize(params));
}

export function prepare(sql: string) {
  const statement = db.prepare(sql);
  return {
    run: (...params: unknown[]) => statement.run(...normalize(params)),
    get: (...params: unknown[]) => statement.get(...normalize(params)),
    all: (...params: unknown[]) => statement.all(...normalize(params)),
  };
}

export function transaction<T>(fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function logActivity(
  workspaceId: string,
  userId: string | null,
  action: string,
  target: string,
  detail = '',
) {
  run(
    `INSERT INTO activity (id, workspace_id, user_id, action, target, detail, at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id('act'), workspaceId, userId, action, target, detail, new Date().toISOString()],
  );
}

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
export function id(prefix: string): string {
  const bytes = new Uint8Array(10);
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % 36];
  return `${prefix}_${out}`;
}

export function json<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
