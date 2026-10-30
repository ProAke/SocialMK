import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, db, id, prepare, run, transaction } from './db.js';
import { hashPassword, hashApiKey, randomToken } from './auth.js';
import { addDays, mulberry32, round, todayBkk } from './util.js';
import { renderCover, type ArtStyle } from './ai.js';

const DEMO_PASSWORD = 'SocialMK2026';

interface BrandSeed {
  key: string;
  name: string;
  industry: string;
  color: string;
  accent: string;
  tone: string;
  audience: string;
  guidelines: string;
}

interface ConnectionSeed {
  platform: string;
  account: string;
  handle: string;
  status: 'connected' | 'attention' | 'expired' | 'error';
  followers: number;
  health: number;
  expiresInDays?: number;
  brandKey?: string;
}

export function seedDatabase(force = false): void {
  const existing = db.prepare('SELECT COUNT(*) AS n FROM users').get() as unknown as { n: number };
  if (existing.n > 0 && !force) return;

  if (force) {
    for (const table of [
      'metrics',
      'posts',
      'campaigns',
      'contacts',
      'connections',
      'brands',
      'memberships',
      'invites',
      'api_keys',
      'webhooks',
      'api_logs',
      'activity',
      'assets',
      'users',
      'workspaces',
    ]) {
      db.exec(`DELETE FROM ${table}`);
    }
  }

  const now = new Date().toISOString();
  const today = todayBkk();
  const userIds = {
    ariya: id('usr'),
    thanakrit: id('usr'),
    priya: id('usr'),
    nattapong: id('usr'),
    mint: id('usr'),
    pink: id('usr'),
  };

  const users: Array<[string, string, string, string, string, string]> = [
    [userIds.ariya, 'อารีย์ วัฒนกุล', 'ariya@uarea.in', 'owner', 'Founder & Managing Partner', '#6366F1'],
    [userIds.thanakrit, 'ธนกฤต ศรีสุข', 'thanakrit@uarea.in', 'admin', 'Head of Social Media', '#0EA5E9'],
    [userIds.priya, 'ปรียา จันทร์เพ็ญ', 'priya@uarea.in', 'editor', 'Content Lead', '#F59E0B'],
    [userIds.nattapong, 'ณัฐพงษ์ ใจดี', 'nattapong@uarea.in', 'analyst', 'Marketing Analyst', '#10B981'],
    [userIds.mint, 'มินท์ ภูวเดช', 'mint@baanthai.co', 'owner', 'Brand Owner', '#F97316'],
    [userIds.pink, 'พิงค์ ณ สงขลา', 'pink@novaclinic.co', 'editor', 'Digital Marketing', '#EC4899'],
  ];
  for (const [uid, name, email, role, title, color] of users) {
    run(
      `INSERT INTO users (id, name, email, password_hash, role, title, avatar_color, locale, last_active_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'th', ?, ?)`,
      [uid, name, email, hashPassword(DEMO_PASSWORD), role, title, color, now, now],
    );
  }

  const wsU = id('wsp');
  const wsB = id('wsp');
  const wsN = id('wsp');
  const workspaces: Array<[string, string, string, string, string, string | null]> = [
    [wsU, 'UAREA Digital', 'uarea', 'growth', 'Creative & Marketing Agency', 'https://mng.uarea.in'],
    [wsB, 'Baan Thai Riverside', 'baanthai', 'starter', 'Restaurant & Riverside Venue', 'https://mng.uarea.in/baanthai'],
    [wsN, 'Nova Clinic', 'novaclinic', 'scale', 'Health & Aesthetics', null],
  ];
  for (const [wid, name, slug, plan, industry, bridge] of workspaces) {
    run(
      `INSERT INTO workspaces (id, name, slug, plan, industry, timezone, bridge_url, created_at)
       VALUES (?, ?, ?, ?, ?, 'Asia/Bangkok', ?, ?)`,
      [wid, name, slug, plan, industry, bridge, now],
    );
  }

  const memberships: Array<[string, string, string]> = [
    [wsU, userIds.ariya, 'owner'],
    [wsU, userIds.thanakrit, 'admin'],
    [wsU, userIds.priya, 'editor'],
    [wsU, userIds.nattapong, 'analyst'],
    [wsB, userIds.mint, 'owner'],
    [wsB, userIds.thanakrit, 'admin'],
    [wsN, userIds.pink, 'owner'],
    [wsN, userIds.ariya, 'admin'],
    [wsN, userIds.priya, 'editor'],
  ];
  for (const [wid, uid, role] of memberships) {
    run(`INSERT INTO memberships (workspace_id, user_id, role) VALUES (?, ?, ?)`, [wid, uid, role]);
  }

  const brandsUarea: BrandSeed[] = [
    {
      key: 'studio',
      name: 'UAREA Studio',
      industry: 'Creative & Brand Studio',
      color: '#5B5BD6',
      accent: '#7CF7D4',
      tone: 'Professional, warm, confident',
      audience: 'Marketing leads and founders in Thailand, 28–45',
      guidelines: 'Lead with customer insight, never overclaim. Thai-first copy with English key terms.',
    },
    {
      key: 'baan',
      name: 'Baan Thai Kitchen',
      industry: 'Restaurant',
      color: '#F97316',
      accent: '#FDE68A',
      tone: 'Warm, playful, appetising',
      audience: 'Urban families and office workers in Bangkok, 25–50',
      guidelines: 'Show real food photography, avoid discount-first messaging, always include branch info.',
    },
    {
      key: 'academy',
      name: 'UAREA Academy',
      industry: 'Education & Training',
      color: '#0EA5E9',
      accent: '#A5F3FC',
      tone: 'Encouraging, practical, clear',
      audience: 'Junior marketers and career switchers, 22–32',
      guidelines: 'Every lesson must end with one actionable takeaway. No jargon without explanation.',
    },
  ];
  const brandsBaan: BrandSeed[] = [
    {
      key: 'baanriverside',
      name: 'Baan Thai Riverside',
      industry: 'Restaurant & Riverside Venue',
      color: '#F59E0B',
      accent: '#FDE68A',
      tone: 'Relaxed, inviting, local',
      audience: 'Weekend diners and event planners, Bangkok',
      guidelines: 'Highlight the riverside experience; tag location in every post.',
    },
  ];
  const brandsNova: BrandSeed[] = [
    {
      key: 'nova',
      name: 'Nova Clinic',
      industry: 'Aesthetic Clinic',
      color: '#EC4899',
      accent: '#FBCFE8',
      tone: 'Reassuring, expert, discreet',
      audience: 'Women 25–40 in Bangkok interested in skincare',
      guidelines: 'No before/after claims without consent; always show doctor credentials.',
    },
  ];

  const brandIds: Record<string, string> = {};
  const insertBrands = (workspaceId: string, seeds: BrandSeed[]) => {
    for (const b of seeds) {
      const brandId = id('brd');
      brandIds[b.key] = brandId;
      run(
        `INSERT INTO brands (id, workspace_id, name, industry, color, accent, tone, audience, guidelines, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [brandId, workspaceId, b.name, b.industry, b.color, b.accent, b.tone, b.audience, b.guidelines, now],
      );
    }
  };
  insertBrands(wsU, brandsUarea);
  insertBrands(wsB, brandsBaan);
  insertBrands(wsN, brandsNova);

  const connections: Array<{ ws: string; seed: ConnectionSeed }> = [
    { ws: wsU, seed: { platform: 'facebook', account: 'UAREA Studio', handle: '@uareastudio', status: 'connected', followers: 48200, health: 98, brandKey: 'studio' } },
    { ws: wsU, seed: { platform: 'instagram', account: 'uarea.studio', handle: '@uarea.studio', status: 'connected', followers: 31600, health: 94, brandKey: 'studio' } },
    { ws: wsU, seed: { platform: 'tiktok', account: 'UAREA Studio', handle: '@uareastudio', status: 'connected', followers: 22800, health: 88, brandKey: 'studio' } },
    { ws: wsU, seed: { platform: 'linkedin', account: 'UAREA Digital Co., Ltd.', handle: '@uarea-digital', status: 'connected', followers: 9400, health: 96, brandKey: 'studio' } },
    { ws: wsU, seed: { platform: 'line', account: 'UAREA Official', handle: '@uarea', status: 'connected', followers: 12500, health: 91, brandKey: 'studio' } },
    { ws: wsU, seed: { platform: 'x', account: 'UAREA Digital', handle: '@uareadigital', status: 'attention', followers: 7600, health: 72, expiresInDays: 3, brandKey: 'studio' } },
    { ws: wsU, seed: { platform: 'youtube', account: 'UAREA Studio', handle: '@uareastudio', status: 'attention', followers: 5400, health: 61, expiresInDays: 6, brandKey: 'studio' } },
    { ws: wsU, seed: { platform: 'facebook', account: 'Baan Thai Kitchen', handle: '@baanthai.kitchen', status: 'connected', followers: 18400, health: 93, brandKey: 'baan' } },
    { ws: wsU, seed: { platform: 'instagram', account: 'baanthai.kitchen', handle: '@baanthai.kitchen', status: 'connected', followers: 9200, health: 90, brandKey: 'baan' } },
    { ws: wsU, seed: { platform: 'line', account: 'Baan Thai Kitchen', handle: '@baanthaikitchen', status: 'connected', followers: 6100, health: 95, brandKey: 'baan' } },
    { ws: wsU, seed: { platform: 'facebook', account: 'UAREA Academy', handle: '@uareaacademy', status: 'connected', followers: 12600, health: 96, brandKey: 'academy' } },
    { ws: wsU, seed: { platform: 'instagram', account: 'uarea.academy', handle: '@uarea.academy', status: 'connected', followers: 7400, health: 91, brandKey: 'academy' } },
    { ws: wsU, seed: { platform: 'youtube', account: 'UAREA Academy', handle: '@uareaacademy', status: 'connected', followers: 3200, health: 89, brandKey: 'academy' } },
    { ws: wsU, seed: { platform: 'google_drive', account: 'uarea.creative@gmail.com', handle: 'UAREA Creative Drive', status: 'connected', followers: 0, health: 100 } },
    { ws: wsU, seed: { platform: 'gmail', account: 'hello@uarea.in', handle: 'hello@uarea.in', status: 'connected', followers: 0, health: 100 } },
    { ws: wsB, seed: { platform: 'facebook', account: 'Baan Thai Riverside', handle: '@baanthai.riverside', status: 'connected', followers: 62400, health: 97, brandKey: 'baanriverside' } },
    { ws: wsB, seed: { platform: 'instagram', account: 'baanthai.riverside', handle: '@baanthai.riverside', status: 'connected', followers: 28900, health: 90, brandKey: 'baanriverside' } },
    { ws: wsB, seed: { platform: 'tiktok', account: 'Baan Thai Riverside', handle: '@baanthai.riverside', status: 'connected', followers: 45100, health: 85, brandKey: 'baanriverside' } },
    { ws: wsB, seed: { platform: 'line', account: 'Baan Thai Riverside', handle: '@baanthairiverside', status: 'connected', followers: 21800, health: 93, brandKey: 'baanriverside' } },
    { ws: wsN, seed: { platform: 'instagram', account: 'novaclinic', handle: '@novaclinic', status: 'connected', followers: 18300, health: 95, brandKey: 'nova' } },
    { ws: wsN, seed: { platform: 'tiktok', account: 'Nova Clinic', handle: '@novaclinic', status: 'connected', followers: 31000, health: 89, brandKey: 'nova' } },
    { ws: wsN, seed: { platform: 'facebook', account: 'Nova Clinic', handle: '@novaclinic', status: 'connected', followers: 12400, health: 92, brandKey: 'nova' } },
    { ws: wsN, seed: { platform: 'line', account: 'Nova Care', handle: '@novacare', status: 'connected', followers: 8600, health: 87, brandKey: 'nova' } },
  ];

  for (const { ws, seed } of connections) {
    run(
      `INSERT INTO connections (id, workspace_id, brand_id, platform, account_name, handle, status, followers, scopes, token_expires_at, connected_at, last_sync_at, health, meta)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id('con'),
        ws,
        seed.brandKey ? brandIds[seed.brandKey] : null,
        seed.platform,
        seed.account,
        seed.handle,
        seed.status,
        seed.followers,
        JSON.stringify(['read_insights', 'publish_content', 'manage_comments']),
        seed.expiresInDays ? addDays(today, seed.expiresInDays) : addDays(today, 55),
        addDays(today, -120),
        new Date(Date.now() - 1000 * 60 * 17).toISOString(),
        seed.health,
        JSON.stringify({ syncWindow: '90d' }),
      ],
    );
  }

  /* ---------------- metrics ---------------- */
  const platformProfile: Record<string, { imp: number; er: number; ctr: number; cvr: number; spend: number }> = {
    facebook: { imp: 1.5, er: 0.021, ctr: 0.011, cvr: 0.04, spend: 1 },
    instagram: { imp: 1.72, er: 0.042, ctr: 0.014, cvr: 0.05, spend: 0.9 },
    tiktok: { imp: 2.95, er: 0.065, ctr: 0.009, cvr: 0.03, spend: 0.75 },
    linkedin: { imp: 1.18, er: 0.034, ctr: 0.016, cvr: 0.06, spend: 0.6 },
    line: { imp: 1.02, er: 0.018, ctr: 0.022, cvr: 0.08, spend: 0.4 },
    x: { imp: 0.92, er: 0.012, ctr: 0.007, cvr: 0.03, spend: 0.3 },
    youtube: { imp: 0.84, er: 0.028, ctr: 0.006, cvr: 0.02, spend: 0.35 },
  };

  const metricInsert = prepare(
    `INSERT OR REPLACE INTO metrics (id, workspace_id, brand_id, platform, date, impressions, reach, engagements, clicks, followers, spend, conversions)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const days = 120;
  const socialConnections = connections.filter((c) => platformProfile[c.seed.platform]);
  transaction(() => {
    for (const { ws, seed } of socialConnections) {
      const profile = platformProfile[seed.platform];
      const brandId = seed.brandKey ? brandIds[seed.brandKey] : null;
      if (!brandId) continue;
      const rng = mulberry32(seed.followers + seed.platform.length * 977);
      const growth = 0.07 + rng() * 0.05;
      const startFollowers = Math.round(seed.followers * (1 - growth));
      for (let i = 0; i < days; i++) {
        const date = addDays(today, -(days - 1 - i));
        const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
        const weekend = dow === 0 || dow === 6;
        const seasonal = 1 + (weekend ? 0.12 : 0) + Math.sin((i / days) * Math.PI * 2) * 0.07;
        const noise = 0.85 + rng() * 0.3;
        const progress = i / (days - 1);
        const followers = Math.round(startFollowers + (seed.followers - startFollowers) * progress + (rng() - 0.5) * 40);
        const spike = i > days - 16 && i < days - 9 ? 1.45 : i > days - 45 && i < days - 38 ? 1.25 : 1;
        const impressions = Math.round(followers * profile.imp * seasonal * noise * spike * 0.42);
        const reach = Math.round(impressions * (0.58 + rng() * 0.08));
        const engagements = Math.round(impressions * profile.er * (0.82 + rng() * 0.36));
        const clicks = Math.round(impressions * profile.ctr * (0.7 + rng() * 0.6));
        const spend = Math.round(profile.spend * (250 + rng() * 900) * (spike > 1 ? 2.4 : 1));
        const conversions = Math.round(clicks * profile.cvr * (0.8 + rng() * 0.4));
        metricInsert.run(
          id('met'),
          ws,
          brandId,
          seed.platform,
          date,
          impressions,
          reach,
          engagements,
          clicks,
          followers,
          spend,
          conversions,
        );
      }
    }
  });

  /* ---------------- campaigns ---------------- */
  const campaignInsert = prepare(
    `INSERT INTO campaigns (id, workspace_id, brand_id, name, objective, status, budget, spend, start_date, end_date, platforms, results, boost_post_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const campaignSeeds = [
    {
      key: 'openhouse',
      ws: wsU,
      brand: 'studio',
      name: 'Open House 2026 — Studio Launch',
      objective: 'lead_generation',
      status: 'active',
      budget: 120000,
      spend: 74300,
      start: addDays(today, -18),
      end: addDays(today, 12),
      platforms: ['facebook', 'instagram', 'linkedin'],
      results: { impressions: 486200, clicks: 8420, leads: 318, revenue: 412000 },
    },
    {
      key: 'retarget',
      ws: wsU,
      brand: 'studio',
      name: 'Always-on Retargeting',
      objective: 'conversion',
      status: 'active',
      budget: 45000,
      spend: 31850,
      start: addDays(today, -30),
      end: addDays(today, 30),
      platforms: ['facebook', 'instagram'],
      results: { impressions: 210400, clicks: 6320, leads: 241, revenue: 528000 },
    },
    {
      key: 'academy',
      ws: wsU,
      brand: 'academy',
      name: 'Academy รุ่น 12 — รับสมัคร',
      objective: 'conversion',
      status: 'completed',
      budget: 80000,
      spend: 41200,
      start: addDays(today, -40),
      end: addDays(today, -6),
      platforms: ['facebook', 'instagram', 'tiktok'],
      results: { impressions: 322100, clicks: 5810, leads: 196, revenue: 284000 },
    },
    {
      key: 'brandfilm',
      ws: wsU,
      brand: 'studio',
      name: 'Q4 Brand Film — Teaser',
      objective: 'awareness',
      status: 'draft',
      budget: 60000,
      spend: 0,
      start: addDays(today, 9),
      end: addDays(today, 39),
      platforms: ['facebook', 'youtube', 'instagram'],
      results: {},
    },
    {
      key: 'baannew',
      ws: wsU,
      brand: 'baan',
      name: 'เมนูใหม่ ปลาเผาเกลือ',
      objective: 'awareness',
      status: 'active',
      budget: 35000,
      spend: 12400,
      start: addDays(today, -8),
      end: addDays(today, 16),
      platforms: ['facebook', 'instagram', 'tiktok'],
      results: { impressions: 168900, clicks: 3120, leads: 84, revenue: 96000 },
    },
    {
      key: 'riverside',
      ws: wsB,
      brand: 'baanriverside',
      name: 'Riverside Sunset Sessions',
      objective: 'awareness',
      status: 'active',
      budget: 28000,
      spend: 9800,
      start: addDays(today, -10),
      end: addDays(today, 20),
      platforms: ['facebook', 'instagram'],
      results: { impressions: 96400, clicks: 2140, leads: 52, revenue: 68000 },
    },
    {
      key: 'novabrand',
      ws: wsN,
      brand: 'nova',
      name: 'Nova — Always-on Awareness',
      objective: 'awareness',
      status: 'active',
      budget: 55000,
      spend: 28300,
      start: addDays(today, -25),
      end: addDays(today, 35),
      platforms: ['instagram', 'tiktok'],
      results: { impressions: 284000, clicks: 6120, leads: 188, revenue: 412000 },
    },
    {
      key: 'novaglow',
      ws: wsN,
      brand: 'nova',
      name: 'Nova Glow — Winter Package',
      objective: 'conversion',
      status: 'completed',
      budget: 90000,
      spend: 88600,
      start: addDays(today, -70),
      end: addDays(today, -20),
      platforms: ['instagram', 'tiktok', 'line'],
      results: { impressions: 402000, clicks: 11200, leads: 512, revenue: 1240000 },
    },
  ];
  const campaignIds: Record<string, string> = {};
  for (const c of campaignSeeds) {
    const cid = id('cmp');
    campaignIds[c.key] = cid;
    campaignInsert.run(
      cid,
      c.ws,
      brandIds[c.brand],
      c.name,
      c.objective,
      c.status,
      c.budget,
      c.spend,
      c.start,
      c.end,
      JSON.stringify(c.platforms),
      JSON.stringify(c.results),
      null,
      now,
    );
  }

  /* ---------------- assets ---------------- */
  const assetDir = path.join(DATA_DIR, 'assets');
  fs.mkdirSync(assetDir, { recursive: true });
  const artSeeds: Array<{ style: ArtStyle; headline: string; subline: string; badge: string; brand: string; color: string; accent: string; size: [number, number] }> = [
    {
      style: 'gradient-mesh',
      headline: 'เปิดสตูดิโอใหม่ ย่านพระราม 4',
      subline: 'Open House · 7–8 พ.ย. 2026',
      badge: 'Open House',
      brand: 'UAREA Studio',
      color: '#5B5BD6',
      accent: '#7CF7D4',
      size: [1080, 1080],
    },
    {
      style: 'bold-type',
      headline: 'คอนเทนต์ที่ดี เริ่มจากฟังลูกค้า',
      subline: 'Playbook ฉบับทีม UAREA',
      badge: 'Playbook',
      brand: 'UAREA Studio',
      color: '#0EA5E9',
      accent: '#A5F3FC',
      size: [1080, 1350],
    },
    {
      style: 'product',
      headline: 'ปลาเผาเกลือ สูตรใหม่',
      subline: 'Baan Thai Kitchen · ทุกสาขา',
      badge: 'New menu',
      brand: 'Baan Thai Kitchen',
      color: '#F97316',
      accent: '#FDE68A',
      size: [1080, 1350],
    },
    {
      style: 'editorial',
      headline: 'จาก Insight สู่แคมเปญที่ขายได้',
      subline: 'คู่มือ 12 หน้า สำหรับทีมการตลาด',
      badge: 'Guide',
      brand: 'UAREA Academy',
      color: '#0F766E',
      accent: '#99F6E4',
      size: [1080, 1080],
    },
    {
      style: 'festive',
      headline: 'ลอยกระทงนี้ พบกันที่ริเวอร์ไซด์',
      subline: 'Baan Thai Riverside · 24 พ.ย.',
      badge: 'Seasonal',
      brand: 'Baan Thai Riverside',
      color: '#F59E0B',
      accent: '#FDE68A',
      size: [1080, 1350],
    },
  ];
  const assetIds: string[] = [];
  const assetInsert = prepare(
    `INSERT INTO assets (id, workspace_id, brand_id, name, kind, url, width, height, prompt, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  artSeeds.forEach((art, index) => {
    const aid = id('ast');
    assetIds.push(aid);
    const fileName = `${aid}.svg`;
    const svg = renderCover({
      style: art.style,
      width: art.size[0],
      height: art.size[1],
      headline: art.headline,
      subline: art.subline,
      badge: art.badge,
      brand: art.brand,
      color: art.color,
      accent: art.accent,
    });
    fs.writeFileSync(path.join(assetDir, fileName), svg, 'utf8');
    const brandKey = art.brand.includes('Baan') ? (art.brand.includes('Riverside') ? 'baanriverside' : 'baan') : art.brand.includes('Academy') ? 'academy' : 'studio';
    assetInsert.run(
      aid,
      wsU,
      brandIds[brandKey],
      art.headline.slice(0, 60),
      'ai',
      `/media/assets/${fileName}`,
      art.size[0],
      art.size[1],
      `${art.style} · ${art.badge}`,
      'SocialMK AI Studio',
      now,
    );
  });
  assetInsert.run(
    id('ast'),
    wsU,
    brandIds.studio,
    'Brand guideline 2026.pdf',
    'drive',
    'https://drive.google.com/file/d/1uarea-brand-guideline',
    0,
    0,
    '',
    'Google Drive',
    now,
  );
  assetInsert.run(
    id('ast'),
    wsU,
    brandIds.baan,
    'เมนูใหม่ — รูปจากร้าน (14 ไฟล์)',
    'drive',
    'https://drive.google.com/drive/folders/1baanthai-nov',
    0,
    0,
    '',
    'Google Drive',
    now,
  );
  assetInsert.run(
    id('ast'),
    wsU,
    brandIds.studio,
    'Open House — BTS storyboard.docx',
    'drive',
    'https://drive.google.com/file/d/1uarea-openhouse-storyboard',
    0,
    0,
    '',
    'Google Drive',
    now,
  );

  /* ---------------- posts ---------------- */
  type PostSeed = {
    brand: string;
    title: string;
    body: string;
    tags: string[];
    platforms: string[];
    type: string;
    pillar: string;
    status: string;
    offset: number;
    time: string;
    owner: string;
    campaign?: string;
    asset?: number;
  };

  const th = (s: string) => s;
  const published: PostSeed[] = [
    { brand: 'studio', title: 'เปิดสตูดิโอใหม่ที่พระราม 4', body: th('เรากำลังเปิดพื้นที่ใหม่สำหรับทีมครีเอทีฟและลูกค้าของเรา\n\n7–8 พ.ย. นี้ ขอเชิญทุกคนมาร่วม Open House พบปะทีมงาน ดูผลงานจริง และเวิร์กชอปเล็ก ๆ เรื่องการวางแผนคอนเทนต์\n\nลงทะเบียนฟรีที่ลิงก์ในไบโอ'), tags: ['#UAREAStudio', '#OpenHouse2026', '#การตลาดออนไลน์'], platforms: ['facebook', 'instagram', 'linkedin'], type: 'image', pillar: 'Promote', status: 'published', offset: -2, time: '10:00', owner: 'priya', campaign: 'openhouse', asset: 0 },
    { brand: 'studio', title: '3 สัญญาณว่าคอนเทนต์ของคุณกำลังหลุดโฟกัส', body: th('โพสต์ทุกวันแต่ยอดมีส่วนร่วมลดลง? อาจไม่ใช่เพราะคอนเทนต์ไม่ดี แต่เพราะขาดการวางแผน\n\n1) ไม่มีเสาหลักเนื้อหา\n2) วัดผลแค่ยอดไลก์\n3) ไม่ฟังเสียงลูกค้าจริง\n\nเซฟโพสต์นี้ไว้เช็กกับทีมของคุณ'), tags: ['#ContentStrategy', '#SocialMK', '#การตลาด'], platforms: ['facebook', 'linkedin'], type: 'carousel', pillar: 'Educate', status: 'published', offset: -4, time: '09:30', owner: 'priya', asset: 1 },
    { brand: 'baan', title: 'ปลาเผาเกลือ สูตรใหม่จากเชฟของเรา', body: th('เกลือสมุทร + ตะไคร้ + ใบมะกรูด เผาบนเตาถ่านกว่า 25 นาที\n\nเสิร์ฟพร้อมน้ำจิ้มสามรส เริ่มเสิร์ฟวันนี้ทุกสาขา\n\n#BaanThaiKitchen #ปลาเผาเกลือ'), tags: ['#BaanThaiKitchen', '#ปลาเผาเกลือ', '#ของกิน'], platforms: ['facebook', 'instagram', 'tiktok'], type: 'reel', pillar: 'Showcase', status: 'published', offset: -5, time: '17:30', owner: 'priya', campaign: 'baannew', asset: 2 },
    { brand: 'academy', title: 'คอร์สวางแผนคอนเทนต์ 4 สัปดาห์', body: th('เรียนสดออนไลน์ทุกวันพฤหัสบดี 19:00–21:00\n\nสัปดาห์ที่ 1: ตั้งเป้าหมายและวัดผล\nสัปดาห์ที่ 2: วางปฏิทินคอนเทนต์\nสัปดาห์ที่ 3: เขียนแคปชันและออกแบบภาพ\nสัปดาห์ที่ 4: ยิงโฆษณาและอ่านรายงาน\n\nเหลือ 6 ที่นั่งสุดท้าย'), tags: ['#UAREAAcademy', '#คอร์สออนไลน์', '#ContentPlanning'], platforms: ['facebook', 'instagram'], type: 'image', pillar: 'Promote', status: 'published', offset: -7, time: '12:00', owner: 'thanakrit', campaign: 'academy', asset: 3 },
    { brand: 'studio', title: 'เบื้องหลังการถ่ายทำแบรนด์ลูกค้า', body: th('หนึ่งวันถ่ายทำ 37 ช็อต 4 โลเคชัน และกาแฟอีก 11 แก้ว ☕️\n\nทีมเราทำงานยังไงให้ทันเดดไลน์? คำตอบคือ pre-production ที่ดี\n\n#BehindTheScenes'), tags: ['#BehindTheScenes', '#UAREAStudio'], platforms: ['instagram', 'tiktok'], type: 'reel', pillar: 'Behind the scenes', status: 'published', offset: -9, time: '19:00', owner: 'priya' },
    { brand: 'baan', title: 'ลูกค้าพูดถึงเรา: รีวิวจากคุณแนน', body: th('“บรรยากาศดีมาก พนักงานแนะนำเมนูได้ดี ปลาเผาหอมมาก ๆ ค่ะ”\n\nขอบคุณทุกเสียงตอบรับนะคะ เรานำไปปรับใช้ทุกครั้ง\n\n#BaanThaiKitchen #รีวิวลูกค้า'), tags: ['#BaanThaiKitchen', '#รีวิว'], platforms: ['facebook', 'instagram'], type: 'image', pillar: 'Social proof', status: 'published', offset: -11, time: '11:30', owner: 'mint' },
    { brand: 'studio', title: 'เทรนด์คอนเทนต์ Q4 ที่แบรนด์ควรจับตา', body: th('1) วิดีโอสั้นแนวเล่าเรื่องจริง\n2) คอนเทนต์จากพนักงาน (employee-generated)\n3) การใช้ AI ช่วยผลิตแต่ยังคงเสียงของแบรนด์\n\nอยากได้เทมเพลตวางแผน Q4 ทักคำว่า “Q4”'), tags: ['#Trends', '#Q4Planning', '#SocialMK'], platforms: ['facebook', 'linkedin', 'x'], type: 'carousel', pillar: 'Educate', status: 'published', offset: -13, time: '08:30', owner: 'ariya' },
    { brand: 'academy', title: 'Free webinar: อ่านรายงานโซเชียลให้เป็นเรื่องง่าย', body: th('เจาะ 5 ตัวชี้วัดที่ควรดูจริง ๆ และวิธีแปลงเป็นข้อเสนอให้หัวหน้า\n\n🗓 28 พ.ย. 2026 | 19:00\n🎟 ฟรี ลงทะเบียนในคอมเมนต์'), tags: ['#Webinar', '#Analytics', '#UAREAAcademy'], platforms: ['facebook', 'linkedin'], type: 'image', pillar: 'Community', status: 'published', offset: -15, time: '10:00', owner: 'nattapong' },
    { brand: 'baan', title: 'โปรกลางสัปดาห์: 2 จาน 399.-', body: th('ทุกวันพุธ–พฤหัสบดี เลือก 2 เมนูจากรายการพิเศษในราคา 399 บาท\n\nใช้ได้ที่สาขาสาทรและริเวอร์ไซด์\n\n#BaanThaiKitchen #โปรกลางสัปดาห์'), tags: ['#BaanThaiKitchen', '#โปร'], platforms: ['facebook', 'line'], type: 'image', pillar: 'Promote', status: 'published', offset: -17, time: '12:00', owner: 'mint' },
    { brand: 'studio', title: 'ทีมของเราเลือกใช้เครื่องมืออะไรในปีนี้', body: th('เครื่องมือคือเครื่องทุ่นแรง ไม่ใช่คำตอบสุดท้าย\n\nแต่ถ้าเลือกดี ๆ ทีมจะเหลือเวลาไปคิดสร้างสรรค์มากขึ้น 30%\n\nนี่คือสแตกที่เราใช้จริงใน SocialMK'), tags: ['#Tools', '#Productivity', '#SocialMK'], platforms: ['linkedin', 'x'], type: 'text', pillar: 'Educate', status: 'published', offset: -19, time: '09:00', owner: 'thanakrit' },
    { brand: 'studio', title: 'ลูกค้าใหม่: แบรนด์สกินแคร์จากเชียงใหม่', body: th('ยินดีต้อนรับ Nova Clinic สู่ครอบครัว UAREA 🎉\n\nเราจะดูแลกลยุทธ์โซเชียลทั้ง 4 แพลตฟอร์ม เริ่มต้นพฤศจิกายนนี้'), tags: ['#NewClient', '#UAREAStudio'], platforms: ['facebook', 'instagram', 'linkedin'], type: 'image', pillar: 'Community', status: 'published', offset: -21, time: '16:00', owner: 'ariya' },
    { brand: 'academy', title: 'คำถามที่พบบ่อย: เริ่มเรียนต้องมีพื้นฐานไหม', body: th('ไม่ต้องมีพื้นฐานเลยค่ะ เราเริ่มจากศูนย์และมีแบบฝึกหัดทุกบท\n\nเรียนซ้ำได้ 1 ปี มีกลุ่มถามตอบตลอดหลักสูตร'), tags: ['#FAQ', '#UAREAAcademy'], platforms: ['instagram', 'tiktok'], type: 'reel', pillar: 'Social proof', status: 'published', offset: -23, time: '18:30', owner: 'priya' },
    { brand: 'baan', title: 'เชฟแนะนำ: วิธีเลือกปลาให้สด', body: th('ดูตา ดูเหงือก ดูความใสของเนื้อ และที่สำคัญคือกลิ่น\n\nเชฟของเราสอนทีมทุกวันว่า “ปลาสดไม่ต้องปรุงเยอะ”'), tags: ['#BaanThaiKitchen', '#เชฟแนะนำ'], platforms: ['tiktok', 'instagram'], type: 'reel', pillar: 'Educate', status: 'published', offset: -25, time: '20:00', owner: 'priya' },
    { brand: 'studio', title: 'ประกาศ: SocialMK Beta เปิดให้ทดลองแล้ว', body: th('เรากำลังสร้างศูนย์บัญชาการโซเชียลสำหรับแบรนด์ไทย\n\nรวมปฏิทินคอนเทนต์ AI ช่วยคิดแคปชัน วิเคราะห์ข้ามแพลตฟอร์ม และจัดการสิทธิ์ทีมในที่เดียว\n\nสมัครทดลองได้ที่ลิงก์ในไบโอ'), tags: ['#SocialMK', '#Beta', '#SocialMediaManagement'], platforms: ['facebook', 'linkedin', 'x', 'instagram'], type: 'image', pillar: 'Promote', status: 'published', offset: -27, time: '10:00', owner: 'ariya' },
    { brand: 'studio', title: 'รีวิวจากลูกค้า: ทีมการศึกษาลดเวลาทำรายงาน 60%', body: th('“แต่ก่อนทำรายงานเดือนละ 2 วัน ตอนนี้ดึงข้อมูลรวมทุกแพลตฟอร์มได้ใน 5 นาที”\n\n— คุณก้อย Head of Marketing'), tags: ['#Testimonial', '#UAREAStudio'], platforms: ['linkedin', 'facebook'], type: 'image', pillar: 'Social proof', status: 'published', offset: -29, time: '11:00', owner: 'thanakrit' },
  ];

  const upcoming: PostSeed[] = [
    { brand: 'studio', title: 'Open House — วันสุดท้าย', body: th('วันสุดท้ายแล้ว! 8 พ.ย. นี้ พบกันที่สตูดิโอพระราม 4\n\nวันนี้มี session พิเศษ “วางแผนคอนเทนต์ Q4” เวลา 14:00'), tags: ['#OpenHouse2026', '#UAREAStudio'], platforms: ['facebook', 'instagram', 'linkedin'], type: 'image', pillar: 'Promote', status: 'scheduled', offset: 9, time: '09:30', owner: 'priya', campaign: 'openhouse', asset: 0 },
    { brand: 'baan', title: 'ลอยกระทงนี้ พบกันที่ริเวอร์ไซด์', body: th('ลอยกระทงริมน้ำกับชุดอาหารพิเศษ 599.- ต่อท่าน\n\nจองโต๊ะล่วงหน้าได้ทาง LINE OA\n\n#ลอยกระทง #BaanThaiRiverside'), tags: ['#ลอยกระทง', '#BaanThaiRiverside'], platforms: ['facebook', 'instagram', 'line'], type: 'image', pillar: 'Promote', status: 'scheduled', offset: 24, time: '18:00', owner: 'mint', asset: 4 },
    { brand: 'academy', title: 'Webinar 28 พ.ย. — เตือนความจำครั้งสุดท้าย', body: th('เหลืออีก 2 วันสำหรับรอบนี้\n\nอ่านรายงานโซเชียลให้เป็นเรื่องง่าย กับทีมวิเคราะห์ของ UAREA'), tags: ['#Webinar', '#Analytics'], platforms: ['facebook', 'linkedin'], type: 'image', pillar: 'Promote', status: 'approved', offset: 27, time: '10:00', owner: 'nattapong' },
    { brand: 'studio', title: 'Insight: ทำไมวิดีโอแนวตั้งถึงได้เปรียบ', body: th('ข้อมูลจาก 12 แบรนด์ที่เราดูแลในไตรมาสนี้ชี้ว่า วิดีโอแนวตั้งมีอัตราดูจบสูงกว่าแนวนอน 2.3 เท่า'), tags: ['#ShortVideo', '#Insights'], platforms: ['instagram', 'tiktok'], type: 'reel', pillar: 'Educate', status: 'scheduled', offset: 3, time: '19:00', owner: 'priya' },
    { brand: 'baan', title: 'เบื้องหลังครัว: เตรียมวัตถุดิบเช้าวันเสาร์', body: th('ตลาดตอนตี 5 กับเชฟของเรา 🐟\n\nกว่าจะมาเป็นจานหนึ่ง เริ่มจากเลือกวัตถุดิบที่ดีที่สุด'), tags: ['#BehindTheScenes', '#BaanThai'], platforms: ['tiktok', 'instagram'], type: 'reel', pillar: 'Behind the scenes', status: 'scheduled', offset: 4, time: '07:30', owner: 'mint' },
    { brand: 'studio', title: 'แชร์เทมเพลตปฏิทินคอนเทนต์ฟรี', body: th('เทมเพลตที่ทีมเราใช้จริง ใช้ได้ทั้ง Google Sheets และ Excel\n\nทักคำว่า “PLANNER” เพื่อรับไฟล์'), tags: ['#FreeTemplate', '#ContentCalendar', '#SocialMK'], platforms: ['facebook', 'linkedin', 'x'], type: 'carousel', pillar: 'Community', status: 'scheduled', offset: 5, time: '09:00', owner: 'thanakrit' },
    { brand: 'academy', title: 'รีวิวผู้เรียนรุ่น 11', body: th('“ได้ frameworks ที่ใช้ได้จริงในงานเลยค่ะ อาจารย์ตอบละเอียดมาก”\n\n— คุณนิว Marketing Executive'), tags: ['#UAREAAcademy', '#รีวิว'], platforms: ['facebook', 'instagram'], type: 'image', pillar: 'Social proof', status: 'draft', offset: 6, time: '12:00', owner: 'priya' },
    { brand: 'studio', title: 'Q4 Planning Workshop (ลูกค้าเท่านั้น)', body: th('ชวนลูกค้า UAREA ร่วมเวิร์กชอปวางแผน Q4 แบบตัวต่อตัว\n\nรับจำนวนจำกัด 8 แบรนด์'), tags: ['#Workshop', '#UAREAStudio'], platforms: ['linkedin', 'facebook'], type: 'image', pillar: 'Community', status: 'review', offset: 7, time: '11:00', owner: 'ariya' },
    { brand: 'baan', title: 'โปรครอบครัววันอาทิตย์', body: th('ชุดครอบครัว 4 ท่าน 1,290.- พร้อมของหวาน\n\nทุกวันอาทิตย์ 11:00–15:00'), tags: ['#BaanThai', '#โปรครอบครัว'], platforms: ['facebook', 'line', 'instagram'], type: 'image', pillar: 'Promote', status: 'scheduled', offset: 8, time: '10:30', owner: 'mint' },
    { brand: 'studio', title: 'Case study: แบรนด์ความงามโต 3 เท่าใน 6 เดือน', body: th('เราเล่าทั้งกระบวนการ ตั้งแต่ audit, วาง pillars, ไปจนถึงการวัดผล\n\nอ่านฉบับเต็มได้ในบล็อก'), tags: ['#CaseStudy', '#SocialMedia'], platforms: ['linkedin', 'facebook'], type: 'carousel', pillar: 'Educate', status: 'draft', offset: 9, time: '08:30', owner: 'thanakrit' },
    { brand: 'academy', title: 'Live Q&A กับทีมโค้ช', body: th('ถามได้ทุกเรื่องเกี่ยวกับการวางแผนคอนเทนต์\n\nพุธนี้ 20:00 ทาง Facebook Live'), tags: ['#LiveQA', '#UAREAAcademy'], platforms: ['facebook', 'tiktok'], type: 'live', pillar: 'Community', status: 'scheduled', offset: 10, time: '20:00', owner: 'priya' },
    { brand: 'studio', title: 'เปิดรับสมัคร Social Media Executive 2 อัตรา', body: th('อยากทำงานกับแบรนด์ที่หลากหลาย และมีเครื่องมือดี ๆ ให้ใช้? เรากำลังมองหาคุณ\n\nส่งพอร์ตโฟลิโอมาที่ hello@uarea.in'), tags: ['#Hiring', '#UAREAStudio'], platforms: ['linkedin', 'facebook'], type: 'image', pillar: 'Community', status: 'scheduled', offset: 12, time: '09:00', owner: 'ariya' },
    { brand: 'baan', title: 'เมนูใหม่: ของหวานหน้าร้อน', body: th('บัวลอยน้ำขิงและไอศกรีมกะทิ สูตรใหม่จากครัวเรา'), tags: ['#BaanThai', '#ของหวาน'], platforms: ['instagram', 'tiktok'], type: 'reel', pillar: 'Showcase', status: 'draft', offset: 13, time: '15:00', owner: 'mint' },
    { brand: 'studio', title: 'สรุปเทรนด์โซเชียลเดือนนี้', body: th('5 เทรนด์ที่แบรนด์ไทยควรจับตา พร้อมตัวอย่างจริงจากแบรนด์ที่ทำได้ดี'), tags: ['#Trends', '#MonthlyReport'], platforms: ['facebook', 'linkedin', 'instagram'], type: 'carousel', pillar: 'Educate', status: 'scheduled', offset: 15, time: '09:30', owner: 'nattapong' },
    { brand: 'academy', title: 'Early bird คอร์สเดือนธันวาคม', body: th('สมัครก่อน 25 พ.ย. ลด 25% พร้อมเทมเพลตวางแผน 1 ปี'), tags: ['#EarlyBird', '#UAREAAcademy'], platforms: ['facebook', 'instagram', 'line'], type: 'image', pillar: 'Promote', status: 'scheduled', offset: 17, time: '12:00', owner: 'thanakrit' },
    { brand: 'studio', title: 'ขอบคุณ 2026: ปีที่เราโตไปด้วยกัน', body: th('จากทีม 6 คน สู่ 14 คน และลูกค้าอีก 23 แบรนด์\n\nขอบคุณที่ไว้ใจเรา 🙏'), tags: ['#ThankYou', '#UAREAStudio'], platforms: ['facebook', 'instagram', 'linkedin'], type: 'image', pillar: 'Community', status: 'draft', offset: 20, time: '18:00', owner: 'ariya' },
  ];

  const ownerIds: Record<string, string> = {
    ariya: userIds.ariya,
    thanakrit: userIds.thanakrit,
    priya: userIds.priya,
    nattapong: userIds.nattapong,
    mint: userIds.mint,
    pink: userIds.pink,
  };

  const insertPost = prepare(
    `INSERT INTO posts (id, workspace_id, brand_id, title, body, hashtags, platforms, media, status, content_type, pillar, scheduled_at, published_at, owner_id, campaign_id, ai_generated, notes, metrics, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const allSeeds: Array<PostSeed & { ws: string }> = [
    ...published.map((p) => ({ ...p, ws: wsU })),
    ...upcoming.map((p) => ({ ...p, ws: wsU })),
  ];

  const postRng = mulberry32(424242);
  for (const p of allSeeds) {
    const brand = brandIds[p.brand];
    const date = addDays(today, p.offset);
    const scheduledAt = `${date}T${p.time}:00+07:00`;
    const media =
      p.asset !== undefined
        ? JSON.stringify([{ type: 'ai', url: `/media/assets/${assetIds[p.asset]}.svg`, alt: p.title }])
        : '[]';
    let metrics: Record<string, number> = {};
    if (p.status === 'published') {
      const impressions = Math.round(3200 + postRng() * 26000);
      metrics = {
        impressions,
        reach: Math.round(impressions * (0.62 + postRng() * 0.12)),
        engagements: Math.round(impressions * (0.02 + postRng() * 0.05)),
        likes: Math.round(impressions * (0.015 + postRng() * 0.03)),
        comments: Math.round(6 + postRng() * 88),
        shares: Math.round(3 + postRng() * 55),
        saves: Math.round(8 + postRng() * 120),
        clicks: Math.round(impressions * (0.008 + postRng() * 0.02)),
      };
    }
    insertPost.run(
      id('pst'),
      p.ws,
      brand,
      p.title,
      p.body,
      JSON.stringify(p.tags),
      JSON.stringify(p.platforms),
      media,
      p.status,
      p.type,
      p.pillar,
      scheduledAt,
      p.status === 'published' ? scheduledAt : null,
      ownerIds[p.owner],
      p.campaign ? campaignIds[p.campaign] : null,
      p.owner === 'priya' && (p.type === 'reel' || p.pillar === 'Educate') ? 1 : 0,
      '',
      JSON.stringify(metrics),
      new Date(Date.now() - Math.abs(p.offset) * 86400000).toISOString(),
      new Date(Date.now() - Math.abs(p.offset) * 86400000 + 3600000).toISOString(),
    );
  }

  const extraPosts: Array<{ ws: string; brand: string; title: string; body: string; tags: string[]; platforms: string[]; type: string; pillar: string; status: string; offset: number; time: string; owner: string; campaign?: string; metrics?: Record<string, number> }> = [
    {
      ws: wsB,
      brand: 'baanriverside',
      title: 'Sunset Session ทุกศุกร์นี้',
      body: 'ดนตรีอะคูสติกเบา ๆ ริมน้ำ เริ่ม 17:30 เป็นต้นไป\n\nจองโต๊ะริมน้ำทาง LINE OA',
      tags: ['#BaanThaiRiverside', '#SunsetSession'],
      platforms: ['facebook', 'instagram'],
      type: 'image',
      pillar: 'Promote',
      status: 'published',
      offset: -3,
      time: '16:30',
      owner: 'mint',
      campaign: 'riverside',
      metrics: { impressions: 18400, reach: 12100, engagements: 1420, likes: 980, comments: 64, shares: 38, saves: 92, clicks: 310 },
    },
    {
      ws: wsB,
      brand: 'baanriverside',
      title: 'ลอยกระทงริมน้ำ 24 พ.ย.',
      body: 'ชุดอาหารพิเศษ 599.- ต่อท่าน พร้อมกระทงสำหรับลอย\n\nรับจำนวนจำกัด 80 ท่าน',
      tags: ['#ลอยกระทง', '#BaanThaiRiverside'],
      platforms: ['facebook', 'instagram', 'line'],
      type: 'image',
      pillar: 'Promote',
      status: 'scheduled',
      offset: 2,
      time: '18:00',
      owner: 'mint',
    },
    {
      ws: wsB,
      brand: 'baanriverside',
      title: 'เบื้องหลังการเตรียมโต๊ะริมน้ำ',
      body: 'ทีมงานเริ่มจัดโต๊ะตั้งแต่ 15:00 เพื่อให้ทุกท่านได้วิวสวยที่สุด',
      tags: ['#BehindTheScenes', '#BaanThaiRiverside'],
      platforms: ['tiktok', 'instagram'],
      type: 'reel',
      pillar: 'Behind the scenes',
      status: 'draft',
      offset: 6,
      time: '17:00',
      owner: 'mint',
    },
    {
      ws: wsN,
      brand: 'nova',
      title: 'ดูแลผิวก่อนเข้าฤดูหนาว',
      body: '3 ขั้นตอนดูแลผิวที่คลินิกแนะนำ\n\nปรึกษาแพทย์ฟรีก่อนตัดสินใจ',
      tags: ['#NovaClinic', '#ผิวสุขภาพดี'],
      platforms: ['instagram', 'tiktok'],
      type: 'carousel',
      pillar: 'Educate',
      status: 'published',
      offset: -4,
      time: '19:30',
      owner: 'pink',
      campaign: 'novabrand',
      metrics: { impressions: 24600, reach: 18300, engagements: 2310, likes: 1740, comments: 96, shares: 122, saves: 288, clicks: 402 },
    },
    {
      ws: wsN,
      brand: 'nova',
      title: 'รีวิวจากคุณลูกค้า: Nova Glow',
      body: '“ผิวดูกระจ่างขึ้นหลังดูแลต่อเนื่อง 3 ครั้ง ทีมแพทย์อธิบายละเอียดมากค่ะ”',
      tags: ['#NovaClinic', '#รีวิว'],
      platforms: ['instagram', 'facebook'],
      type: 'image',
      pillar: 'Social proof',
      status: 'published',
      offset: -12,
      time: '12:30',
      owner: 'pink',
      metrics: { impressions: 15200, reach: 10800, engagements: 1180, likes: 860, comments: 74, shares: 52, saves: 142, clicks: 208 },
    },
    {
      ws: wsN,
      brand: 'nova',
      title: 'เปิดรับคิวตรวจพฤศจิกายน',
      body: 'จองคิวออนไลน์ได้แล้ววันนี้ เลือกแพทย์และเวลาที่สะดวก',
      tags: ['#NovaClinic', '#จองคิว'],
      platforms: ['line', 'instagram'],
      type: 'image',
      pillar: 'Promote',
      status: 'scheduled',
      offset: 4,
      time: '10:00',
      owner: 'pink',
    },
  ];
  for (const p of extraPosts) {
    insertPost.run(
      id('pst'),
      p.ws,
      brandIds[p.brand],
      p.title,
      p.body,
      JSON.stringify(p.tags),
      JSON.stringify(p.platforms),
      '[]',
      p.status,
      p.type,
      p.pillar,
      `${addDays(today, p.offset)}T${p.time}:00+07:00`,
      p.status === 'published' ? `${addDays(today, p.offset)}T${p.time}:00+07:00` : null,
      ownerIds[p.owner],
      p.campaign ? campaignIds[p.campaign] : null,
      1,
      '',
      JSON.stringify(p.metrics ?? {}),
      new Date(Date.now() - Math.abs(p.offset) * 86400000).toISOString(),
      new Date(Date.now() - Math.abs(p.offset) * 86400000).toISOString(),
    );
  }

  /* ---------------- contacts ---------------- */
  const contacts: Array<[string, string, string, string, string[], string, number, string, string, number, string]> = [
    ['customer', 'ณัฐชา พงษ์พันธ์', 'natcha.p@gmail.com', 'instagram', ['ลูกค้าประจำ', 'Bangkok'], 'Instagram DM', 48200, 'granted', 'positive', 88, 'ซื้อ Glow Package ครั้งที่ 3'],
    ['customer', 'วรพล ตั้งใจดี', 'worapon.t@gmail.com', 'facebook', ['B2B', 'Open House'], 'Lead form', 120000, 'granted', 'positive', 91, 'สนใจแพ็กเกจ retainer 6 เดือน'],
    ['prospect', 'กมลชนก สุขเจริญ', 'k.sukjaroen@outlook.com', 'tiktok', ['สนใจคอร์ส'], 'TikTok lead', 0, 'granted', 'neutral', 64, 'ดาวน์โหลดเทมเพลต PLANNER'],
    ['customer', 'ธัญญา เรืองศรี', 'tanya.r@gmail.com', 'line', ['VIP', 'Bangkok'], 'LINE OA', 86000, 'granted', 'positive', 94, 'ใช้บริการต่อเนื่อง 14 เดือน'],
    ['prospect', 'ปวีณา อารีย์กุล', 'paweena.a@gmail.com', 'instagram', ['ความงาม'], 'IG campaign', 0, 'granted', 'neutral', 58, 'สอบถามโปรโมชั่นพฤศจิกายน'],
    ['prospect', 'สรวิชญ์ ใจกล้า', 'sorawit@company.co.th', 'linkedin', ['Enterprise'], 'LinkedIn Ads', 0, 'granted', 'neutral', 71, 'ขอเดโม SocialMK'],
    ['customer', 'อรุณี มากมี', 'arunee.m@gmail.com', 'facebook', ['ครอบครัว', 'นนทบุรี'], 'Facebook Ads', 32000, 'granted', 'positive', 79, 'จองโต๊ะลอยกระทง'],
    ['prospect', 'ชญานิศ วงศ์ทอง', 'chayanit.w@gmail.com', 'tiktok', ['Gen Z'], 'TikTok organic', 0, 'granted', 'neutral', 47, 'คอมเมนต์ถามเมนู'],
    ['customer', 'ภาณุวัฒน์ ศรีสมบัติ', 'panuwat.s@gmail.com', 'facebook', ['B2B', 'Retainer'], 'Referral', 240000, 'granted', 'positive', 96, 'ต่อสัญญาปีหน้าแล้ว'],
    ['prospect', 'มณีรัตน์ ทองดี', 'maneerat.t@gmail.com', 'line', ['Bangkok'], 'LINE broadcast', 0, 'granted', 'neutral', 52, 'กดลิงก์โปรกลางสัปดาห์'],
    ['prospect', 'ธีรภัทร์ วัฒนา', 'teerapat.w@gmail.com', 'x', ['Tech'], 'X reply', 0, 'granted', 'neutral', 43, 'พูดถึง SocialMK ในคอมเมนต์'],
    ['customer', 'ศิริพร แก้วมณี', 'siriporn.k@gmail.com', 'instagram', ['VIP'], 'Instagram DM', 71000, 'granted', 'positive', 85, 'อัปเกรดแพ็กเกจ'],
    ['prospect', 'นภัสสร บุญมี', 'napassorn.b@gmail.com', 'facebook', ['ครอบครัว'], 'Facebook Ads', 0, 'granted', 'neutral', 55, 'กรอกฟอร์มจองโต๊ะไม่สำเร็จ'],
    ['prospect', 'เจษฎา รักดี', 'jessada.r@gmail.com', 'youtube', ['วิดีโอ'], 'YouTube', 0, 'granted', 'neutral', 39, 'ดูวิดีโอครบ 3 ตอน'],
    ['customer', 'พิมพ์ชนก เอี่ยมสอาด', 'pimchanok.e@gmail.com', 'line', ['Bangkok', 'ลูกค้าประจำ'], 'LINE OA', 39000, 'granted', 'positive', 77, 'สั่งเดลิเวอรี 6 ครั้ง/เดือน'],
    ['prospect', 'กิตติศักดิ์ พูลสุข', 'kittisak.p@gmail.com', 'instagram', ['ความงาม'], 'IG campaign', 0, 'granted', 'neutral', 61, 'ขอใบเสนอราคา'],
    ['prospect', 'ณิชา สุวรรณโชติ', 'nicha.s@gmail.com', 'tiktok', ['Gen Z'], 'TikTok Ads', 0, 'granted', 'neutral', 49, 'กดลิงก์ไบโอ'],
    ['customer', 'วีรยุทธ์ จันทร์ทอง', 'weerayut.j@gmail.com', 'facebook', ['B2B'], 'Referral', 168000, 'granted', 'positive', 82, 'ต่ออายุบริการ'],
    ['prospect', 'สุนิสา บัวหลวง', 'sunisa.b@gmail.com', 'line', [], 'LINE OA', 0, 'revoked', 'neutral', 30, 'ขอยกเลิกการรับข่าวสาร (PDPA)'],
    ['prospect', 'อภิสิทธิ์ เก่งกาจ', 'apisit.k@gmail.com', 'linkedin', ['Enterprise'], 'LinkedIn Ads', 0, 'granted', 'neutral', 68, 'นัดประชุมสัปดาห์หน้า'],
    ['customer', 'จุฑามาศ พรหมมา', 'juthamas.p@gmail.com', 'instagram', ['VIP', 'Bangkok'], 'Instagram DM', 92000, 'granted', 'positive', 89, 'ซื้อแพ็กเกจใหญ่'],
    ['prospect', 'รุ่งโรจน์ ทองคำ', 'rungroj.t@gmail.com', 'facebook', [], 'Facebook Ads', 0, 'granted', 'negative', 27, 'คอมเมนต์เรื่องเวลารอ'],
    ['prospect', 'เบญจวรรณ สายทอง', 'benjawan.s@gmail.com', 'tiktok', ['Gen Z'], 'TikTok organic', 0, 'granted', 'neutral', 51, 'แชร์คลิป 2 ครั้ง'],
    ['customer', 'ศุภชัย ปิ่นทอง', 'supachai.p@gmail.com', 'line', ['ลูกค้าประจำ'], 'LINE OA', 28000, 'granted', 'positive', 73, 'ใช้คูปองส่วนลด'],
    ['prospect', 'อารยา ใจงาม', 'araya.j@gmail.com', 'instagram', ['ความงาม'], 'IG campaign', 0, 'granted', 'neutral', 57, 'สอบถามโปรแกรมผิว'],
    ['prospect', 'ทวีศักดิ์ นาคทอง', 'thaweesak.n@gmail.com', 'facebook', ['B2B'], 'Facebook Ads', 0, 'granted', 'neutral', 62, 'ขอเอกสารบริษัท'],
    ['customer', 'นันทิดา ชื่นบาน', 'nantida.c@gmail.com', 'instagram', ['VIP'], 'Instagram DM', 64000, 'granted', 'positive', 84, 'แนะนำเพื่อนมาอีก 2 คน'],
    ['prospect', 'พิชญ์สินี แสนสุข', 'pitsinee.s@gmail.com', 'tiktok', [], 'TikTok Ads', 0, 'granted', 'neutral', 45, 'กดลิงก์แต่ยังไม่ซื้อ'],
    ['prospect', 'ภูมิพัฒน์ ตั้งมั่น', 'poomipat.t@gmail.com', 'linkedin', ['Enterprise'], 'LinkedIn organic', 0, 'granted', 'neutral', 66, 'ติดตามบริษัทครบ 3 เดือน'],
    ['customer', 'กัลยา อินทร์ทอง', 'kanlaya.i@gmail.com', 'line', ['Bangkok'], 'LINE OA', 45000, 'granted', 'positive', 78, 'อัปเกรดแพ็กเกจ'],
    ['prospect', 'ชัยวัฒน์ ใจเย็น', 'chaiwat.j@gmail.com', 'x', ['Tech'], 'X reply', 0, 'granted', 'neutral', 41, 'ถามเรื่อง API'],
    ['prospect', 'ปาริชาติ ทวีสุข', 'parichat.t@gmail.com', 'facebook', [], 'Facebook Ads', 0, 'granted', 'neutral', 54, 'กรอกฟอร์มรับเทมเพลต'],
    ['customer', 'อิทธิพงษ์ มั่นคง', 'ittipol.m@gmail.com', 'facebook', ['B2B'], 'Referral', 320000, 'granted', 'positive', 93, 'ลูกค้ารายใหญ่สุดของไตรมาส'],
    ['prospect', 'สุดารัตน์ ใจดี', 'sudarat.j@gmail.com', 'instagram', ['ความงาม'], 'IG campaign', 0, 'granted', 'neutral', 53, 'บันทึกโพสต์ไว้'],
    ['prospect', 'กรณ์ ศรีวิไล', 'korn.s@gmail.com', 'tiktok', ['Gen Z'], 'TikTok organic', 0, 'granted', 'neutral', 48, 'ติดตาม 1 เดือน'],
    ['customer', 'ลักษณ์ จันทร์แจ่ม', 'lux.c@gmail.com', 'line', ['VIP', 'Bangkok'], 'LINE OA', 118000, 'granted', 'positive', 90, 'ซื้อแพ็กเกจรายปี'],
    ['prospect', 'วรรณิศา พูลผล', 'wannisa.p@gmail.com', 'facebook', ['ครอบครัว'], 'Facebook Ads', 0, 'granted', 'neutral', 59, 'จองโต๊ะแล้วยกเลิก'],
    ['prospect', 'ณัฐพล แก้วใส', 'nattapol.k@gmail.com', 'youtube', [], 'YouTube', 0, 'granted', 'neutral', 36, 'ดูรีวิวสินค้า'],
    ['prospect', 'ริญญาภัทร์ สมใจ', 'rinya.s@gmail.com', 'instagram', ['ความงาม'], 'IG campaign', 0, 'granted', 'neutral', 56, 'สอบถามรอบให้บริการ'],
    ['customer', 'ประภาส วงศ์ใหญ่', 'prapas.w@gmail.com', 'facebook', ['B2B', 'Retainer'], 'Referral', 210000, 'granted', 'positive', 87, 'แนะนำบริการให้พาร์ตเนอร์'],
  ];
  const contactInsert = prepare(
    `INSERT INTO contacts (id, workspace_id, type, name, email, phone, platform, handle, tags, source, ltv, consent, sentiment, score, last_interaction_at, note, created_at)
     VALUES (?, ?, ?, ?, ?, NULL, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const [type, name, email, platform, tags, source, ltv, consent, sentiment, score, note] of contacts) {
    contactInsert.run(
      id('cnt'),
      wsU,
      type,
      name,
      email,
      platform,
      JSON.stringify(tags),
      source,
      ltv,
      consent,
      sentiment,
      score,
      new Date(Date.now() - Math.round(Math.random() * 20) * 86400000).toISOString(),
      note,
      new Date(Date.now() - Math.round(30 + Math.random() * 200) * 86400000).toISOString(),
    );
  }

  /* ---------------- team / invites / API ---------------- */
  run(
    `INSERT INTO invites (id, workspace_id, email, role, status, token, invited_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id('inv'), wsU, 'neweditor@uarea.in', 'editor', 'pending', randomToken(12), userIds.thanakrit, new Date(Date.now() - 2 * 86400000).toISOString()],
  );
  run(
    `INSERT INTO invites (id, workspace_id, email, role, status, token, invited_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id('inv'), wsU, 'freelance.art@studio.co', 'editor', 'expired', randomToken(12), userIds.priya, new Date(Date.now() - 20 * 86400000).toISOString()],
  );

  const apiKeyRaw = `smk_live_${randomToken(18).replace(/[^a-zA-Z0-9]/g, '').slice(0, 24)}`;
  run(
    `INSERT INTO api_keys (id, workspace_id, name, prefix, key_hash, scopes, created_by, created_at, last_used_at, revoked_at, request_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
    [
      id('key'),
      wsU,
      'Zapier — Lead sync',
      apiKeyRaw.slice(0, 16),
      hashApiKey(apiKeyRaw),
      JSON.stringify(['posts:read', 'contacts:read', 'analytics:read']),
      userIds.thanakrit,
      new Date(Date.now() - 30 * 86400000).toISOString(),
      new Date(Date.now() - 3 * 3600000).toISOString(),
      1482,
    ],
  );
  run(
    `INSERT INTO api_keys (id, workspace_id, name, prefix, key_hash, scopes, created_by, created_at, last_used_at, revoked_at, request_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id('key'),
      wsU,
      'Looker Studio connector',
      'smk_live_4e91c2',
      hashApiKey(`smk_live_4e91c2_${randomToken(12)}`),
      JSON.stringify(['analytics:read', 'posts:read']),
      userIds.nattapong,
      new Date(Date.now() - 74 * 86400000).toISOString(),
      new Date(Date.now() - 19 * 86400000).toISOString(),
      new Date(Date.now() - 19 * 86400000).toISOString(),
      326,
    ],
  );

  run(
    `INSERT INTO webhooks (id, workspace_id, url, events, secret, active, last_delivery_at, created_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
    [
      id('whk'),
      wsU,
      'https://hooks.zapier.com/hooks/catch/1823901/uarea-leads/',
      JSON.stringify(['post.published', 'contact.created', 'campaign.budget_threshold']),
      randomToken(16),
      new Date(Date.now() - 45 * 60000).toISOString(),
      new Date(Date.now() - 40 * 86400000).toISOString(),
    ],
  );
  run(
    `INSERT INTO webhooks (id, workspace_id, url, events, secret, active, last_delivery_at, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
    [
      id('whk'),
      wsU,
      'https://api.line.me/v2/bot/message/push',
      JSON.stringify(['report.ready']),
      randomToken(16),
      null,
      new Date(Date.now() - 60 * 86400000).toISOString(),
    ],
  );

  const logPaths = [
    ['GET', '/api/v1/analytics/summary', 200],
    ['GET', '/api/v1/posts', 200],
    ['POST', '/api/v1/contacts', 201],
    ['GET', '/api/v1/campaigns', 200],
    ['GET', '/api/v1/analytics/summary', 200],
    ['GET', '/api/v1/posts', 200],
    ['GET', '/api/v1/contacts', 429],
    ['GET', '/api/v1/analytics/summary', 200],
    ['POST', '/api/v1/posts', 201],
    ['GET', '/api/v1/reports/export', 200],
    ['GET', '/api/v1/analytics/summary', 401],
    ['GET', '/api/v1/posts', 200],
  ] as const;
  const logRng = mulberry32(9182);
  for (let i = 0; i < 36; i++) {
    const [method, pathName, status] = logPaths[i % logPaths.length];
    run(
      `INSERT INTO api_logs (id, workspace_id, key_id, method, path, status, latency_ms, at) VALUES (?, ?, NULL, ?, ?, ?, ?, ?)`,
      [
        id('log'),
        wsU,
        method,
        pathName,
        status,
        Math.round(28 + logRng() * 320),
        new Date(Date.now() - i * 1000 * 60 * 47 - logRng() * 60000).toISOString(),
      ],
    );
  }

  /* ---------------- activity ---------------- */
  const activitySeeds: Array<[string, string, string, string]> = [
    ['priya', 'post.published', 'Open House 2026 — Studio Launch', 'เผยแพร่บน Facebook, Instagram, LinkedIn'],
    ['thanakrit', 'campaign.updated', 'Always-on Retargeting', 'ปรับงบประมาณจาก ฿40,000 เป็น ฿45,000'],
    ['ariya', 'member.invited', 'neweditor@uarea.in', 'เชิญเข้าร่วมเป็น Editor'],
    ['nattapong', 'report.exported', 'รายงานประจำเดือนตุลาคม', 'ส่งออก CSV ผ่าน API'],
    ['priya', 'asset.generated', 'ลอยกระทงนี้ พบกันที่ริเวอร์ไซด์', 'สร้างภาพด้วย AI Studio'],
    ['mint', 'post.scheduled', 'โปรครอบครัววันอาทิตย์', 'ตั้งเวลา 8 พ.ย. 10:30'],
    ['thanakrit', 'connection.synced', 'YouTube — UAREA Studio', 'ซิงก์ข้อมูล 90 วันสำเร็จ'],
    ['nattapong', 'insight.generated', 'UAREA Studio', 'สรุปประสิทธิภาพรายสัปดาห์'],
    ['ariya', 'apikey.created', 'Looker Studio connector', 'ขอบเขต analytics:read'],
    ['priya', 'post.submitted', 'Q4 Planning Workshop', 'ส่งขออนุมัติจาก Admin'],
    ['thanakrit', 'connection.expiring', 'X (Twitter) — UAREA Digital', 'โทเคนหมดอายุใน 3 วัน'],
    ['nattapong', 'contact.imported', 'รายชื่อจากงาน Open House', 'นำเข้า 42 รายชื่อ พร้อม consent'],
  ];
  activitySeeds.forEach(([user, action, target, detail], index) => {
    run(
      `INSERT INTO activity (id, workspace_id, user_id, action, target, detail, at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id('act'),
        wsU,
        ownerIds[user],
        action,
        target,
        detail,
        new Date(Date.now() - index * 1000 * 60 * 97 - 1000 * 60 * 5).toISOString(),
      ],
    );
  });
}

if (process.argv[1] && process.argv[1].endsWith('seed.ts')) {
  seedDatabase(process.argv.includes('--force'));
  console.log('Seed complete');
}
