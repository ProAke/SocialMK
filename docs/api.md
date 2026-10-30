# SocialMK API Reference — v0.1.0-beta.1

Base URL (dev): `http://localhost:4000`
Public API: `http://localhost:4000/api/v1` (ต้องมี API key)
OpenAPI (subset): `GET /api/v1/openapi.json`

---

## 1. Authentication

### Session (แอปของเรา)

```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"ariya@uarea.in","password":"SocialMK2026"}'
```

```json
{
  "token": "<jwt>",
  "user": { "id": "usr_…", "name": "อารีย์ วัฒนกุล", "email": "ariya@uarea.in", "role": "owner", "locale": "th" },
  "workspaces": [
    { "id": "wsp_…", "name": "UAREA Digital", "slug": "uarea", "plan": "growth", "bridgeUrl": "https://mng.uarea.in", "role": "owner" }
  ],
  "activeWorkspaceId": "wsp_…"
}
```

ใช้ token ใน header ทุกครั้ง:

```
Authorization: Bearer <jwt>
x-workspace-id: <workspace id>     # ไม่บังคับ; ถ้าไม่ส่งจะใช้ workspace ใน token
```

- Token อายุ **7 วัน** (HS256)
- `x-workspace-id` ถูกตรวจว่าเป็นสมาชิกจริงก่อนใช้งาน — ถ้าไม่ใช่จะได้ `403`
- สลับ workspace = เปลี่ยน header นี้ (frontend จะ reload เพื่อล้าง state)

### Public API key

```
x-api-key: smk_live_xxxxxxxxxxxxxxxxxxxx
```

- คีย์แสดง **ครั้งเดียวตอนสร้าง** ระบบเก็บเฉพาะ SHA-256 hash
- ผูกกับ workspace เดียว และมี scopes: `posts:read` `posts:write` `analytics:read` `contacts:read` `campaigns:read`
- Rate limit **120 คำขอ/นาที ต่อคีย์** → เมื่อเกินได้ `429` พร้อม `Retry-After`

Response header ทุกครั้ง: `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`

---

## 2. Errors

```json
{ "error": "You do not have permission for this action", "code": "FORBIDDEN" }
```

| Status | ความหมาย |
| --- | --- |
| 400 | ข้อมูลไม่ผ่าน validation (ข้อความภาษาไทย + field) |
| 401 | ไม่มี/หมดอายุ token, คีย์ผิดหรือถูกเพิกถอน |
| 403 | บทบาทไม่พอ หรือคีย์ขาด scope |
| 404 | ไม่พบข้อมูล หรือไม่อยู่ใน workspace นี้ |
| 409 | ข้อมูลชนกัน (เช่น อีเมลซ้ำ) |
| 429 | เกิน rate limit |
| 500 | ข้อผิดพลาดภายใน (ไม่ส่ง stack ออกไป) |

---

## 3. Endpoints (session)

### Auth
| Method | Path | สิทธิ์ | คำอธิบาย |
| --- | --- | --- | --- |
| POST | `/api/auth/login` | — | เข้าสู่ระบบ |
| GET | `/api/auth/me` | user | โปรไฟล์ + workspace + role |
| PATCH | `/api/auth/profile` | user | แก้ชื่อ/ตำแหน่ง/ภาษา |
| POST | `/api/auth/change-password` | user | เปลี่ยนรหัส (ต้องยืนยันรหัสเดิม) |
| POST | `/api/auth/logout` | user | ล้าง token ฝั่ง client (Beta: ยังไม่มี revoke list) |
| GET | `/api/auth/invites/:token` | — | ดูลายละเอียดคำเชิญ (สาธารณะ, ไม่เผยข้อมูลอื่น) |
| POST | `/api/auth/invites/:token/accept` | user | ตอบรับคำเชิญ (ต้อง login ด้วยอีเมลที่ได้รับเชิญ) |

ตัวอย่างคำเชิญ:

```bash
curl -X POST http://localhost:4000/api/team/invites \
  -H "Authorization: Bearer <jwt>" -H "x-workspace-id: wsp_…" \
  -H 'Content-Type: application/json' \
  -d '{"email":"new.member@company.com","role":"editor"}'

# → { "inviteUrl": "/invite/QO_Kwj9ODllFQu68YDa9og", "emailSent": true }
```

ผู้รับเปิด `/invite/<token>` → เห็นชื่อ workspace/บทบาท → login → กดตอบรับ
ระบบจะสร้าง membership และเปลี่ยนสถานะเป็น `accepted` (ลิงก์ใช้ได้ครั้งเดียว, อายุ 14 วัน)

### Workspace & แบรนด์
| Method | Path | สิทธิ์ | คำอธิบาย |
| --- | --- | --- | --- |
| GET | `/api/workspaces` | user | workspace ที่เป็นสมาชิก + จำนวนสมาชิก/แบรนด์/การเชื่อมต่อ |
| PATCH | `/api/workspaces/:id` | admin | แก้ชื่อ/industries/bridgeUrl |
| GET | `/api/brands` | user | แบรนด์ใน workspace |
| POST | `/api/brands` | admin | สร้างแบรนด์ (สี, โทน, กลุ่มเป้าหมาย, ไกด์ไลน์) |
| PATCH | `/api/brands/:id` | admin | แก้แบรนด์ |
| DELETE | `/api/brands/:id` | admin | ลบแบรนด์ (ไม่ลบโพสต์) |
| GET | `/api/meta` | — | รายการแพลตฟอร์ม บทบาท สถานะ สไตล์ภาพ เวอร์ชัน |

### การเชื่อมต่อ
| Method | Path | สิทธิ์ | คำอธิบาย |
| --- | --- | --- | --- |
| GET | `/api/connections` | user | ช่องทางที่เชื่อม + สุขภาพ token |
| POST | `/api/connections` | admin | เชื่อมช่องทาง (mock) |
| POST | `/api/connections/:id/sync` | editor | ดึงข้อมูลล่าสุด |
| DELETE | `/api/connections/:id` | admin | ยกเลิกการเชื่อมต่อ |
| POST | `/api/bridge/sync` | admin | sync กับ Workspace Bridge (mng.uarea.in) |

```json
POST /api/connections
{ "platform": "facebook", "accountName": "Baan Thai Kitchen", "brandId": "brd_…" }
```

### คอนเทนต์
| Method | Path | สิทธิ์ | คำอธิบาย |
| --- | --- | --- | --- |
| GET | `/api/posts` | user | `?status=&brandId=&platform=&from=&to=&q=&limit=` |
| GET | `/api/posts/:id` | user | รายละเอียด |
| POST | `/api/posts` | editor | สร้างโพสต์ |
| PATCH | `/api/posts/:id` | editor | แก้ไข/เปลี่ยนสถานะ |
| POST | `/api/posts/:id/duplicate` | editor | ทำสำเนาเป็น draft |
| DELETE | `/api/posts/:id` | editor | ลบ |
| GET | `/api/assets` | user | มีเดียที่ AI สร้าง |
| DELETE | `/api/assets/:id` | editor | ลบมีเดีย (ลบไฟล์ด้วย) |

```json
POST /api/posts
{
  "brandId": "brd_…",
  "title": "เปิดตัวเมนูใหม่",
  "body": "ข้อความโพสต์…",
  "platforms": ["facebook", "instagram"],
  "hashtags": ["#BaanThai"],
  "contentType": "image",
  "pillar": "Promote",
  "status": "draft",
  "scheduledAt": "2026-11-05T10:00"
}
```

`status`: `idea` · `draft` · `review` · `approved` · `scheduled` · `published` · `archived`
`contentType`: `image` · `carousel` · `reel` · `story` · `live` · `text`

### AI
| Method | Path | สิทธิ์ | คำอธิบาย |
| --- | --- | --- | --- |
| POST | `/api/ai/copy` | editor | ร่างแคปชัน 3 แบบ |
| POST | `/api/ai/plan` | editor | วางแผนคอนเทนต์รายเดือน |
| POST | `/api/ai/plan/apply` | editor | นำแผนเข้าเป็น draft ทั้งชุด |
| POST | `/api/ai/image` | editor | สร้างภาพคัฟเวอร์ SVG |
| GET | `/api/ai/insight` | user | สรุปผลพร้อมข้อเสนอแนะ |

```json
POST /api/ai/copy
{ "brandId": "brd_…", "platform": "instagram", "objective": "engagement", "language": "th", "keywords": "เมนูใหม่" }
```

```json
{
  "variants": [
    { "label": "Direct", "hook": "…", "body": "…", "hashtags": ["#…"], "bestTime": "19:30" }
  ]
}
```

```json
POST /api/ai/image
{ "brandId": "brd_…", "style": "gradient-mesh", "headline": "เมนูใหม่", "subline": "Baan Thai Kitchen", "badge": "ใหม่", "width": 1080, "height": 1080, "save": true }
```

`style`: `gradient-mesh` · `bold-type` · `editorial` · `product` · `tech-grid` · `festive`
ขนาดที่ UI ใช้: 1080×1080 (square) · 1080×1350 (portrait) · 1080×1920 (story)
`save: false` = พรีวิวโดยไม่บันทึกเป็น asset

ไฟล์ที่ได้เข้าถึงผ่าน `/media/assets/<name>.svg`

### แคมเปญ & โฆษณา
| Method | Path | สิทธิ์ | คำอธิบาย |
| --- | --- | --- | --- |
| GET | `/api/campaigns` | user | พร้อม pacing, ROAS, CPL |
| GET | `/api/campaigns/boostable` | editor | โพสต์ที่เปิด Boost ได้ |
| POST | `/api/campaigns` | editor | สร้างแคมเปญ หรือ boost โพสต์ |
| PATCH | `/api/campaigns/:id` | editor | หยุด/เริ่ม/ปิด/แก้งบ |
| DELETE | `/api/campaigns/:id` | admin | ลบ |

```json
POST /api/campaigns
{
  "brandId": "brd_…",
  "name": "Boost · เปิดตัวเมนูใหม่",
  "objective": "engagement",
  "status": "active",
  "budget": 15000,
  "startDate": "2026-10-30",
  "endDate": "2026-11-13",
  "platforms": ["facebook", "instagram"],
  "boostPostId": "pst_…"
}
```

> UI คำนวณ `endDate` จากจำนวนวันของ Boost ให้อัตโนมัติ (API ต้องการวันที่จริง)

```json
{
  "id": "cmp_…", "budget": 35000, "spend": 12400,
  "pacing": 106, "budgetUsed": 35, "daysLeft": 16,
  "dailyBudget": 1458, "roas": 7.74, "cpl": 148
}
```

`pacing` = เปอร์เซ็นต์การใช้จ่ายเทียบสัดส่วนเวลาที่ผ่านไป (>115 = ใช้เร็วเกิน, <85 = ช้า)

### Analytics
| Method | Path | คำอธิบาย |
| --- | --- | --- |
| GET | `/api/analytics/summary?days=7\|30\|90&brandId=` | totals, deltas, series รายวัน, แยกแพลตฟอร์ม/แบรนด์, follower series, top posts, campaigns |
| GET | `/api/analytics/demographics?brandId=` | age, gender, cities, devices, active hours |
| GET | `/api/analytics/heatmap?brandId=` | 168 เซลล์ (7 วัน × 24 ชม.) + best slots |
| GET | `/api/analytics/export.csv?days=30` | CSV (`Date,Impressions,Reach,…`) |
| GET | `/api/overview?days=30` | ชุดข้อมูลหน้าแรก (KPI, งาน, โพสต์ใกล้ถึง) |

### ลูกค้า (Audience)
| Method | Path | สิทธิ์ | คำอธิบาย |
| --- | --- | --- | --- |
| GET | `/api/contacts` | user | `?q=&type=&platform=&consent=&limit=` |
| GET | `/api/contacts/segments` | user | สรุปกลุ่ม: total, customers, prospects, revoked, LTV, top sources |
| POST | `/api/contacts` | editor | เพิ่มลูกค้า/ผู้สนใจ |
| PATCH | `/api/contacts/:id` | editor | แก้ไข |
| DELETE | `/api/contacts/:id` | admin | ลบ |
| GET | `/api/contacts/export.csv` | user | ส่งออก CSV ตามตัวกรอง (สูงสุด 500 แถว) |

`consent`: `granted` · `pending` · `revoked` — ใช้กำกับ PDPA; Public API จะคืนเฉพาะ `granted` เว้นแต่ระบุ `includeRevoked=true`

### ทีม & การดูแลระบบ
| Method | Path | สิทธิ์ | คำอธิบาย |
| --- | --- | --- | --- |
| GET | `/api/team` | user | สมาชิก + คำเชิญที่ค้าง |
| PATCH | `/api/team/:userId` | admin | เปลี่ยนบทบาท (owner เปลี่ยนไม่ได้ผ่าน endpoint นี้) |
| DELETE | `/api/team/:userId` | admin | ลบสมาชิก |
| POST | `/api/team/invites` | admin | สร้างคำเชิญ (คืน `inviteUrl`) |
| POST | `/api/team/invites/:id/resend` | admin | ส่งซ้ำ |
| DELETE | `/api/team/invites/:id` | admin | เพิกถอน |
| GET | `/api/activity?limit=` | user | ไทม์ไลน์กิจกรรม |
| GET | `/api/changelog` | user | เวอร์ชัน + roadmap |
| GET | `/api/notifications` | user | การแจ้งเตือนในแอป |

### API keys / logs / webhooks
| Method | Path | สิทธิ์ | คำอธิบาย |
| --- | --- | --- | --- |
| GET | `/api/api-keys` | admin | รายการคีย์ (ไม่คืนค่าจริง) |
| POST | `/api/api-keys` | admin | สร้างคีย์ — คืนค่าเต็ม **ครั้งเดียว** |
| DELETE | `/api/api-keys/:id` | admin | เพิกถอน |
| GET | `/api/api-logs` | admin | บันทึกการเรียก (สูงสุด 100) |
| GET | `/api/webhooks` | admin | รายการ |
| POST | `/api/webhooks` | admin | `{ url, events[], active }` |
| PATCH | `/api/webhooks/:id` | admin | เปิด/ปิด/แก้ |
| POST | `/api/webhooks/:id/test` | admin | ทดสอบ (บันทึก delivery) |
| DELETE | `/api/webhooks/:id` | admin | ลบ |

Events ที่รองรับ: `post.published`, `post.scheduled`, `contact.created`, `campaign.budget_threshold`, `campaign.completed`

---

## 4. Public API (`/api/v1`)

| Method | Path | Scope | คำอธิบาย |
| --- | --- | --- | --- |
| GET | `/brands` | posts:read | แบรนด์ใน workspace ของคีย์ |
| GET | `/posts?limit=50&status=` | posts:read | โพสต์ (สูงสุด 200) |
| GET | `/analytics/summary?days=30` | analytics:read | สรุปผล |
| GET | `/contacts?limit=50&includeRevoked=true` | contacts:read | ลูกค้า (ค่าเริ่มต้น: เฉพาะ consent = granted) |
| GET | `/campaigns` | campaigns:read | แคมเปญ + pacing |
| GET | `/openapi.json` | — | OpenAPI 3.0 subset |

```bash
curl http://localhost:4000/api/v1/analytics/summary?days=30 \
  -H 'x-api-key: smk_live_…'
```

```json
{
  "totals": { "impressions": 4242664, "reach": 2621334, "engagements": 152995, "clicks": 50755, "spend": 236164 },
  "platforms": [{ "platform": "tiktok", "share": 38.3 }],
  "meta": { "generatedAt": "2026-10-30T…", "brand": null }
}
```

---

## 5. Webhook payload (โครงร่าง)

```json
{
  "id": "evt_…",
  "event": "post.published",
  "createdAt": "2026-10-30T12:00:00.000Z",
  "workspaceId": "wsp_…",
  "data": { "postId": "pst_…", "platforms": ["facebook"], "url": "https://…" }
}
```

Header ที่จะแนบเมื่อเปิดใช้จริง: `X-SocialMK-Signature: sha256=<hmac>` (HMAC-SHA256 ของ body ด้วย secret ของ webhook)
**Beta:** endpoint `/test` บันทึกความพยายามส่งและอัปเดต `lastDeliveryAt` แต่ยังไม่ยิง HTTP ออกไปจริง

---

## 6. ตัวอย่าง End-to-End (Node)

```js
const base = 'http://localhost:4000/api';
const login = await fetch(`${base}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'ariya@uarea.in', password: 'SocialMK2026' }),
}).then((r) => r.json());

const headers = {
  Authorization: `Bearer ${login.token}`,
  'x-workspace-id': login.activeWorkspaceId,
  'Content-Type': 'application/json',
};

const brands = await fetch(`${base}/brands`, { headers }).then((r) => r.json());
const summary = await fetch(`${base}/analytics/summary?days=30`, { headers }).then((r) => r.json());
console.log(brands.length, summary.totals.reach);
```

ทดสอบทุกเส้นทางอัตโนมัติ: `npm run smoke` (52 checks)
