/**
 * SocialMK API smoke test (Beta).
 * Usage: node scripts/smoke.mjs [baseUrl]
 * Exercises the full flow: auth → workspace data → content → AI → growth → admin → public API.
 */
const base = process.argv[2] ?? 'http://127.0.0.1:4000';

let token = '';
let workspaceId = '';
const results = [];

function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function call(method, path, body, extraHeaders = {}) {
  const headers = { Accept: 'application/json', ...extraHeaders };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (workspaceId) headers['x-workspace-id'] = workspaceId;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${base}/api${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: response.status, data };
}

const health = await call('GET', '/health');
check('health', health.status === 200 && health.data?.ok);

const login = await call('POST', '/auth/login', { email: 'ariya@uarea.in', password: 'SocialMK2026' });
check('login', login.status === 200 && Boolean(login.data?.token), login.data?.error);
token = login.data?.token ?? '';
workspaceId = login.data?.activeWorkspaceId ?? '';

const me = await call('GET', '/auth/me');
check('me', me.status === 200 && me.data?.user?.email === 'ariya@uarea.in', me.data?.error);
check('workspace role', me.data?.role === 'owner', me.data?.role);

const badLogin = await call('POST', '/auth/login', { email: 'ariya@uarea.in', password: 'wrong' });
check('login rejects bad password', badLogin.status === 401);

const overview = await call('GET', '/overview?days=30');
check('overview', overview.status === 200 && overview.data?.summary?.totals?.reach > 0);
check('overview has upcoming posts', Array.isArray(overview.data?.upcoming));

const brands = await call('GET', '/brands');
check('brands', brands.status === 200 && brands.data.length >= 3, `${brands.data?.length} brands`);

const connections = await call('GET', '/connections');
check('connections', connections.status === 200 && connections.data.length > 0, `${connections.data?.length} accounts`);

const analytics = await call('GET', '/analytics/summary?days=30');
check('analytics summary', analytics.status === 200 && analytics.data.platforms.length > 0);
check('analytics deltas', typeof analytics.data?.deltas?.reach === 'number');

const demo = await call('GET', '/analytics/demographics');
check('demographics', demo.status === 200 && demo.data.age.length === 5);

const heatmap = await call('GET', '/analytics/heatmap');
check('heatmap', heatmap.status === 200 && heatmap.data.cells.length === 168);

const csv = await fetch(`${base}/api/analytics/export.csv?days=14`, {
  headers: { Authorization: `Bearer ${token}`, 'x-workspace-id': workspaceId },
});
const csvText = await csv.text();
check('analytics CSV export', csv.status === 200 && csvText.includes('Date,Impressions'), `${csvText.length} bytes`);

const posts = await call('GET', '/posts');
check('posts list', posts.status === 200 && posts.data.length > 0, `${posts.data?.length} posts`);
check('posts expose camelCase ids', posts.data.every((post) => post.brandId && post.scheduledAt !== undefined));

const newPost = await call('POST', '/posts', {
  brandId: brands.data[0].id,
  title: 'Smoke test post',
  body: 'Testing the content pipeline',
  platforms: ['facebook', 'instagram'],
  hashtags: ['#Test'],
  scheduledAt: '2026-11-05T10:00',
  status: 'draft',
});
check('create post', newPost.status === 201, newPost.data?.error);
const postId = newPost.data?.id;

const patched = await call('PATCH', `/posts/${postId}`, { status: 'scheduled', title: 'Smoke test post (updated)' });
check('update post', patched.status === 200 && patched.data.status === 'scheduled');

const duplicated = await call('POST', `/posts/${postId}/duplicate`);
check('duplicate post', duplicated.status === 201);

await call('DELETE', `/posts/${duplicated.data.id}`);
const deleted = await call('DELETE', `/posts/${postId}`);
check('delete post', deleted.status === 200);

const copy = await call('POST', '/ai/copy', {
  brandId: brands.data[0].id,
  platform: 'instagram',
  objective: 'engagement',
  language: 'th',
  keywords: 'วางแผนคอนเทนต์',
});
check('ai copy', copy.status === 200 && copy.data.variants.length === 3);

const plan = await call('POST', '/ai/plan', {
  brandId: brands.data[0].id,
  month: '2026-12',
  platforms: ['facebook', 'instagram'],
  postsPerWeek: 3,
  language: 'th',
  topics: 'เมนูใหม่, โปรโมชั่น',
});
check('ai plan', plan.status === 200 && plan.data.items.length > 8, `${plan.data?.items?.length} items`);

const art = await call('POST', '/ai/image', {
  brandId: brands.data[0].id,
  style: 'gradient-mesh',
  headline: 'ทดสอบภาพ',
  subline: 'Smoke test',
  badge: 'Beta',
});
check('ai image', art.status === 200 && art.data.asset?.url?.endsWith('.svg'));
const artFile = await fetch(`${base}${art.data?.asset?.url}`);
check('ai image served', artFile.status === 200 && artFile.headers.get('content-type')?.includes('svg'));

await call('DELETE', `/assets/${art.data.asset.id}`);

const assets = await call('GET', '/assets');
check('assets', assets.status === 200 && assets.data.length > 0, `${assets.data?.length} assets`);

const campaigns = await call('GET', '/campaigns');
check('campaigns', campaigns.status === 200 && campaigns.data.length > 0, `${campaigns.data?.length} campaigns`);
check('campaign pacing computed', typeof campaigns.data[0]?.pacing === 'number');

const boostable = await call('GET', '/campaigns/boostable');
check('boostable posts', boostable.status === 200 && boostable.data.length > 0);
check('boostable exposes brandId', boostable.data.every((post) => Boolean(post.brandId)));

const newCampaign = await call('POST', '/campaigns', {
  brandId: brands.data[0].id,
  name: 'Smoke campaign',
  objective: 'awareness',
  status: 'draft',
  budget: 10000,
  startDate: '2026-11-01',
  endDate: '2026-11-30',
  platforms: ['facebook'],
});
check('create campaign', newCampaign.status === 201, newCampaign.data?.error);
await call('DELETE', `/campaigns/${newCampaign.data.id}`);

const contacts = await call('GET', '/contacts');
check('contacts', contacts.status === 200 && contacts.data.length > 0, `${contacts.data?.length} contacts`);
const segments = await call('GET', '/contacts/segments');
check('contact segments', segments.status === 200 && segments.data.total > 0);

const newContact = await call('POST', '/contacts', {
  type: 'prospect',
  name: 'Smoke Tester',
  email: 'smoke@example.com',
  platform: 'instagram',
  tags: ['Smoke'],
  consent: 'granted',
  score: 60,
});
check('create contact', newContact.status === 201, newContact.data?.error);
await call('DELETE', `/contacts/${newContact.data.id}`);

const team = await call('GET', '/team');
check('team', team.status === 200 && team.data.members.length > 0);

const inviteFlow = await call('POST', '/team/invites', { email: 'mint@baanthai.co', role: 'analyst' });
const inviteToken = inviteFlow.data?.inviteUrl?.split('/').pop();
const publicInvite = await fetch(`${base}/api/auth/invites/${inviteToken}`);
const publicInviteData = await publicInvite.json();
check(
  'invite link resolves publicly',
  publicInvite.status === 200 && publicInviteData.workspaceName === 'UAREA Digital',
);
const wrongAccept = await call('POST', `/auth/invites/${inviteToken}/accept`);
check('invite rejects wrong email', wrongAccept.status === 403);
const mintLogin = await call('POST', '/auth/login', { email: 'mint@baanthai.co', password: 'SocialMK2026' });
const mintToken = mintLogin.data?.token;
const acceptRes = await fetch(`${base}/api/auth/invites/${inviteToken}/accept`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${mintToken}` },
});
const acceptData = await acceptRes.json();
check('invite accepts matching user', acceptRes.status === 200 && acceptData.workspace?.role === 'analyst');
const mintAgain = await call('POST', '/auth/login', { email: 'mint@baanthai.co', password: 'SocialMK2026' });
check('accepted invite adds workspace', mintAgain.data.workspaces.some((w) => w.name === 'UAREA Digital'));
await call('DELETE', `/team/${mintLogin.data.user.id}`);
await call('DELETE', `/team/invites/${inviteFlow.data.id}`);
const invite = await call('POST', '/team/invites', { email: `smoke${Date.now()}@example.com`, role: 'analyst' });
check('invite member', invite.status === 201, invite.data?.error);
await call('DELETE', `/team/invites/${invite.data.id}`);

const keys = await call('GET', '/api-keys');
check('api keys list', keys.status === 200 && keys.data.length > 0);
const key = await call('POST', '/api-keys', { name: 'Smoke key', scopes: ['posts:read', 'analytics:read'] });
check('create api key', key.status === 201 && Boolean(key.data.key));

const publicPosts = await fetch(`${base}/api/v1/posts?limit=3`, { headers: { 'x-api-key': key.data.key } });
const publicJson = await publicPosts.json();
check('public api posts', publicPosts.status === 200 && publicJson.data.length > 0);

const publicAnalytics = await fetch(`${base}/api/v1/analytics/summary?days=7`, {
  headers: { 'x-api-key': key.data.key },
});
check('public api analytics', publicAnalytics.status === 200);

const forbidden = await fetch(`${base}/api/v1/contacts`, { headers: { 'x-api-key': key.data.key } });
check('public api scope enforcement', forbidden.status === 403);

const noKey = await fetch(`${base}/api/v1/posts`);
check('public api requires key', noKey.status === 401);

const logs = await call('GET', '/api-logs');
check('api logs recorded', logs.status === 200 && logs.data.length > 0, `${logs.data?.length} logs`);

const webhooks = await call('GET', '/webhooks');
check('webhooks list', webhooks.status === 200 && webhooks.data.length > 0);

const notifications = await call('GET', '/notifications');
check('notifications', notifications.status === 200 && Array.isArray(notifications.data));

const bridge = await call('POST', '/bridge/sync');
check('workspace bridge sync', bridge.status === 200 && bridge.data.ok);

const workspaceSwitch = await fetch(`${base}/api/brands`, {
  headers: {
    Authorization: `Bearer ${token}`,
    'x-workspace-id': login.data.workspaces[1].id,
  },
});
const otherBrands = await workspaceSwitch.json();
check(
  'workspace isolation',
  workspaceSwitch.status === 200 && otherBrands.every((b) => b.name !== brands.data[0].name),
);

await call('DELETE', `/api-keys/${key.data.id}`);

const editor = await call('POST', '/auth/login', { email: 'priya@uarea.in', password: 'SocialMK2026' });
check(
  'multi-workspace users land in their primary workspace',
  editor.status === 200 && editor.data.workspaces[0].name === 'UAREA Digital',
  editor.data?.workspaces?.map((w) => w.name).join(' / '),
);
const editorSummary = await fetch(`${base}/api/analytics/summary?days=7`, {
  headers: { Authorization: `Bearer ${editor.data.token}`, 'x-workspace-id': editor.data.activeWorkspaceId },
});
check('editor can read analytics', editorSummary.status === 200);

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.error('Failed checks:', failed.map((f) => f.name).join(', '));
  process.exit(1);
}
