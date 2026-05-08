# HN Sync — Pro Clinic → Supabase

ดึงข้อมูลลูกค้า (HN) จากระบบ Pro Clinic แล้ว sync เข้า Supabase table `hn_customers` อัตโนมัติ

## Setup

### 1. สร้าง table ใน Supabase
รัน SQL จากไฟล์ `hn_customers.sql` ใน Supabase SQL Editor

### 2. ติดตั้ง Python dependencies
```bash
cd hn_sync
pip install -r requirements.txt
```

### 3. สร้างไฟล์ .env
```bash
copy .env.example .env
```
แล้วแก้ไขค่าให้ถูกต้อง:
- `PROCLINIC_EMAIL` — อีเมล login Pro Clinic
- `PROCLINIC_PASSWORD` — รหัสผ่าน
- `SUPABASE_URL` — URL ของ Supabase project
- `SUPABASE_SERVICE_KEY` — **Service Role Key** (ไม่ใช่ anon key)

> ⚠️ ใช้ **Service Role Key** เพราะต้อง upsert โดยไม่ผ่าน RLS

### 4. รัน sync
```bash
python sync.py
```

## Schedule รันอัตโนมัติ (ทุกสัปดาห์) — GitHub Actions

Workflow อยู่ที่ `.github/workflows/hn-sync.yml` รันอัตโนมัติทุกวันจันทร์ 03:00 น. เวลาไทย

### Setup GitHub Secrets (ทำครั้งเดียว)
ไปที่ GitHub repo → Settings → Secrets and variables → Actions → New repository secret

เพิ่ม 4 secrets:
| Name | Value |
|---|---|
| `PROCLINIC_EMAIL` | อีเมล login Pro Clinic |
| `PROCLINIC_PASSWORD` | รหัสผ่าน |
| `SUPABASE_URL` | `https://xxx.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Service Role Key จาก Supabase Dashboard |

### Manual Trigger
ถ้าอยากรันตอนไหนก็ได้:
1. ไปที่ GitHub repo → Actions → "HN Sync"
2. กด "Run workflow"

### วิธีทำงาน
- ใช้ Xvfb (virtual display) ให้ Playwright เปิด browser บน server ได้
- Cookies ถูก cache ไว้ระหว่าง runs → ถ้ายังไม่หมดอายุจะไม่ต้อง login ใหม่
- ถ้า cookie หมดอายุ → login ใหม่อัตโนมัติ

### Windows (สำรอง)
ถ้าอยาก run บนเครื่องตัวเอง:
```bash
cd hn_sync
python sync.py
```
