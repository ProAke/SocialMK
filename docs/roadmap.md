# Roadmap & เกณฑ์เลื่อนสถานะ

หลักการ: **Beta ก่อน แล้วเก็บรายละเอียดให้ครบก่อนขยาย** — แต่ละเวอร์ชันต้องมีเกณฑ์วัดผลที่ชัด
ไม่ปล่อยฟีเจอร์ที่ยังวัดผลไม่ได้

---

## 0.1.0-beta.1 — "ครบวงจรบนข้อมูลจำลอง" (ปัจจุบัน · 2026-10-30)

**เป้าหมาย:** พิสูจน์ว่าทีมหนึ่งทีมทำงานการตลาดครบวงจรได้ในเครื่องมือเดียว

ส่งมอบแล้ว

- 12 หน้า: Overview, Calendar, AI Studio, Campaigns, Analytics, Audience, Connections, Team, Developers, Settings, Login, Invite
- API 66 endpoint (session) + 6 endpoint (public) พร้อม RBAC 4 บทบาท
- Multi-tenant 3 workspaces, ข้อมูลตัวอย่าง 120 วัน, 37 โพสต์, 40 contacts
- AI 4 เครื่องยนต์ (copy / plan / cover / insight) ทำงาน offline
- Public API + scopes + rate limit 120/นาที + api logs + webhooks (test)
- ไทย/อังกฤษ 645 คีย์, light/dark, responsive
- ทดสอบ: `npm run typecheck` ผ่าน, `npm run smoke` 52/52, `npm run build` ผ่าน

**ยังไม่จริง:** ตัวเชื่อมแพลตฟอร์มเป็น mock, ตัวเลขเป็นตัวอย่าง, ไม่มี OAuth

---

## 0.1.x — Hardening (2–3 สัปดาห์)

**เป้าหมาย:** ให้ทีมภายใน 2–3 คนใช้จริงกับข้อมูลตัวอย่างได้ทุกวัน โดยไม่เจอ bug ที่บล็อกงาน

ต้องทำ

| งาน | เกณฑ์ผ่าน |
| --- | --- |
| แก้บั๊กจาก dogfooding | ไม่มี bug ระดับ blocker ค้างเกิน 3 วัน |
| ขยาย CI (lint + browser E2E) | ทุก push รัน typecheck + build + smoke ผ่านแล้ว; เพิ่ม lint และ Playwright |
| ปรับ UX ภาษาไทย (วันที่, ตัวเลข, คำผิด) | รีวิวโดยเจ้าของภาษาอย่างน้อย 1 คน |
| Seed ข้อมูล 2 อุตสาหกรรมที่ต่างกัน | มี workspace ตัวอย่างอย่างน้อย 3 แบบ |
| เอกสารผู้ใช้ (quick start 4 หน้า) | ลูกค้าทดลอง setup เองได้ภายใน 15 นาที |
| Accessibility พื้นฐาน | contrast ≥ 4.5, ใช้งานด้วยคีย์บอร์ดได้ทุก modal |

**เกณฑ์ไม่ผ่าน:** ถ้าทีมทดลองแล้วยังต้องกลับไปใช้ Excel/Canva เป็นหลัก → ห้ามขยับเวอร์ชัน

---

## 0.2.0-beta — "ข้อมูลจริงชุดแรก" (Q1 2026)

**เป้าหมาย:** ตัวเลขบนแดชบอร์ดมาจาก API จริง ไม่ใช่ seed

ชอบเขต

1. Meta (Facebook Page + Instagram Business) — read-only metrics
2. LINE OA — follower + broadcast stats
3. OAuth flow จริง + เก็บ token เข้ารหัส (AES-256-GCM)
4. ตาราง `sync_jobs` + cron รายวัน + retry/backoff
5. แสดง `source: live | seed` ใน Analytics และ Connections
6. Unified inbox **แบบอ่านอย่างเดียว** (คอมเมนต์ + DM ของ Meta)

เกณฑ์ผ่าน

- ตัวเลข 7 วันล่าสุดตรงกับ Meta Business Suite ภายใน ±2% (สุ่มตรวจ 3 บัญชี)
- sync ล้มเหลวแล้วระบบกู้คืนเองได้ (ไม่ต้อง restart)
- ไม่มี token หลุดใน log หรือ response
- ผู้ใช้ถอดการเชื่อมต่อแล้ว token ถูกลบภายใน 24 ชม.

---

## 0.3.0-beta — "โพสต์จริง + วางแผนจากข้อมูลจริง" (Q2 2026)

**เป้าหมาย:** กด "ตั้งเวลา" แล้วโพสต์ออกจริง และ AI ใช้ข้อมูลจริงในการแนะนำ

ขอบเขต

1. Publishing ผ่าน Meta (FB/IG) และ LINE broadcast
2. Media upload + จัดการอัตราส่วน/ขนาด
3. AI planner ใช้ heatmap และผลลัพธ์จริงของแบรนด์
4. Contact events (open/click/purchase) + RFM อัตโนมัติ
5. Webhook dispatch จริง พร้อม HMAC signature และ retry
6. รายงานส่งอัตโนมัติ (อีเมล/LINE) และ export PDF

เกณฑ์ผ่าน

- โพสต์จริงสำเร็จ ≥ 98% (วัดจาก 100 โพสต์แรก)
- retry แล้วไม่เกิดโพสต์ซ้ำ (idempotency ผ่านการทดสอบ)
- ลูกค้า 5 รายใช้ตั้งเวลาจริงเป็นประจำทุกสัปดาห์

---

## 0.4.0-beta — "ยิงโฆษณาอย่างมีความรับผิดชอบ" (Q2–Q3 2026)

**เป้าหมาย:** Boost จากในระบบได้ โดยมีการควบคุมงบและการอนุมัติ

ขอบเขต

1. Meta Ads: create/pause/update budget
2. กฎอัตโนมัติ (หยุดเมื่อ CPL > เป้า, เพิ่มงบเมื่อ ROAS > เป้า)
3. Two-person approval สำหรับงบเกิน threshold
4. Sync สถานะแคมเปญจากแพลตฟอร์มทุกชั่วโมง
5. รายงานเปรียบเทียบคู่แข่ง (benchmark ภายนอก)

เกณฑ์ผ่าน

- งบที่ใช้จริงไม่เกินที่ตั้งไว้ ±1%
- มี audit log ทุกการเปลี่ยนงบ
- ไม่มีเหตุการณ์ "โพสต์/แคมเปญค้าง" เกิน 30 นาที

---

## 1.0.0 — "พร้อมขายองค์กร" (Q3–Q4 2026)

**เป้าหมาย:** ผ่านข้อกำหนดขององค์กรขนาดกลาง–ใหญ่

ขอบเขต

1. SSO (SAML/OIDC) + SCIM provisioning
2. 2FA, session revoke, audit log ครบทุก action (เก็บ ≥ 1 ปี)
3. Postgres + Redis + object storage; multi-instance
4. SLA 99.9%, status page, incident process
5. ISO 27001 readiness / PDPA compliance pack
6. Billing & plan limits
7. Mobile-friendly PWA + การแจ้งเตือน push

เกณฑ์ผ่าน

- Penetration test ภายนอก: ไม่มีช่องโหว่ระดับ high/critical
- RTO ≤ 1 ชม., RPO ≤ 15 นาที (ทดสอบจริง)
- ลูกค้าองค์กรอย่างน้อย 2 รายเซ็นสัญญาใช้งาน

---

## สิ่งที่ **ไม่ทำ** ใน Beta (ตั้งใจ)

- ระบบแชทบอท/CRM เต็มรูปแบบ — ซ้ำกับเครื่องมือที่ลูกค้ามี
- เครื่องมือออกแบบกราฟิกแบบละเอียด — ใช้ Canva/Figma แล้วอัปโหลด
- Social listening ทั้งอินเทอร์เน็ต — ต้นทุนข้อมูลสูงเกินสำหรับ Beta
- โมเดล AI เทรนเอง — ใช้ template/LLM ภายนอกก่อน

---

## วิธีเก็บ Feedback

1. **Dogfood ภายใน:** ทีม UAREA ใช้กับ 3 แบรนด์ตัวอย่างทุกสัปดาห์
2. **Beta partner 3–5 ราย:** ธุรกิจต่างขนาด (ร้านอาหาร, คลินิก, B2B) — ประชุมทุก 2 สัปดาห์
3. **วัดผล:** เวลาที่ใช้ต่อรอบเดือน, จำนวนโพสต์ที่ผ่านอนุมัติ, จำนวนครั้งที่ต้องออกนอกระบบ
4. **บันทึก:** ทุกข้อเสนอเข้า issue พร้อมป้าย `beta-feedback` และทบทวนก่อนออกเวอร์ชัน

**เกณฑ์หยุด/ถอย:** ถ้าฟีเจอร์ใหม่ทำให้งานหลัก (ปฏิทิน → อนุมัติ → วัดผล) ช้าลง ให้ถอยออกก่อน
คุณภาพของวงจรหลักสำคัญกว่าจำนวนฟีเจอร์
