/**
 * SocialMK AI engine (Beta).
 * Deterministic, dependency-free generators for marketing copy, content plans,
 * insight summaries and on-brand cover artwork (SVG).
 * The interfaces mirror what a hosted LLM/image model would expose, so swapping in a
 * provider later is a matter of replacing the implementations below.
 */

export type Lang = 'th' | 'en';

export interface CopyBrief {
  brandName: string;
  industry?: string;
  audience?: string;
  tone?: string;
  platform: string;
  objective: 'awareness' | 'engagement' | 'conversion' | 'education' | 'community';
  language: Lang;
  keywords?: string;
  offer?: string;
  product?: string;
}

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length];
}

const PLATFORM_GUIDE: Record<string, { best: string[]; limit: number; label: string }> = {
  facebook: { best: ['09:00', '12:30', '20:00'], limit: 2200, label: 'Facebook' },
  instagram: { best: ['11:30', '18:00', '21:00'], limit: 2200, label: 'Instagram' },
  tiktok: { best: ['07:30', '19:00', '22:00'], limit: 2200, label: 'TikTok' },
  line: { best: ['08:30', '12:00', '18:30'], limit: 800, label: 'LINE OA' },
  linkedin: { best: ['08:00', '10:00', '17:30'], limit: 3000, label: 'LinkedIn' },
  x: { best: ['07:00', '12:00', '21:30'], limit: 280, label: 'X' },
  youtube: { best: ['18:00', '20:00'], limit: 5000, label: 'YouTube' },
  threads: { best: ['10:00', '19:00'], limit: 500, label: 'Threads' },
};

const OBJECTIVE_LABEL: Record<CopyBrief['objective'], { th: string; en: string }> = {
  awareness: { th: 'สร้างการรับรู้', en: 'Awareness' },
  engagement: { th: 'กระตุ้นการมีส่วนร่วม', en: 'Engagement' },
  conversion: { th: 'ปิดการขาย', en: 'Conversion' },
  education: { th: 'ให้ความรู้', en: 'Education' },
  community: { th: 'สร้างชุมชน', en: 'Community' },
};

const TH_HOOKS = [
  'หลายคนยังเข้าใจผิดว่า {topic} เป็นเรื่องยาก',
  'ถ้าคุณกำลังมองหา {topic} ที่ตอบโจทย์จริง ๆ บทความนี้มีคำตอบ',
  'คำถามที่เราเจอบ่อยที่สุดในสัปดาห์นี้คือ “{topic} เริ่มยังไง?”',
  '3 สิ่งที่ทีมเราเรียนรู้จากการทำ {topic} ในปีนี้',
  'ไม่ต้องรอให้พร้อม 100% ถึงจะเริ่ม {topic}',
  'รู้หรือไม่? ลูกค้าของเรากว่า 7 ใน 10 เลือก {topic} เพราะเหตุผลนี้',
];

const TH_BODY_OPENERS = [
  'เราสรุปมาให้แบบเข้าใจง่ายใน 30 วินาที',
  'จากประสบการณ์ที่ทำงานกับลูกค้ามากกว่า 120 แบรนด์ เราพบว่าสิ่งที่สำคัญที่สุดคือ',
  'นี่คือวิธีที่เราใช้กับแบรนด์ของตัวเอง และได้ผลจริง',
  'เริ่มจากจุดเล็ก ๆ ที่ทำได้ทันที',
];

const TH_CTAS: Record<CopyBrief['objective'], string[]> = {
  awareness: ['บันทึกโพสต์นี้ไว้ แล้วกลับมาอ่านอีกครั้ง', 'แชร์ให้เพื่อนที่กำลังเจอเรื่องเดียวกัน'],
  engagement: ['คอมเมนต์คำตอบของคุณไว้เลย 👇', 'เลือกข้อที่ใช่สำหรับคุณ: 1, 2 หรือ 3?'],
  conversion: ['ทักแชทวันนี้ รับข้อเสนอพิเศษถึงสิ้นเดือน', 'กดลิงก์ในไบโอเพื่อจองคิว'],
  education: ['เซฟไว้ใช้ตอนวางแผนงานครั้งหน้า', 'อยากได้เทมเพลตฟรี? ทักคำว่า “TEMPLATE”'],
  community: ['มาเล่าประสบการณ์ของคุณให้ฟังหน่อย', 'แท็กคนที่คุณอยากไปด้วยกัน'],
};

const EN_HOOKS = [
  'Most brands get {topic} backwards — here is what actually works.',
  'If you are still guessing at {topic}, start with this.',
  'The question we hear every week: “how do we begin with {topic}?”',
  'Three things we learned building {topic} this year.',
  'You do not need to be 100% ready to start {topic}.',
  '7 out of 10 of our clients choose this approach to {topic}.',
];

const EN_BODY_OPENERS = [
  'Here is the 30-second version.',
  'After 120+ brand engagements, the pattern is clear:',
  'This is the exact approach we use on our own brand — and it works.',
  'Start with one small move you can ship today.',
];

const EN_CTAS: Record<CopyBrief['objective'], string[]> = {
  awareness: ['Save this for your next planning session.', 'Share it with someone facing the same problem.'],
  engagement: ['Drop your answer in the comments 👇', 'Which one are you: 1, 2 or 3?'],
  conversion: ['Message us today — this offer ends soon.', 'Tap the link in bio to book your slot.'],
  education: ['Save this for your next planning cycle.', 'Want the free template? DM us “TEMPLATE”.'],
  community: ['Tell us your experience below.', 'Tag someone you would bring along.'],
};

const TH_BULLETS = [
  'เริ่มจากเป้าหมายทางธุรกิจ ไม่ใช่จากแพลตฟอร์ม',
  'วัดผลด้วยตัวเลขที่ผูกกับรายได้ ไม่ใช่แค่ยอดไลก์',
  'วางแผนล่วงหน้า 2 สัปดาห์ เพื่อให้ทีมมีพื้นที่คิดสร้างสรรค์',
  'ฟังเสียงลูกค้าจริง แล้วนำกลับมาเป็นวัตถุดิบคอนเทนต์',
  'ทำซ้ำในสิ่งที่ได้ผล แทนการเริ่มใหม่ทุกเดือน',
  'เก็บ بياناتทุกแพลตฟอร์มไว้ที่เดียว เพื่อเทียบผลได้เป็นกลาง',
];

const EN_BULLETS = [
  'Start from the business goal, not the platform.',
  'Measure numbers tied to revenue, not vanity likes.',
  'Plan two weeks ahead so the team has room to create.',
  'Mine real customer questions for content.',
  'Repeat what works instead of restarting every month.',
  'Keep every platform’s data in one place for a fair comparison.',
];

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

function slugTag(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .slice(0, 24);
}

function hashtagsFor(brief: CopyBrief, seed: number): string[] {
  const base = [
    slugTag(brief.brandName),
    slugTag(brief.product || brief.industry || 'Brand'),
    ...(brief.keywords ?? '')
      .split(/[,\s]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(slugTag),
  ].filter(Boolean);
  const extrasTh = ['การตลาดออนไลน์', 'ธุรกิจไทย', 'คอนเทนต์คุณภาพ', 'SocialMK'];
  const extrasEn = ['SocialMarketing', 'BrandStrategy', 'ContentThatWorks', 'SocialMK'];
  const extras = brief.language === 'th' ? extrasTh : extrasEn;
  const merged = [...new Set([...base, ...extras.slice(seed % 2, (seed % 2) + 2), 'SocialMK'])];
  return merged.slice(0, 6).map((tag) => `#${tag}`);
}

export function generateCopy(brief: CopyBrief, variants = 3): CopyVariant[] {
  const lang = brief.language;
  const topic = (brief.keywords || brief.product || brief.industry || brief.brandName).trim();
  const platform = PLATFORM_GUIDE[brief.platform] ?? PLATFORM_GUIDE.facebook;
  const hooks = lang === 'th' ? TH_HOOKS : EN_HOOKS;
  const openers = lang === 'th' ? TH_BODY_OPENERS : EN_BODY_OPENERS;
  const bullets = lang === 'th' ? TH_BULLETS : EN_BULLETS;
  const ctas = (lang === 'th' ? TH_CTAS : EN_CTAS)[brief.objective];
  const labels =
    lang === 'th'
      ? ['สายตรง·กระชับ', 'เล่าเรื่อง·เข้าถึงใจ', 'ลิสต์·อ่านง่าย']
      : ['Direct & punchy', 'Story-led', 'Listicle'];
  const labelEn = ['Direct & punchy', 'Story-led', 'Listicle'];

  const results: CopyVariant[] = [];
  for (let v = 0; v < variants; v++) {
    const seed = hashSeed(`${brief.brandName}|${topic}|${brief.platform}|${brief.objective}|${v}`);
    const hook = pick(hooks, seed).replace('{topic}', topic);
    const opener = pick(openers, seed >> 3);
    const cta = pick(ctas, seed >> 5);
    const chosenBullets = [0, 1, 2, 3].map((i) => bullets[(seed >> i) % bullets.length]);
    const uniqueBullets = [...new Set(chosenBullets)].slice(0, 3);

    let body = '';
    if (v === 0) {
      body = `${opener}\n\n${brief.offer ? `${brief.offer}\n\n` : ''}${uniqueBullets[0]}\n\n${cta}`;
    } else if (v === 1) {
      body = `${opener}\n\nที่ ${brief.brandName} เราเชื่อว่า${topic}ควรเริ่มจากความเข้าใจลูกค้าจริง ๆ\n\n${
        brief.offer ? `${brief.offer}\n\n` : ''
      }${uniqueBullets.slice(0, 2).map((b, i) => `${i + 1}. ${b}`).join('\n')}\n\n${cta}`;
      if (lang === 'en') {
        body = `${opener}\n\nAt ${brief.brandName}, we believe ${topic} starts with really understanding your customer.\n\n${
          brief.offer ? `${brief.offer}\n\n` : ''
        }${uniqueBullets.slice(0, 2).map((b, i) => `${i + 1}. ${b}`).join('\n')}\n\n${cta}`;
      }
    } else {
      body = lang === 'th'
        ? `${uniqueBullets.slice(0, 3).map((b, i) => `${i + 1}) ${b}`).join('\n')}\n\n${
            brief.offer ? `${brief.offer}\n\n` : ''
          }${cta}`
        : `${uniqueBullets.slice(0, 3).map((b, i) => `${i + 1}) ${b}`).join('\n')}\n\n${
            brief.offer ? `${brief.offer}\n\n` : ''
          }${cta}`;
    }

    const hashtags = hashtagsFor({ ...brief, keywords: topic }, seed);
    const full = `${hook}\n\n${body}`;
    const trimmed = full.length > platform.limit ? `${full.slice(0, platform.limit - 1)}…` : full;
    results.push({
      id: `var-${v + 1}`,
      label: labelEn[v % 3],
      labelTh: labels[v % 3],
      hook,
      body: trimmed,
      hashtags,
      cta,
      charCount: trimmed.length,
      bestTime: pick(platform.best, seed >> 2),
      altText:
        lang === 'th'
          ? `ภาพประกอบโพสต์ ${platform.label} ของ ${brief.brandName} เรื่อง ${topic}`
          : `${platform.label} visual for ${brief.brandName} about ${topic}`,
      score: 68 + ((seed >> 7) % 28),
    });
  }
  return results;
}

/* ------------------------------------------------------------------ */
/* Content plan                                                        */
/* ------------------------------------------------------------------ */

export interface PlanBrief {
  brandName: string;
  brandId?: string;
  month: string; // YYYY-MM
  platforms: string[];
  postsPerWeek: number;
  language: Lang;
  objective?: CopyBrief['objective'];
  topics?: string;
}

export interface PlanItem {
  date: string;
  time: string;
  platform: string;
  pillar: string;
  title: string;
  body: string;
  contentType: string;
  hashtags: string[];
}

const PILLARS = [
  { th: 'ให้ความรู้', en: 'Educate', type: 'carousel' },
  { th: 'โปรโมชั่น', en: 'Promote', type: 'image' },
  { th: 'สินค้า/บริการ', en: 'Showcase', type: 'reel' },
  { th: 'เบื้องหลังทีม', en: 'Behind the scenes', type: 'reel' },
  { th: 'เสียงจากลูกค้า', en: 'Social proof', type: 'image' },
  { th: 'กระแส/มีม', en: 'Trend', type: 'reel' },
  { th: 'ชุมชน', en: 'Community', type: 'story' },
];

const TH_ANGLE = ['3 ข้อที่ควรรู้ก่อนเริ่ม', 'เบื้องหลังกว่าจะมาเป็น', 'ทำไมลูกค้าถึงเลือก', 'เช็กลิสต์สั้น ๆ เรื่อง', 'คำถามที่พบบ่อยเกี่ยวกับ'];
const EN_ANGLE = ['3 things to know before', 'Behind the scenes of', 'Why customers choose', 'A quick checklist for', 'FAQ about'];

export function generatePlan(brief: PlanBrief): PlanItem[] {
  const [yearStr, monthStr] = brief.month.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!year || !month) return [];
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const platforms = brief.platforms.length ? brief.platforms : ['facebook'];
  const perWeek = Math.min(Math.max(brief.postsPerWeek || 3, 1), 7);
  const gaps = Math.max(1, Math.round(7 / perWeek));
  const topics = (brief.topics || brief.brandName)
    .split(/[,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const angles = brief.language === 'th' ? TH_ANGLE : EN_ANGLE;
  const items: PlanItem[] = [];
  let counter = 0;

  for (let day = 1; day <= daysInMonth; day += gaps) {
    for (let slot = 0; slot < Math.min(platforms.length, perWeek); slot++) {
      if (items.length >= perWeek * 5) break;
      const platform = platforms[(counter + slot) % platforms.length];
      const guide = PLATFORM_GUIDE[platform] ?? PLATFORM_GUIDE.facebook;
      const seed = hashSeed(`${brief.month}|${brief.brandName}|${day}|${platform}|${counter}`);
      const pillar = PILLARS[seed % PILLARS.length];
      const topic = topics.length ? topics[(counter + day) % topics.length] : brief.brandName;
      const angle = angles[seed % angles.length];
      const title =
        brief.language === 'th' ? `${angle} ${topic}` : `${angle} ${topic}`;
      const body =
        brief.language === 'th'
          ? `${title}\n\n${pick(TH_BULLETS, seed)}\n\n${pick(TH_CTAS[brief.objective ?? 'engagement'], seed)}`
          : `${title}\n\n${pick(EN_BULLETS, seed)}\n\n${pick(EN_CTAS[brief.objective ?? 'engagement'], seed)}`;
      const date = `${brief.month}-${String(Math.min(day, daysInMonth)).padStart(2, '0')}`;
      items.push({
        date,
        time: pick(guide.best, seed >> 4),
        platform,
        pillar: pillar[brief.language],
        title,
        body,
        contentType: pillar.type,
        hashtags: hashtagsFor(
          {
            brandName: brief.brandName,
            platform,
            objective: brief.objective ?? 'engagement',
            language: brief.language,
            keywords: topic,
          },
          seed,
        ),
      });
      counter++;
    }
    if (items.length >= perWeek * 5) break;
  }
  return items.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

/* ------------------------------------------------------------------ */
/* Insight summary                                                     */
/* ------------------------------------------------------------------ */

export interface InsightInput {
  language: Lang;
  brandName: string;
  rangeDays: number;
  reach: number;
  reachDelta: number;
  engagementRate: number;
  engagementDelta: number;
  topPlatform: { platform: string; label: string; share: number };
  weakestPlatform: { platform: string; label: string; share: number };
  spend: number;
  roas: number;
  pendingPosts: number;
  expiringConnections: string[];
}

export function generateInsight(input: InsightInput): { headline: string; bullets: string[]; recommendation: string } {
  const pct = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;
  if (input.language === 'th') {
    const bullets = [
      `การเข้าถึงรวม ${input.reach.toLocaleString('th-TH')} ครั้ง (${pct(input.reachDelta)} เทียบช่วงก่อน)`,
      `อัตรามีส่วนร่วม ${input.engagementRate.toFixed(2)}% (${pct(input.engagementDelta)}) — ${
        input.engagementDelta >= 0 ? 'ดีขึ้น' : 'ต้องเฝ้าดู'
      }`,
      `${input.topPlatform.label} มีส่วนร่วมมากที่สุด ${input.topPlatform.share.toFixed(0)}% ของทั้งหมด`,
      `การใช้จ่ายโฆษณา ฿${input.spend.toLocaleString('th-TH')} ให้ผลตอบแทน ${input.roas.toFixed(2)}x`,
    ];
    if (input.pendingPosts > 0) bullets.push(`มีคอนเทนต์รออนุมัติ ${input.pendingPosts} รายการ`);
    if (input.expiringConnections.length) {
      bullets.push(`ต้องต่ออายุการเชื่อมต่อ: ${input.expiringConnections.join(', ')}`);
    }
    const recommendation =
      input.engagementDelta < 0
        ? `ลองเพิ่มคอนเทนต์วิดีโอสั้นบน ${input.topPlatform.label} และทดสอบเวลาโพสต์ 19:00–21:00 ภายในสัปดาห์หน้า`
        : `รักษาโมเมนตัมด้วยการนำคอนเทนต์ที่ได้ผลบน ${input.topPlatform.label} ไปปรับใช้กับ ${input.weakestPlatform.label} โดยเริ่มจากรูปแบบ carousel`;
    return {
      headline: `${input.brandName}: การเข้าถึง${input.reachDelta >= 0 ? 'เติบโต' : 'ชะลอตัว'} ${pct(
        input.reachDelta,
      )} ใน ${input.rangeDays} วัน`,
      bullets,
      recommendation,
    };
  }
  const bullets = [
    `Total reach ${input.reach.toLocaleString('en-US')} (${pct(input.reachDelta)} vs. previous period)`,
    `Engagement rate ${input.engagementRate.toFixed(2)}% (${pct(input.engagementDelta)}) — ${
      input.engagementDelta >= 0 ? 'trending up' : 'needs attention'
    }`,
    `${input.topPlatform.label} drives ${input.topPlatform.share.toFixed(0)}% of all engagement`,
    `Ad spend ฿${input.spend.toLocaleString('en-US')} returning ${input.roas.toFixed(2)}x`,
  ];
  if (input.pendingPosts > 0) bullets.push(`${input.pendingPosts} posts waiting for approval`);
  if (input.expiringConnections.length) bullets.push(`Connections to renew: ${input.expiringConnections.join(', ')}`);
  const recommendation =
    input.engagementDelta < 0
      ? `Add short-form video on ${input.topPlatform.label} and test posting between 19:00–21:00 next week.`
      : `Carry the winning ${input.topPlatform.label} formats over to ${input.weakestPlatform.label}, starting with carousels.`;
  return {
    headline: `${input.brandName}: reach ${input.reachDelta >= 0 ? 'grew' : 'slowed'} ${pct(
      input.reachDelta,
    )} over ${input.rangeDays} days`,
    bullets,
    recommendation,
  };
}

/* ------------------------------------------------------------------ */
/* Cover artwork (SVG)                                                 */
/* ------------------------------------------------------------------ */

export type ArtStyle = 'gradient-mesh' | 'bold-type' | 'editorial' | 'product' | 'tech-grid' | 'festive';

export interface ArtRequest {
  style: ArtStyle;
  width: number;
  height: number;
  headline: string;
  subline?: string;
  brand: string;
  badge?: string;
  color: string;
  accent?: string;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const hasSpaces = clean.includes(' ');
  const words = hasSpaces ? clean.split(' ') : Array.from(clean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = hasSpaces ? (current ? `${current} ${word}` : word) : current + word;
    if (Array.from(candidate).length > maxChars && current) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines) break;
    } else {
      current = candidate;
    }
  }
  if (lines.length < maxLines && current) lines.push(current);
  if (lines.length === maxLines && current && !lines.includes(current)) {
    const last = lines[maxLines - 1];
    if (Array.from(last).length > maxChars - 2) {
      lines[maxLines - 1] = `${Array.from(last).slice(0, maxChars - 2).join('')}…`;
    }
  }
  return lines;
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  const num = parseInt(full || '4F46E5', 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function shift(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const move = (c: number) => clamp(Math.round(c + amount), 0, 255).toString(16).padStart(2, '0');
  return `#${move(r)}${move(g)}${move(b)}`;
}

export function renderCover(req: ArtRequest): string {
  const { width, height } = req;
  const base = req.color || '#4F46E5';
  const accent = req.accent || shift(base, 70);
  const deep = shift(base, -70);
  const light = shift(base, 130);
  const shortSide = Math.min(width, height);
  const pad = Math.round(shortSide * 0.085);
  const headlineSize = Math.round(shortSide * (req.headline.length > 52 ? 0.062 : 0.078));
  const maxChars = Math.round((width - pad * 2) / (headlineSize * 0.58));
  const lines = wrap(req.headline, clamp(maxChars, 8, 30), 3);
  const textY = height - pad - (req.subline ? Math.round(headlineSize * 1.35) : 0);
  const serif = "'IBM Plex Sans Thai','Noto Sans Thai',Georgia,serif";
  const sans = "'IBM Plex Sans Thai','Noto Sans Thai',Inter,system-ui,sans-serif";

  const headlineBlock = lines
    .map(
      (line, i) =>
        `<text x="${pad}" y="${textY - (lines.length - 1 - i) * headlineSize * 1.16}" font-family="${sans}" font-size="${headlineSize}" font-weight="700" fill="#ffffff" letter-spacing="-0.5">${escapeXml(
          line,
        )}</text>`,
    )
    .join('');
  const subline = req.subline
    ? `<text x="${pad}" y="${height - pad}" font-family="${sans}" font-size="${Math.round(headlineSize * 0.44)}" fill="#ffffff" opacity="0.78">${escapeXml(
        wrap(req.subline, Math.round((width - pad * 2) / (headlineSize * 0.3)), 1)[0] ?? req.subline,
      )}</text>`
    : '';

  const brandLock = `<g opacity="0.92">
    <circle cx="${pad + 9}" cy="${pad + 9}" r="9" fill="${accent}"/>
    <text x="${pad + 26}" y="${pad + 15}" font-family="${sans}" font-size="${Math.round(shortSide * 0.026)}" font-weight="600" fill="#ffffff" letter-spacing="1.4">${escapeXml(
      req.brand.toUpperCase(),
    )}</text>
  </g>`;

  const badgeMarkup = req.badge
    ? `<g>
        <rect x="${width - pad - Math.round(shortSide * 0.26)}" y="${pad - Math.round(shortSide * 0.012)}" width="${Math.round(
          shortSide * 0.26,
        )}" height="${Math.round(shortSide * 0.062)}" rx="${Math.round(shortSide * 0.031)}" fill="rgba(255,255,255,0.14)" stroke="rgba(255,255,255,0.3)"/>
        <text x="${width - pad - Math.round(shortSide * 0.13)}" y="${pad + Math.round(
          shortSide * 0.029,
        )}" text-anchor="middle" font-family="${sans}" font-size="${Math.round(shortSide * 0.022)}" fill="#ffffff" letter-spacing="1">${escapeXml(
          req.badge.toUpperCase(),
        )}</text>
      </g>`
    : '';

  const grain = `<filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter>`;

  let background = '';
  let decor = '';
  let textColor = '#ffffff';

  if (req.style === 'gradient-mesh') {
    background = `<rect width="${width}" height="${height}" fill="${deep}"/>
      <defs>
        <radialGradient id="g1"><stop offset="0%" stop-color="${base}" stop-opacity="0.95"/><stop offset="100%" stop-color="${base}" stop-opacity="0"/></radialGradient>
        <radialGradient id="g2"><stop offset="0%" stop-color="${accent}" stop-opacity="0.85"/><stop offset="100%" stop-color="${accent}" stop-opacity="0"/></radialGradient>
        <radialGradient id="g3"><stop offset="0%" stop-color="${light}" stop-opacity="0.5"/><stop offset="100%" stop-color="${light}" stop-opacity="0"/></radialGradient>
        <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="35%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="0.62"/></linearGradient>
        ${grain}
      </defs>
      <ellipse cx="${width * 0.2}" cy="${height * 0.24}" rx="${width * 0.55}" ry="${height * 0.45}" fill="url(#g1)"/>
      <ellipse cx="${width * 0.86}" cy="${height * 0.14}" rx="${width * 0.42}" ry="${height * 0.36}" fill="url(#g2)"/>
      <ellipse cx="${width * 0.68}" cy="${height * 0.62}" rx="${width * 0.45}" ry="${height * 0.4}" fill="url(#g3)"/>
      <rect width="${width}" height="${height}" filter="url(#grain)" opacity="0.14"/>
      <rect width="${width}" height="${height}" fill="url(#shade)"/>`;
  } else if (req.style === 'bold-type') {
    background = `<rect width="${width}" height="${height}" fill="${deep}"/>
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${deep}"/><stop offset="100%" stop-color="${base}"/></linearGradient>
        <pattern id="dots" width="${Math.round(shortSide * 0.05)}" height="${Math.round(shortSide * 0.05)}" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.4" fill="rgba(255,255,255,0.18)"/></pattern>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#bg)"/>
      <rect width="${width}" height="${height}" fill="url(#dots)"/>
      <circle cx="${width * 0.86}" cy="${height * 0.3}" r="${shortSide * 0.34}" fill="none" stroke="${accent}" stroke-width="${Math.round(shortSide * 0.012)}" opacity="0.9"/>
      <circle cx="${width * 0.86}" cy="${height * 0.3}" r="${shortSide * 0.22}" fill="${accent}" opacity="0.28"/>
      <rect x="0" y="${height * 0.52}" width="${width}" height="${height * 0.005}" fill="${accent}"/>`;
  } else if (req.style === 'editorial') {
    textColor = '#111111';
    background = `<rect width="${width}" height="${height}" fill="#F6F1E7"/>
      <defs><pattern id="rules" width="${width}" height="${Math.round(shortSide * 0.072)}" patternUnits="userSpaceOnUse"><line x1="0" y1="0" x2="${width}" y2="0" stroke="rgba(17,17,17,0.08)" stroke-width="1"/></pattern></defs>
      <rect width="${width}" height="${height}" fill="url(#rules)"/>
      <rect x="${pad}" y="${pad}" width="${width - pad * 2}" height="${height - pad * 2}" fill="none" stroke="rgba(17,17,17,0.25)"/>
      <circle cx="${width - pad * 1.6}" cy="${height * 0.34}" r="${shortSide * 0.15}" fill="${base}" opacity="0.92"/>
      <circle cx="${width - pad * 2.1}" cy="${height * 0.28}" r="${shortSide * 0.15}" fill="none" stroke="${base}" stroke-width="${Math.round(
        shortSide * 0.004,
      )}" opacity="0.5"/>`;
  } else if (req.style === 'product') {
    background = `<rect width="${width}" height="${height}" fill="#0E1320"/>
      <defs>
        <radialGradient id="spot" cx="50%" cy="30%" r="70%"><stop offset="0%" stop-color="${light}" stop-opacity="0.55"/><stop offset="100%" stop-color="${deep}" stop-opacity="0"/></radialGradient>
        <linearGradient id="ped" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${base}"/><stop offset="100%" stop-color="${deep}"/></linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#spot)"/>
      <ellipse cx="${width * 0.5}" cy="${height * 0.72}" rx="${width * 0.4}" ry="${height * 0.1}" fill="#000" opacity="0.45"/>
      <rect x="${width * 0.3}" y="${height * 0.36}" width="${width * 0.4}" height="${height * 0.32}" rx="${shortSide * 0.04}" fill="url(#ped)"/>
      <rect x="${width * 0.34}" y="${height * 0.32}" width="${width * 0.32}" height="${height * 0.06}" rx="${shortSide * 0.03}" fill="${accent}" opacity="0.85"/>
      <circle cx="${width * 0.78}" cy="${height * 0.22}" r="${shortSide * 0.05}" fill="${accent}" opacity="0.8"/>
      <circle cx="${width * 0.2}" cy="${height * 0.18}" r="${shortSide * 0.11}" fill="${base}" opacity="0.35"/>`;
  } else if (req.style === 'tech-grid') {
    background = `<rect width="${width}" height="${height}" fill="#070C18"/>
      <defs>
        <linearGradient id="glow" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${accent}"/><stop offset="100%" stop-color="${base}"/></linearGradient>
        <pattern id="grid" width="${Math.round(shortSide * 0.06)}" height="${Math.round(shortSide * 0.06)}" patternUnits="userSpaceOnUse"><path d="M ${shortSide * 0.06} 0 L 0 0 0 ${shortSide * 0.06}" fill="none" stroke="rgba(120,180,255,0.12)" stroke-width="1"/></pattern>
        <filter id="blur"><feGaussianBlur stdDeviation="${shortSide * 0.05}"/></filter>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#grid)"/>
      <circle cx="${width * 0.72}" cy="${height * 0.35}" r="${shortSide * 0.26}" fill="url(#glow)" opacity="0.55" filter="url(#blur)"/>
      <path d="M ${width * 0.08} ${height * 0.62} Q ${width * 0.42} ${height * 0.34} ${width * 0.92} ${height * 0.5}" fill="none" stroke="${accent}" stroke-width="${shortSide * 0.004}" opacity="0.8"/>
      <path d="M ${width * 0.08} ${height * 0.66} Q ${width * 0.46} ${height * 0.42} ${width * 0.92} ${height * 0.56}" fill="none" stroke="${base}" stroke-width="${shortSide * 0.002}" opacity="0.6"/>`;
  } else {
    background = `<rect width="${width}" height="${height}" fill="#0C2A26"/>
      <defs>
        <radialGradient id="loy" cx="50%" cy="78%" r="60%"><stop offset="0%" stop-color="#F6C86B" stop-opacity="0.8"/><stop offset="100%" stop-color="#0C2A26" stop-opacity="0"/></radialGradient>
        <linearGradient id="gold" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#F6C86B"/><stop offset="100%" stop-color="#D79B3A"/></linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#loy)"/>
      <g opacity="0.9">${Array.from({ length: 7 })
        .map((_, i) => {
          const cx = width * (0.12 + i * 0.13);
          const cy = height * (0.68 - (i % 3) * 0.06);
          return `<ellipse cx="${cx}" cy="${cy}" rx="${shortSide * 0.06}" ry="${shortSide * 0.022}" fill="url(#gold)" opacity="${
            0.5 + (i % 3) * 0.15
          }"/>`;
        })
        .join('')}</g>
      <circle cx="${width * 0.5}" cy="${height * 0.26}" r="${shortSide * 0.16}" fill="#F6C86B" opacity="0.16"/>
      <circle cx="${width * 0.5}" cy="${height * 0.26}" r="${shortSide * 0.09}" fill="#F6C86B" opacity="0.32"/>`;
  }

  if (req.style === 'editorial') {
    // dark text variants
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      ${background}
      <g>
        <circle cx="${pad + 9}" cy="${pad + 9}" r="9" fill="${base}"/>
        <text x="${pad + 26}" y="${pad + 15}" font-family="${sans}" font-size="${Math.round(shortSide * 0.026)}" font-weight="600" fill="#111" letter-spacing="1.4">${escapeXml(
          req.brand.toUpperCase(),
        )}</text>
      </g>
      ${req.badge ? `<text x="${width - pad}" y="${pad + 16}" text-anchor="end" font-family="${sans}" font-size="${Math.round(shortSide * 0.024)}" fill="rgba(17,17,17,0.7)" letter-spacing="1.4">${escapeXml(req.badge.toUpperCase())}</text>` : ''}
      ${lines
        .map(
          (line, i) =>
            `<text x="${pad}" y="${textY - (lines.length - 1 - i) * headlineSize * 1.14}" font-family="${serif}" font-size="${headlineSize}" font-weight="700" fill="#111" letter-spacing="-0.5">${escapeXml(
              line,
            )}</text>`,
        )
        .join('')}
      ${
        req.subline
          ? `<text x="${pad}" y="${height - pad}" font-family="${sans}" font-size="${Math.round(headlineSize * 0.42)}" fill="rgba(17,17,17,0.72)">${escapeXml(
              wrap(req.subline, Math.round((width - pad * 2) / (headlineSize * 0.3)), 1)[0] ?? req.subline,
            )}</text>`
          : ''
      }
    </svg>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    ${background}
    ${decor}
    ${brandLock}
    ${badgeMarkup}
    ${headlineBlock}
    ${subline}
  </svg>`;
}
