# Deploy SocialMK (Beta) ขึ้น Production

เป้าหมาย: ให้ `https://socialmk.example.com` เปิดได้จากอินเทอร์เน็ต
โดย API และ SPA อยู่ใน origin เดียว (ไม่ต้องตั้ง CORS) และข้อมูลอยู่ในโฟลเดอร์ที่ backup ได้

---

## 1. สิ่งที่ต้องมี

| รายการ | ขั้นต่ำ |
| --- | --- |
| เครื่อง | 1 vCPU / 1 GB RAM / 20 GB SSD (Linux x86_64 หรือ arm64) |
| Node.js | **≥ 22.5** (ต้องมี `node:sqlite`) |
| Reverse proxy | Nginx (แนะนำ) หรือ Caddy |
| โดเมน + TLS | Let's Encrypt / Cloudflare |
| Backup | พื้นที่ภายนอกเครื่อง (S3, R2, หรือ NAS) |

> SQLite เหมาะกับ 1 process เท่านั้น — ห้ามรันหลาย instance ชี้ไฟล์เดียวกัน

---

## 2. ติดตั้งแบบ manual (systemd)

```bash
sudo useradd -r -m -d /opt/socialmk socialmk
sudo -u socialmk git clone https://github.com/ProAke/SocialMK.git /opt/socialmk
cd /opt/socialmk
sudo -u socialmk npm ci
sudo -u socialmk cp .env.example .env
sudo -u socialmk npm run build      # web + api
```

สร้างโฟลเดอร์ข้อมูลถาวร:

```bash
sudo mkdir -p /var/lib/socialmk
sudo chown socialmk:socialmk /var/lib/socialmk
```

`.env` (ห้าม commit):

```bash
PORT=4000
HOST=127.0.0.1
SOCIALMK_JWT_SECRET=<สุ่ม 48 bytes>
SOCIALMK_DATA_DIR=/var/lib/socialmk
NODE_ENV=production
```

สร้าง secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Seed ครั้งแรก (ถ้าต้องการข้อมูลตัวอย่าง):

```bash
sudo -u socialmk env $(cat .env | xargs) npm run seed:prod
```

### systemd unit

`/etc/systemd/system/socialmk.service`

```ini
[Unit]
Description=SocialMK API + SPA
After=network.target

[Service]
Type=simple
User=socialmk
Group=socialmk
WorkingDirectory=/opt/socialmk
EnvironmentFile=/opt/socialmk/.env
ExecStart=/usr/bin/node apps/api/dist/index.js
Restart=always
RestartSec=5
# hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/socialmk
LimitNOFILE=4096

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now socialmk
curl -s localhost:4000/api/health
```

---

## 3. Nginx

```nginx
server {
  listen 80;
  server_name socialmk.example.com;
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl http2;
  server_name socialmk.example.com;

  ssl_certificate     /etc/letsencrypt/live/socialmk.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/socialmk.example.com/privkey.pem;

  client_max_body_size 20m;
  gzip on;
  gzip_types application/javascript application/json text/css image/svg+xml;

  # hashed assets — cache ยาว
  location /assets/ {
    proxy_pass http://127.0.0.1:4000;
    proxy_set_header Host $host;
    add_header Cache-Control "public, max-age=31536000, immutable";
  }

  # ภาพที่ AI สร้าง — cache 30 วัน
  location /media/ {
    proxy_pass http://127.0.0.1:4000;
    proxy_set_header Host $host;
    add_header Cache-Control "public, max-age=2592000";
  }

  location / {
    proxy_pass http://127.0.0.1:4000;
    proxy_http_version 1.1;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 60s;
  }
}
```

```bash
sudo certbot --nginx -d socialmk.example.com
```

---

## 4. Docker (ทางเลือก)

```bash
cp .env.example .env    # ตั้ง SOCIALMK_JWT_SECRET
docker compose up -d --build
docker compose logs -f api
```

- ข้อมูลอยู่ใน named volume `socialmk-data`
- container รันด้วย user `node` และมี healthcheck ที่ `/api/health`
- ถ้าต้องการ TLS ให้วาง Caddy/Traefik/Nginx ไว้ข้างหน้า

> Dockerfile ถูกเตรียมไว้ให้แล้ว แต่ยังไม่ได้ทดสอบใน CI ของโปรเจกต์ — ตรวจ log ก่อนใช้จริง

---

## 5. Backup และกู้คืน

**สิ่งที่ต้อง backup**

1. ฐานข้อมูล `socialmk.db` (และ `-wal`, `-shm`)
2. โฟลเดอร์ `assets/` (ภาพที่ AI สร้าง)
3. ไฟล์ `secret.key` — ถ้าไม่ได้ตั้ง `SOCIALMK_JWT_SECRET` (ถ้าหาย ทุกคนต้อง login ใหม่)
4. `.env`

**สคริปต์ nightly (cron 02:30)**

```bash
#!/usr/bin/env bash
set -euo pipefail
DATA=/var/lib/socialmk
OUT=/var/backups/socialmk/$(date +%F)
mkdir -p "$OUT"
sqlite3 "$DATA/socialmk.db" "PRAGMA wal_checkpoint(TRUNCATE);"
sqlite3 "$DATA/socialmk.db" ".backup '$OUT/socialmk.db'"
tar -czf "$OUT/assets.tar.gz" -C "$DATA" assets
find /var/backups/socialmk -type d -mtime +14 -exec rm -rf {} +
```

> ถ้าเครื่องไม่มี `sqlite3` CLI ให้ `systemctl stop socialmk` แล้ว copy ไฟล์ทั้งสาม (db, -wal, -shm) แทน

**ทดสอบกู้คืนทุกเดือน**

```bash
sudo systemctl stop socialmk
sudo -u socialmk cp /var/backups/socialmk/2026-10-30/socialmk.db /var/lib/socialmk/socialmk.db
sudo systemctl start socialmk
```

---

## 6. อัปเดตเวอร์ชัน

```bash
cd /opt/socialmk
sudo -u socialmk git pull
sudo -u socialmk npm ci
sudo -u socialmk npm run build
sudo systemctl restart socialmk
curl -s localhost:4000/api/health
```

**หมายเหตุ:** สคีมาสร้างด้วย `CREATE TABLE IF NOT EXISTS` — การเพิ่มคอลัมน์ในอนาคต
ต้องมี migration (แนะนำ Drizzle/Prisma) ก่อนเปิดใช้กับลูกค้าจริง

---

## 7. Checklist ก่อนเปิดให้ลูกค้าใช้

- [ ] ตั้ง `SOCIALMK_JWT_SECRET` เป็นค่าสุ่มและเก็บใน secret manager
- [ ] `HOST=127.0.0.1` เบื้องหลัง Nginx (ไม่เปิด 4000 สู่อินเทอร์เน็ต)
- [ ] เปลี่ยนรหัสผ่านบัญชี demo ทั้งหมด หรือลบข้อมูล seed (`npm run db:reset` หลังแก้ seed)
- [ ] เปิด HTTPS + HSTS ที่ Nginx
- [ ] ตั้ง backup รายวันและทดสอบกู้คืนแล้วอย่างน้อย 1 ครั้ง
- [ ] จำกัดสิทธิ์โฟลเดอร์ข้อมูล (`chmod 700`, owner = user ที่รัน service)
- [ ] ตรวจ `/api/health` ด้วย uptime monitor
- [ ] ตั้ง log rotation (`journald` หรือ logrotate) — API log ไปที่ stdout
- [ ] ทบทวน rate limit (120/นาที/คีย์) กับปริมาณใช้งานจริง
- [ ] เพิ่ม security header ระดับ Nginx (CSP, HSTS) หลังทดสอบกับ SPA แล้ว

---

## 8. เมื่อต้องขยาย

| อาการ | ทางแก้ |
| --- | --- |
| SQLite lock / ช้าเมื่อเขียนถี่ | ย้ายไป Postgres + connection pool |
| ต้องการหลาย instance | ย้าย rate limit/session ไป Redis + sticky session หรือ stateless JWT |
| metric query ช้า | partition ตาราง metrics รายเดือน + rollup รายวัน |
| ไฟล์/assets เยอะ | ย้ายไป S3/R2 + CDN, เก็บแค่ metadata |
| ต้องส่ง webhook/โพสต์ตามเวลา | เพิ่ม worker (BullMQ) แยก process |
| ต้องการ audit ที่ตรวจสอบได้ | append-only audit log + external sink (1.0) |

ทั้งหมดนี้ไม่ต้องแก้ frontend เพราะทุกอย่างคุยผ่าน API สัญญาเดิม
