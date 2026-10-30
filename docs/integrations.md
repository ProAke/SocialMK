# แผนเชื่อมต่อแพลตฟอร์มจริง (จาก Beta → Production)

Beta ใช้ **mock connector**: เชื่อมแล้วได้บัญชี ตัวเลขสุขภาพ token และข้อมูลตัวอย่าง
แต่ยังไม่มีการเรียก API ภายนอก เอกสารนี้คือสัญญาที่ต้องทำจริงก่อนเปิดใช้งานลูกค้า

---

## 1. Adapter contract

ทุกแพลตฟอร์ม implement interface เดียวกัน เพื่อให้หน้า Connections, Calendar, Analytics
ไม่ต้องรู้จัก API ของแต่ละเจ้าผู้ให้บริการ

```ts
interface PlatformAdapter {
  key: PlatformKey;

  /** สร้าง authorize URL (OAuth2 + PKCE ถ้ารองรับ) */
  authorizeUrl(input: { state: string; redirectUri: string }): string;

  /** แลก code → token แล้วบันทึกแบบเข้ารหัส */
  exchangeCode(input: { code: string; redirectUri: string }): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresAt: string;
    scopes: string[];
  }>;

  /** บัญชี/เพจที่ผู้ใช้มีสิทธิ์ */
  listAccounts(accessToken: string): Promise<Array<{
    externalId: string;
    name: string;
    avatarUrl?: string;
    followers?: number;
  }>>;

  /** เผยแพร่โพสต์ (idempotent ด้วย postId) */
  publish(input: PublishInput): Promise<{ externalId: string; url: string }>;

  /** ตัวเลขรายวัน — ต้อง normalize ให้ตรง schema ของเรา */
  fetchMetrics(input: { accountId: string; from: string; to: string }): Promise<MetricPoint[]>;

  /** คอมเมนต์/ข้อความ (0.3+) */
  fetchComments?(input: { accountId: string; since: string }): Promise<Comment[]>;

  /** ยิงโฆษณา (0.4+) */
  createBoost?(input: BoostInput): Promise<{ campaignId: string; status: string }>;
}

type MetricPoint = {
  date: string;          // YYYY-MM-DD (Asia/Bangkok)
  impressions: number;
  reach: number;
  engagements: number;
  clicks: number;
  spend: number;         // สตางค์ → บาท
  followers: number;     // ยอดสะสม ณ สิ้นวัน
};
```

**หลักการ normalize**

- เก็บเป็น **รายวัน** เสมอ แม้ API ต้นทางให้รายชั่วโมง (aggregate ตอน ingest)
- เงินเก็บเป็นหน่วยบาท (ทศนิยม 2 ตำแหน่ง) ไม่ใช่สตางค์หรือ micro
- ถ้าแพลตฟอร์มไม่ให้ reach (เช่น LINE) ให้ใช้ `NULL` ไม่ใช่ 0 — 0 จะทำให้ค่าเฉลี่ยผิด
- บันทึก `source: 'live' | 'seed'` ในอนาคต เพื่อให้ Analytics บอกได้ว่าตัวเลขมาจากไหน

---

## 2. สถานะและสิ่งที่ต้องเตรียม (รายแพลตฟอร์ม)

| แพลตฟอร์ม | API ที่ใช้ | สิ่งที่ต้องมี | สิทธิ์หลัก | ข้อจำกัดสำคัญ |
| --- | --- | --- | --- | --- |
| **Facebook Page** | Graph API (Pages) | Meta App + Page Access Token | `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `read_insights` | ต้องผ่าน App Review; token เพจอายุ ~60 วัน ต้อง refresh |
| **Instagram** | Instagram Graph API (Business/Creator) | IG เชื่อมกับ Page | `instagram_basic`, `instagram_content_publish`, `instagram_manage_insights` | โพสต์ได้เฉพาะรูป/วิดีโอ/Reel/Carousel ผ่าน container flow |
| **TikTok** | TikTok for Business / Display API | Developer app + Business Account | `user.info.basic`, `video.list`, `video.publish` | ต้องผ่าน audit ก่อนโพสต์จริง; rate limit เข้ม |
| **LINE OA** | Messaging API + LINE Login | OA + Channel Access Token | ส่งข้อความ, broadcast, rich menu | ไม่มี "โพสต์" แบบฟีด; วัดผลด้วย broadcast/click; demographic จำกัด |
| **LinkedIn** | Community Management + Marketing API | LinkedIn Developer App + หน้า Company | `w_organization_social`, `r_organization_social`, ads | ต้องขอ Marketing Developer Platform (อนุมัติช้า) |
| **X (Twitter)** | API v2 + Media Upload | Developer account (paid tier) | `tweet.read`, `tweet.write`, `users.read` | Free tier จำกัดมาก; ต้องมีงบ API |
| **YouTube** | Data API v3 + Upload | Google Cloud project, OAuth | `youtube.readonly`, `youtube.upload` | quota 10,000 units/วัน (อัปโหลดแพงมาก) |
| **Threads** | Threads API | Meta App + Threads account | `threads_basic`, `threads_content_publish` | ยังใหม่ ฟีเจอร์ไม่ครบ |
| **Google Drive** | Drive API | OAuth client (Web) | `drive.file` (เฉพาะไฟล์ที่แอปสร้าง/เปิด) | `drive.readonly` เป็น restricted scope ต้อง verified |
| **Gmail** | Gmail API | OAuth client | `gmail.send`, `gmail.readonly` (sensitive) | restricted scope ต้อง security assessment ถ้าใช้แบบกว้าง |
| **Google Calendar** | Calendar API | OAuth client | `calendar.events` | ใช้ซิงก์ปฏิทินคอนเทนต์กับทีม |

> ชื่อ scope และข้อกำหนดอาจเปลี่ยน — ตรวจเอกสารผู้ให้บริการอีกครั้งตอนพัฒนา adapter

---

## 3. โครงสร้างการเก็บ token (ต้องทำก่อน Production)

```sql
ALTER TABLE connections ADD COLUMN access_token_enc TEXT;
ALTER TABLE connections ADD COLUMN refresh_token_enc TEXT;
ALTER TABLE connections ADD COLUMN scopes TEXT;
ALTER TABLE connections ADD COLUMN external_id TEXT;
ALTER TABLE connections ADD COLUMN token_expires_at TEXT;
```

- เข้ารหัสด้วย **AES-256-GCM** โดยคีย์จาก KMS/secret manager (ไม่ใช่ใน DB)
- แสดงเฉพาะ metadata ใน UI: วันที่หมดอายุ, สถานะ, ชื่อบัญชี
- refresh อัตโนมัติเมื่อเหลือ < 7 วัน และแจ้งเตือนในหน้า Connections เมื่อ refresh ล้มเหลว
- ทุกครั้งที่เชื่อม/ถอด ต้องเขียน `activity` และ (1.0) audit log ที่ลบไม่ได้

---

## 4. ลำดับการทำงาน (Ingestion pipeline)

```
Cron/Queue (ทุก 15 นาที)
   ├── สำหรับแต่ละ connection ที่ active
   │     ├── refresh token ถ้าจำเป็น
   │     ├── fetchMetrics(เมื่อถึงรอบ — รายวัน 03:00 Asia/Bangkok)
   │     ├── upsert metrics (date, brand, platform) ← unique index
   │     └── อัปเดต connections.health / last_sync_at
   ├── retry แบบ exponential backoff (3 ครั้ง) แล้ว mark 'attention'
   └── ส่ง webhook 'metrics.synced' ให้ลูกค้าที่สมัคร
```

**สิ่งที่ต้องมีเพิ่มจาก Beta**

1. ตาราง `sync_jobs` (id, connection_id, status, attempts, last_error) เพื่อ retry ได้
2. unique index `(workspace_id, brand_id, platform, date)` ใน `metrics`
3. คิว (BullMQ/Redis) แทนการยิงใน request เพราะ API ภายนอกช้าและมี rate limit
4. เก็บ raw response 7–30 วันเพื่อ debug (ระวัง PDPA)

---

## 5. การเผยแพร่โพสต์ (Publishing)

- ตั้งเวลาใน SocialMK → queue → adapter.publish() ตอนถึงเวลา
- **Idempotency:** เก็บ `external_id` หลังสำเร็จ; ถ้า retry ให้ตรวจก่อนว่าโพสต์ไปแล้วหรือยัง (สำคัญมากกับ Facebook/TikTok)
- Media: อัปโหลดไฟล์ไปยังแพลตฟอร์มก่อน แล้วแนบ URL/ID (แต่ละที่มีข้อจำกัดขนาด/อัตราส่วน)
- ถ้า publish ล้มเหลว → สถานะ `approved` + แจ้งเตือน ไม่ใช่ `published`
- ทุกโพสต์ที่เผยแพร่ต้องมี URL จริงเก็บไว้ เพื่อใช้ในรายงานและ Top content

---

## 6. การยิงโฆษณา (Boost)

Beta สร้างแคมเปญภายในระบบเท่านั้น เมื่อเชื่อมจริงต้องแมปกับ Ads API:

| แนวคิดใน SocialMK | Meta Ads | TikTok Ads | LinkedIn Ads |
| --- | --- | --- | --- |
| campaign | Campaign | Campaign | Campaign |
| budget/duration | Daily Budget + Schedule | Budget + Schedule | Daily Budget |
| objective | ODAX objectives | Advertising objective | Objective |
| results | Insights API | Reporting API | Analytics API |

**ต้องมีก่อนเปิดใช้:** การยืนยันตัวตน advertiser, วงเงิน, การอนุมัติ 2 ชั้นสำหรับงบเกินที่กำหนด,
และ sync สถานะกลับมาทุกชั่วโมง (paused/completed จากฝั่งแพลตฟอร์ม)

---

## 7. Workspace Bridge (mng.uarea.in)

Beta มี `POST /api/bridge/sync` ที่อัปเดต `last_sync_at` ของทุก connection
สัญญาที่แนะนำสำหรับของจริง:

```
POST https://mng.uarea.in/api/v1/bridge/pull
Authorization: Bearer <workspace bridge token>
{ "workspaceId": "wsp_…", "since": "2026-10-01T00:00:00Z", "entities": ["assets","posts","metrics"] }

200 OK
{ "assets": [...], "posts": [...], "metrics": [...], "cursor": "2026-10-30T…" }
```

- SocialMK เก็บ token ของ bridge แบบเข้ารหัส และเรียกแบบ **outbound เท่านั้น** (ไม่เปิด inbound firewall)
- ใช้ `cursor` เพื่อ incremental sync; ถ้า cursor หายให้ full sync
- ถ้า bridge ล่ม ต้องไม่กระทบการใช้งานหลัก — แสดงสถานะ "เชื่อมต่อขัดข้อง" ในหน้า Connections

---

## 8. ความปลอดภัยและกฎหมาย

1. **OAuth state + PKCE** ทุกครั้ง; ตรวจ `state` กัน CSRF
2. เก็บ token เข้ารหัส, จำกัดสิทธิ์การเข้าถึงเฉพาะ service account
3. อย่าขอ scope เกินจำเป็น — App Review จะถามเหตุผลทุก scope
4. ลูกค้าต้องถอดการเชื่อมต่อได้เอง และระบบต้องลบ token ภายใน 24 ชม.
5. บันทึก **consent** ของเจ้าของข้อมูลก่อนนำเข้า contacts และเคารพ `revoked`
6. เก็บ log การเข้าถึงข้อมูลส่วนบุคคล (ใคร/เมื่อไหร่/ทำอะไร) — ต้องมีก่อน 1.0
7. แจ้ง Privacy Policy ที่ระบุผู้ประมวลผลช่วง (Meta, Google, TikTok ฯลฯ)

---

## 9. ลำดับความสำคัญในการพัฒนา

| ลำดับ | สิ่งที่ทำ | เหตุผล |
| --- | --- | --- |
| 1 | Meta (Facebook + Instagram) read-only metrics | ลูกค้าไทยส่วนใหญ่ใช้ และ ROI วัดได้ชัด |
| 2 | LINE OA (broadcast + click) | ช่องทางหลักของธุรกิจไทย |
| 3 | Google Drive/Gmail/Calendar (OAuth) | งานออกแบบและอนุมัติภายใน |
| 4 | Meta publishing + Boost | ต้องผ่าน App Review ครั้งใหญ่ |
| 5 | TikTok metrics + publishing | เอฟเฟกต์แรง แต่ audit ยาก |
| 6 | LinkedIn, X, YouTube, Threads | ตามความต้องการลูกค้าองค์กร |

เป้าหมาย: ภายใน 6 เดือนหลัง Beta ต้องมี **2 แพลตฟอร์มที่ดึงข้อมูลจริงได้** และ **1 แพลตฟอร์มที่โพสต์จริงได้**
จึงจะถือว่าก้าวข้ามจาก demo ไปสู่ผลิตภัณฑ์ที่ขายได้
