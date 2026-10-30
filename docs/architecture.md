# สถาปัตยกรรม SocialMK (Beta 0.1)

เอกสารนี้อธิบายว่าอะไรอยู่ที่ไหน ทำไมเลือกแบบนี้ และจุดไหนจะต้องเปลี่ยนเมื่อขยายระบบ

---

## 1. ภาพรวม

```
┌────────────────────────── เบราว์เซอร์ผู้ใช้ ──────────────────────────┐
│  React 18 SPA (Vite)  ·  ไทย/EN  ·  Light/Dark  ·  ไม่มี UI framework │
└───────────────┬───────────────────────────────────────────────────────┘
                │ fetch /api/*  (cookie-less, Bearer token)
        ┌───────▼────────┐
        │  Express API   │  4000
        │  auth · RBAC   │
        ├───────┬────────┴─────────┬─────────────────────┐
        │ SQLite│  มีเดีย (SVG)     │  AI engine          │
        │  WAL  │  /media/assets    │  copy/plan/cover    │
        └───────┴───────────────────┴─────────────────────┘
                │
        ┌───────▼────────────────────────────────────────┐
        │  ชั้นเชื่อมต่อ (Beta = mock adapter)            │
        │  Facebook · IG · TikTok · LINE · LinkedIn · X  │
        │  Google Drive/Gmail/Calendar · Bridge uarea.in │
        └────────────────────────────────────────────────┘
```

**Production:** `npm run build` → `apps/web/dist` (static) + `apps/api/dist` (JS)
โดย Express เสิร์ฟทั้ง API และ SPA ใน origin เดียว จึงไม่ต้องตั้ง CORS และ `/api` เป็น relative URL

---

## 2. เทคโนโลยีและเหตุผล

| ชั้น | ที่ใช้ | ทำไม |
| --- | --- | --- |
| API | Express 4 + zod | เบา, ทีมคุ้นเคย, validation ชัดเจนที่ขอบระบบ |
| DB | `node:sqlite` (built-in) | zero native deps, ติดตั้งบน VPS ได้ทันที; ซิงโครนัสทำให้โค้ด route อ่านง่าย |
| Auth | scrypt + JWT HS256 (เขียนเอง ~80 บรรทัด) | ไม่ต้องพึ่ง library ที่ต้องอัปเดตบ่อย; ตรวจ `timingSafeEqual` |
| Web | Vite + React 18 + React Router 6 | เร็ว, bundle เล็ก (415 KB / gzip 114 KB) |
| Charts | SVG เขียนเอง | ควบคุมธีม/ภาษาไทยได้เต็มที่ ไม่มี runtime หนัก |
| i18n | Context + object map | 645 คีย์ TH/EN, ตรวจด้วย `npm run check:i18n` |
| AI | Template + rule engine | ทำงาน offline, ผลลัพธ์ทำซ้ำได้, ต้นทุนศูนย์; สลับเป็น LLM ได้ภายหลัง |

**สิ่งที่จงใจไม่ใช้:** ORM (สคีมาไม่เกิน 15 ตาราง, SQL ตรงอ่านง่าย), component library
(ต้องการอัตลักษณ์แบรนด์และรองรับภาษาไทย), chart library (bundle และธีม)

---

## 3. Data model

15 ตาราง ทุกตารางธุรกิจมี `workspace_id` (ยกเว้น `users`, `workspaces`)

```
users ──< memberships >── workspaces ──< brands ──< connections
                              │             │
                              │             ├──< posts ──< assets
                              │             ├──< campaigns
                              │             └──< metrics (per day/platform)
                              ├──< contacts
                              ├──< invites
                              ├──< api_keys ──< api_logs
                              ├──< webhooks
                              └──< activity
```

| ตาราง | บทบาท | หมายเหตุ |
| --- | --- | --- |
| `users` | บัญชีผู้ใช้ระดับ global | คนเดียวอยู่ได้หลาย workspace ผ่าน `memberships` |
| `workspaces` | หน่วยธุรกิจ/องค์กร | มี `slug`, `plan`, `bridge_url`, `timezone` |
| `memberships` | บทบาทของ user ใน workspace | unique (user, workspace) |
| `brands` | แบรนด์ภายใต้องค์กร | สี, โทนเสียง, กลุ่มเป้าหมาย, ไกด์ไลน์ (ใช้โดย AI) |
| `connections` | ช่องทางที่เชื่อมแล้ว | เก็บ health, token expiry, followers, scopes |
| `posts` | คอนเทนต์ | `platforms` เป็น JSON array, สถานะ 7 ขั้น, ผูก campaign ได้ |
| `campaigns` | แคมเปญ/โฆษณา | งบ, ใช้จ่าย, ผลลัพธ์ JSON, `boost_post_id` |
| `metrics` | ตัวเลขรายวัน × แพลตฟอร์ม | impressions, reach, engagements, clicks, spend, followers |
| `contacts` | ฐานลูกค้า/ผู้สนใจ | consent, sentiment, score, tags, platform ต้นทาง |
| `invites` | คำเชิญทีม | token + สถานะ pending/accepted/revoked |
| `api_keys` | คีย์ Public API | เก็บเฉพาะ hash + prefix, scopes, request_count |
| `webhooks` | ปลายทาง event | events JSON, secret, active |
| `api_logs` | บันทึกการเรียก API | method, path, status, latency_ms |
| `activity` | ไทม์ไลน์กิจกรรม | แสดงใน Team / Overview |
| `assets` | มีเดียที่ AI สร้าง | ไฟล์ SVG จริงบนดิสก์ + metadata |

**ทำไม metrics แยกตาราง:** ต้องกรองตามช่วงวัน/แพลตฟอร์ม/แบรนด์บ่อยที่สุด
และมี cardinality สูง (120 วัน × 5 แบรนด์ × หลายแพลตฟอร์ม) การแยกทำให้ aggregate ด้วย SQL ได้เร็ว
และในอนาคตย้ายไปตาราง partitioned/warehouse ได้โดยไม่กระทบตารางอื่น

---

## 4. Request lifecycle

```
1. attachAuth
   ├─ อ่าน Authorization: Bearer <jwt>
   ├─ verify HS256 + exp
   ├─ โหลด user + membership ของ workspace ปัจจุบัน
   │    (x-workspace-id ถ้ามี → ตรวจว่าเป็นสมาชิกจริง, ไม่มี → ใช้ ws ใน token)
   └─ ใส่ req.auth = { user, workspace, workspaceId, role }
2. requireRole(minimum)   owner 100 · admin 80 · editor 50 · analyst 30
3. zod safeParse          ผิด → 400 พร้อม field errors
4. handler                query/เขียน + logActivity
5. errorHandler           HttpError → { error, details? }, อื่น ๆ → 500 (ไม่รั่ว stack)
```

**การแยก workspace:** ทุก query ที่ผู้ใช้เรียกต้องมี `workspace_id = req.auth.workspaceId`
ไม่มีการอ่าน `workspace_id` จาก body/query เพื่อป้องกันการยกระดับสิทธิ์
(ทดสอบแล้วใน `npm run smoke` ข้อ "workspace isolation")

**JWT:** HS256, อายุ 7 วัน, secret มาจาก `SOCIALMK_JWT_SECRET` หรือสร้างไฟล์
`data/secret.key` (mode 600) อัตโนมัติ; เปลี่ยน secret = ทุก session หลุดพร้อมกัน

---

## 5. สิทธิ์ (RBAC)

| การกระทำ | Owner | Admin | Editor | Analyst |
| --- | :-: | :-: | :-: | :-: |
| ดูแดชบอร์ด/รายงาน/ส่งออก | ✅ | ✅ | ✅ | ✅ |
| สร้าง/แก้/ลบโพสต์, AI, ตั้งเวลา | ✅ | ✅ | ✅ | — |
| จัดการแคมเปญ (สร้าง/แก้) | ✅ | ✅ | ✅ | — |
| ลบแคมเปญ | ✅ | ✅ | — | — |
| จัดการแบรนด์/การเชื่อมต่อ/Bridge | ✅ | ✅ | — | — |
| ทีม, คำเชิญ, API keys, webhooks | ✅ | ✅ | — | — |
| ลบ workspace | ✅ | — | — | — |

> UI ซ่อนปุ่มตามสิทธิ์ แต่ **API บังคับใช้จริง** — การยิง request ตรงจะได้ 403

---

## 6. AI engine (ทำไมไม่เรียก LLM)

`apps/api/src/ai.ts` ประกอบด้วย 4 เครื่องยนต์เล็ก ๆ ที่ deterministic:

1. **Copywriter** — สร้าง 3 variant (direct / story / listicle) ตามแพลตฟอร์มและ objective
   ปรับความยาวตามข้อจำกัดจริง (X 280, IG 2,200, LinkedIn 3,000 ตัวอักษร ฯลฯ) + hashtag ภาษาไทย
2. **Planner** — กระจายโพสต์ตามจำนวน/สัปดาห์ เลือกวันและเวลาจาก heatmap ของแบรนด์
   หลีกเลี่ยงวันหยุด/weekend ตาม persona แล้วคืนเป็น JSON ที่นำเข้าเป็น draft ได้ทันที
3. **Cover renderer** — สร้าง SVG 1080×1080/1350/1920 ด้วยการคำนวณ layout จริง
   (ตัดบรรทัดตามความกว้าง, ปรับขนาดฟอนต์อัตโนมัติ, 6 สไตล์) แล้วบันทึกเป็นไฟล์
   ทำให้ดาวน์โหลด/แชร์ได้ และเรนเดอร์ PNG ฝั่งเบราว์เซอร์ได้
4. **Insight** — อ่าน delta ของ reach/engagement/ROAS แล้วเลือกข้อความสรุปตามกฎ
   พร้อมกันนั้นคำนวณ "งบที่ควรลด/เพิ่ม" จากสัดส่วน spend ต่อผลลัพธ์

**ข้อดี:** ทดสอบได้, ไม่มีค่าใช้จ่าย, ไม่ส่งข้อมูลลูกค้าออกนอกระบบ, ภาษาไทยควบคุมได้
**จุดต่อยอด:** เปลี่ยน `generateCopy()` ให้เรียก LLM โดยคง signature เดิม — UI ไม่ต้องแก้

---

## 7. การตัดสินใจที่สำคัญ

| เรื่อง | ทางเลือก | เหตุผล |
| --- | --- | --- |
| Multi-tenancy | shared DB + `workspace_id` (ไม่ใช่ DB-per-tenant) | ต้นทุนต่ำ, migration ครั้งเดียว, เหมาะกับ Beta; ถ้าลูกค้าองค์กรต้องการ isolation ค่อยแยก instance |
| ฐานลูกค้า | ตาราง `contacts` ของเราเอง | เป็น single source of truth ข้ามแพลตฟอร์ม ตามโจทย์ "ลูกค้าไม่ใช่แค่โซเชียล" |
| ภาพจาก AI | SVG (ไม่ใช่ raster) | คุณภาพคมทุกขนาด, ไฟล์เล็ก, แก้ข้อความได้, ไม่ต้องใช้ GPU |
| Rate limit | fixed window in-memory | พอสำหรับ Beta; production ต้องใช้ Redis |
| Webhook | ทดสอบผ่าน endpoint `/test` | ยังไม่ dispatch event จริง; โครงสร้าง payload พร้อมแล้ว |
| Workspace switch | header + reload | รับประกันว่าทุกหน้าดึงข้อมูลใหม่ ไม่มี state ค้างข้าม tenant |

---

## 8. เส้นทางขยาย (เมื่อมีลูกค้าจริง)

| จุด | ตอนนี้ | เป้าหมาย |
| --- | --- | --- |
| DB | SQLite (single writer) | Postgres + connection pool, migrations (Drizzle/Prisma) |
| Metrics | ตารางเดียว | Timescale/ClickHouse หรือ partition รายเดือน + rollup รายวัน |
| Rate limit | in-memory | Redis (Sliding window) ใช้ร่วมหลาย instance |
| Session | JWT 7 วัน | Access 15 นาที + refresh token, revoke list |
| ไฟล์ | ดิสก์ local | S3/R2 + CDN, signed URL |
| Queue | ไม่มี | BullMQ สำหรับ sync metrics, ส่ง webhook, ตั้งเวลาโพสต์ |
| Observability | log มาตรฐาน | OpenTelemetry + Sentry + uptime check `/api/health` |

ทั้งหมดนี้ออกแบบให้เปลี่ยนทีละชั้นได้ โดยไม่ต้องแก้ UI หรือสัญญา API
