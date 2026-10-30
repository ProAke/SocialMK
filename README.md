# SocialMK

**ศูนย์บัญชาการการตลาดโซเชียลสำหรับทุกธุรกิจ** — วางแผน สร้าง ขออนุมัติ ยิงโฆษณา และวัดผลได้ในที่เดียว
_เวอร์ชัน Beta `0.1.0-beta.1` · ภาษาไทย/English · Light/Dark_

SocialMK คือแพลตฟอร์มบริหารสื่อออนไลน์แบบ end-to-end สำหรับองค์กรขนาดเล็ก กลาง และใหญ่
ออกแบบให้ **ไม่ผูกกับแพลตฟอร์มใดแพลตฟอร์มหนึ่ง** — ข้อมูลลูกค้า (customer data) เป็นศูนย์กลางเดียว
แล้วจึงกระจายคอนเทนต์/แคมเปญออกไปยัง Facebook, Instagram, TikTok, LINE, LinkedIn, X และช่องทางในอนาคต

---

## เริ่มใช้งานใน 4 คำสั่ง

```bash
npm install        # ติดตั้งทั้งหมด (npm workspaces)
npm run seed       # สร้างฐานข้อมูลตัวอย่าง + มีเดีย
npm run dev        # API :4000 + Web :5173 พร้อมกัน
```

เปิด **http://localhost:5173** แล้วเข้าสู่ระบบด้วยบัญชีตัวอย่าง (รหัสผ่านทุกคน: `SocialMK2026`)

| อีเมล | บทบาท | Workspace |
| --- | --- | --- |
| `ariya@uarea.in` | Owner | UAREA Digital |
| `thanakrit@uarea.in` | Admin | UAREA Digital |
| `priya@uarea.in` | Editor | UAREA Digital |
| `nattapong@uarea.in` | Analyst | UAREA Digital |
| `mint@baanthai.co` | Owner | Baan Thai Riverside |
| `pink@novaclinic.co` | Owner | Nova Clinic |

> ต้องใช้ **Node.js ≥ 22.5** (ใช้ `node:sqlite` ที่มีมาในตัว ไม่ต้องคอมไพล์ native module)
> ต้องการรีเซ็ตข้อมูลตัวอย่าง: `npm run db:reset`

---

## ทำอะไรได้บ้าง (Beta)

| โมดูล | สิ่งที่ทำได้ | สถานะ |
| --- | --- | --- |
| **Overview** | KPI รวมทุกแบรนด์, กราฟแนวโน้ม, สรุปจาก AI, งานที่ต้องทำ, ปฏิทินใกล้ถึง | ✅ ใช้งานได้ |
| **Calendar** | ปฏิทินรายเดือน/สัปดาห์/รายการ, ลากเปลี่ยนวัน, เปลี่ยนสถานะ, อนุมัติ, ตั้งเวลา, AI ช่วยวางแผนทั้งเดือน | ✅ ใช้งานได้ |
| **AI Studio** | ร่างแคปชัน 3 แบบตามแพลตฟอร์ม, สร้างภาพคัฟเวอร์ 6 สไตล์ (แก้ไข/ดาวน์โหลด SVG/PNG), ส่งเข้าคิวอนุมัติ | ✅ ใช้งานได้ |
| **Campaigns** | งบประมาณ/การใช้จ่าย, pacing, ROAS/CPA, ยิงโฆษณาจากโพสต์ (Boost), หยุด/เริ่ม/ปิดแคมเปญ | ✅ ใช้งานได้ (ข้อมูลจำลอง) |
| **Analytics** | สรุปผล 7/30/90 วัน, reach/engagement/clicks, ผู้ติดตามเติบโต, ช่วงเวลาที่ดีที่สุด (heatmap), กลุ่มเป้าหมาย, Top content, ส่งออก CSV | ✅ ใช้งานได้ |
| **Audience** | ฐานลูกค้า/ผู้สนใจแบบ platform-neutral, consent (PDPA), คะแนนคุณภาพ, แท็ก, ค้นหา/กรอง, ส่งออก CSV | ✅ ใช้งานได้ |
| **Connections** | เชื่อมช่องทางโซเชียล + Google (Drive/Gmail/Calendar), สุขภาพการเชื่อมต่อ, sync, Workspace Bridge | ✅ ใช้งานได้ (mock connector) |
| **Team** | 4 บทบาท, คำเชิญ + หน้าตอบรับคำเชิญ, ตารางสิทธิ์, ไทม์ไลน์กิจกรรม | ✅ ใช้งานได้ |
| **Developers** | API keys + scopes, API logs, webhooks, OpenAPI spec, ตัวอย่าง cURL | ✅ ใช้งานได้ |
| **Settings** | ข้อมูล workspace/แบรนด์, โปรไฟล์, ภาษา, รหัสผ่าน, changelog + roadmap | ✅ ใช้งานได้ |
| **Public API** | `/api/v1` ใช้ `x-api-key` + scopes + rate limit 120 req/min | ✅ ใช้งานได้ |
| **Invite** | หน้าตอบรับคำเชิญ `/invite/:token` (ตรวจอีเมล, อายุ 14 วัน, ใช้ครั้งเดียว) | ✅ ใช้งานได้ |

**Beta = ยังไม่ต่อ API จริงของแพลตฟอร์ม** — ตัวเชื่อม, ตัวเลข และการยิงโฆษณาเป็นข้อมูลจำลองที่มีโครงสร้างเหมือนของจริง
เพื่อให้ทีมงานทดลองกระบวนการได้ครบก่อนเปิดใช้จริง (ดู [docs/integrations.md](docs/integrations.md))

---

## โครงสร้างโปรเจกต์

```
SocialMK/
├── apps/
│   ├── api/                 Express 4 + node:sqlite + zod (ไม่พึ่ง ORM)
│   │   ├── src/
│   │   │   ├── db.ts        สคีมา + helper (all/get/run/prepare/transaction)
│   │   │   ├── auth.ts      scrypt + JWT (HS256) แบบ hand-rolled
│   │   │   ├── http.ts      auth middleware, RBAC, error handler
│   │   │   ├── ai.ts        คอปี้/แพลน/ภาพ SVG/insight (deterministic, offline)
│   │   │   ├── analytics.ts สรุปผล, deltas, follower growth
│   │   │   ├── seed.ts      ข้อมูลตัวอย่าง 3 workspaces
│   │   │   └── routes/      auth · core · content · growth · admin · publicApi
│   │   └── data/            SQLite + มีเดียที่สร้าง (gitignored)
│   └── web/                 Vite + React 18 + React Router (ไม่มี UI kit)
│       └── src/
│           ├── lib/         api client, auth, i18n (th/en), toast, theme, format
│           ├── components/  Shell, UI, Charts (SVG เอง), Icon, PlatformIcon
│           └── pages/       12 หน้า (โมดูลด้านบน + Login + Invite)
├── docs/                    สถาปัตยกรรม · API · กลยุทธ์ · การเชื่อมต่อ · Deploy
└── scripts/                 smoke test · ตรวจ i18n · reset DB
```

### หลักการออกแบบ

- **Multi-tenant by default** — ทุกแถวข้อมูลผูกกับ `workspace_id`; สลับ workspace ได้โดยไม่ต้อง logout
- **Platform-neutral customer model** — ฐานลูกค้าอยู่ใน SocialMK ไม่ใช่ใน Facebook/LINE;
  เพิ่มช่องทางใหม่ = เพิ่มแถวในตาราง `connections` + adapter ไม่ต้องย้ายข้อมูล
- **Same source of truth for strategy** — Analytics, Audience และ Campaigns อ่านชุดข้อมูลเดียวกัน
- **Zero native dependencies** — ติดตั้งง่ายบนเครื่อง dev และ VPS ทั่วไป
- **ภาษาไทยเป็นค่าเริ่มต้น** พร้อมสลับ EN ได้ทันทีทั้งแอป (645 คีย์)

---

## คำสั่งที่ใช้บ่อย

| คำสั่ง | ทำอะไร |
| --- | --- |
| `npm run dev` | รัน API (4000) + Web (5173) พร้อม hot reload |
| `npm run seed` | สร้างข้อมูลตัวอย่าง (ไม่เขียนทับถ้ามีอยู่แล้ว) |
| `npm run db:reset` | ลบฐานข้อมูล + มีเดีย แล้ว seed ใหม่ |
| `npm run build` | build เว็บ (`apps/web/dist`) + compile API (`apps/api/dist`) |
| `npm start` | รัน production (API เสิร์ฟ SPA จาก `apps/web/dist`) |
| `npm run typecheck` | ตรวจ TypeScript ทั้งสองแอป |
| `npm run check:i18n` | ตรวจว่าทุกคีย์ที่ใช้มีคำแปลครบ TH/EN |
| `npm run smoke` | ทดสอบ API 52 เส้นทางแบบ end-to-end |

## เอกสาร

| ไฟล์ | เนื้อหา |
| --- | --- |
| [docs/architecture.md](docs/architecture.md) | สถาปัตยกรรม, data model, auth/RBAC, AI engine, การตัดสินใจเชิงเทคนิค |
| [docs/api.md](docs/api.md) | API reference ทั้งหมด + ตัวอย่าง curl, scopes, error, webhook |
| [docs/strategy.md](docs/strategy.md) | วิธีใช้ SocialMK สร้างกลยุทธ์จากข้อมูลลูกค้า, KPI, playbook รายเดือน |
| [docs/integrations.md](docs/integrations.md) | แผนเชื่อมต่อแต่ละแพลตฟอร์มจริง (OAuth, สิทธิ์, ข้อจำกัด, PDPA) |
| [docs/deployment.md](docs/deployment.md) | Deploy production: env, systemd, Nginx, backup |
| [docs/roadmap.md](docs/roadmap.md) | แผนเวอร์ชัน 0.2 → 1.0 พร้อมเกณฑ์วัดผล |

## ข้อจำกัดที่รู้อยู่ (Beta)

1. ตัวเชื่อมแพลตฟอร์มเป็น **mock** — ยังไม่มีการยืนยันตัวตน OAuth หรือดึงข้อมูลจริง
2. ตัวเลข analytics มาจากชุดข้อมูลตัวอย่าง 120 วัน (1,800 แถว) ไม่ใช่ข้อมูลจริง
3. AI เป็น template engine ที่ deterministic — ยังไม่ต่อ LLM ภายนอก (ตั้งใจให้ทำงาน offline ได้)
4. SQLite + in-memory rate limit เหมาะกับ 1 process; ก่อนสเกลต้องย้าย Postgres/Redis
5. ยังไม่มี 2FA/SSO หรือ audit log ที่ลบไม่ได้ (จะมาใน 1.0)
6. `/api/auth/login` ยังไม่มี rate limit — ต้องจำกัดที่ reverse proxy ก่อนเปิดสาธารณะ
7. Logout เป็นการลบ token ฝั่ง client เท่านั้น ยังไม่มี revoke list (JWT หมดอายุเองใน 7 วัน)

 roadmap และเกณฑ์การเลื่อนสถานะจาก Beta → Production อยู่ใน [docs/roadmap.md](docs/roadmap.md)

---

© 2026 UAREA · SocialMK Beta — สร้างเพื่อทดลองและเก็บรายละเอียดให้ครบก่อนปล่อยจริง
