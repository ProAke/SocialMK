const TOKEN_KEY = 'socialmk.token';
const WS_KEY = 'socialmk.workspace';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getWorkspaceId(): string | null {
  return localStorage.getItem(WS_KEY);
}

export function setWorkspaceId(id: string | null) {
  if (id) localStorage.setItem(WS_KEY, id);
  else localStorage.removeItem(WS_KEY);
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined | null>;
  raw?: boolean;
}

function buildUrl(path: string, params?: RequestOptions['params']): string {
  const url = new URL(path, window.location.origin);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    }
  }
  return `${url.pathname}${url.search}`;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const workspaceId = getWorkspaceId();
  if (workspaceId) headers['x-workspace-id'] = workspaceId;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(buildUrl(`/api${path}`, options.params), {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (response.status === 401 && !path.startsWith('/auth/login')) {
    window.dispatchEvent(new CustomEvent('socialmk:unauthorized'));
  }

  if (options.raw) {
    return (await response.text()) as unknown as T;
  }

  const text = await response.text();
  let payload: any = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { error: text };
    }
  }
  if (!response.ok) {
    throw new ApiError(response.status, payload?.error ?? `Request failed (${response.status})`);
  }
  return payload as T;
}

export const api = {
  get: <T>(path: string, params?: RequestOptions['params']) => request<T>(path, { params }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  text: (path: string, params?: RequestOptions['params']) => request<string>(path, { params, raw: true }),
};

export async function downloadFile(path: string, params?: RequestOptions['params']) {
  const token = getToken();
  const workspaceId = getWorkspaceId();
  const response = await fetch(buildUrl(`/api${path}`, params), {
    headers: {
      Authorization: token ? `Bearer ${token}` : '',
      'x-workspace-id': workspaceId ?? '',
    },
  });
  if (!response.ok) throw new ApiError(response.status, 'ดาวน์โหลดไม่สำเร็จ');
  const disposition = response.headers.get('content-disposition') ?? '';
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match?.[1] ?? 'socialmk-export.csv';
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ------------------------------- shared types ------------------------------- */

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  plan: string;
  industry: string | null;
  bridgeUrl: string | null;
  role: string;
  brandCount?: number;
  connectionCount?: number;
  memberCount?: number;
  active?: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  title: string | null;
  avatarColor: string | null;
  locale: string;
}

export interface Brand {
  id: string;
  name: string;
  industry: string | null;
  color: string;
  accent: string | null;
  tone: string | null;
  audience: string | null;
  guidelines: string | null;
  postCount: number;
  connectionCount: number;
}

export interface Post {
  id: string;
  brandId: string;
  brandName: string | null;
  brandColor: string | null;
  title: string;
  body: string;
  hashtags: string[];
  platforms: string[];
  media: Array<{ type: string; url: string; alt?: string }>;
  status: string;
  contentType: string;
  pillar: string | null;
  scheduledAt: string | null;
  publishedAt: string | null;
  ownerId: string | null;
  ownerName: string | null;
  ownerColor: string | null;
  campaignId: string | null;
  campaignName: string | null;
  aiGenerated: boolean;
  notes: string;
  metrics: Record<string, number>;
  createdAt: string;
  updatedAt: string;
}

export interface Connection {
  id: string;
  platform: string;
  platformLabel: string;
  platformColor: string;
  accountName: string;
  handle: string;
  status: 'connected' | 'attention' | 'expired' | 'error';
  brandId: string | null;
  brandName: string | null;
  brandColor: string | null;
  followers: number;
  scopes: string[];
  tokenExpiresAt: string | null;
  daysToExpiry: number | null;
  connectedAt: string | null;
  lastSyncAt: string | null;
  health: number;
}

export interface Campaign {
  id: string;
  name: string;
  brandId: string | null;
  brandName: string | null;
  brandColor: string | null;
  objective: string;
  status: string;
  budget: number;
  spend: number;
  startDate: string | null;
  endDate: string | null;
  platforms: string[];
  results: Record<string, number>;
  boostPostId: string | null;
  pacing: number;
  budgetUsed: number;
  daysLeft: number;
  dailyBudget: number;
  roas: number;
  cpl: number;
}

export interface AnalyticsSummary {
  range: { from: string; to: string; days: number; prevFrom: string; prevTo: string };
  totals: {
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
  };
  previous: Record<string, number>;
  deltas: Record<string, number>;
  series: Array<{
    date: string;
    impressions: number;
    reach: number;
    engagements: number;
    clicks: number;
    spend: number;
    conversions: number;
    engagementRate: number;
  }>;
  platforms: Array<{
    platform: string;
    label: string;
    color: string;
    impressions: number;
    reach: number;
    engagements: number;
    clicks: number;
    spend: number;
    conversions: number;
    engagementRate: number;
    share: number;
  }>;
  brands: Array<{
    brandId: string;
    name: string;
    color: string;
    impressions: number;
    reach: number;
    engagements: number;
    clicks: number;
    spend: number;
    conversions: number;
    engagementRate: number;
  }>;
  followerSeries: Record<string, Array<{ date: string; followers: number }>>;
  topPosts: Post[];
  campaigns: Array<Record<string, any>>;
}

export interface Contact {
  id: string;
  type: 'customer' | 'prospect';
  name: string;
  email: string | null;
  phone: string | null;
  platform: string | null;
  handle: string | null;
  tags: string[];
  source: string | null;
  ltv: number;
  consent: 'granted' | 'revoked' | 'pending';
  sentiment: 'positive' | 'neutral' | 'negative';
  score: number;
  lastInteractionAt: string | null;
  note: string;
  createdAt: string;
}

export interface Member {
  id: string;
  name: string;
  email: string;
  title: string | null;
  avatarColor: string | null;
  role: string;
  lastActiveAt: string | null;
  joinedAt: string;
}

export interface Invite {
  id: string;
  email: string;
  role: string;
  status: string;
  invitedBy: string | null;
  createdAt: string;
  inviteUrl: string;
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdBy: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  requestCount: number;
}

export interface Webhook {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  secretPreview: string;
  lastDeliveryAt: string | null;
  createdAt: string;
}

export interface ActivityItem {
  id: string;
  action: string;
  target: string;
  detail: string;
  at: string;
  userName: string;
  userColor: string;
}

export interface Asset {
  id: string;
  name: string;
  kind: string;
  url: string;
  width: number;
  height: number;
  prompt: string;
  source: string;
  brandId: string | null;
  brandName: string | null;
  brandColor: string | null;
  createdAt: string;
}

export interface CopyVariant {
  id: string;
  label: string;
  labelTh: string;
  hook: string;
  body: string;
  hashtags: string[];
  cta: string;
  charCount: number;
  bestTime: string;
  altText: string;
  score: number;
}
