# API ภายนอก: สถิติคิว (`external-queue-stats`)

ให้ระบบอื่น (เช่น แดชบอร์ดผู้บริหาร) ดึง **จำนวนคิวแบบรวมยอด** ไปใช้ต่อ เช่น จับคู่กับยอดโฆษณาเพื่อคำนวณต้นทุนต่อคิว — โดย**ไม่ต้องให้สิทธิ์เข้าฐานข้อมูล Qlass** และ**ไม่มีข้อมูลลูกค้าออกจากระบบ**

```
GET https://<project>.supabase.co/functions/v1/external-queue-stats?since=2026-08-01&until=2026-08-31
Header: Authorization: Bearer <QLASS_EXTERNAL_API_KEY>
```

ตอบกลับ:

```json
{
  "since": "2026-08-01",
  "until": "2026-08-31",
  "asOf": "2026-08-29T02:15:22.307Z",
  "totals": {
    "total": 18240, "done": 14980, "noShow": 1620, "cancelled": 980,
    "confirmed": 420, "pending": 240, "rescheduled": 0,
    "newCustomers": 4310, "returningCustomers": 12840, "courseCustomers": 1090
  },
  "branches": [
    { "branchId": "…", "name": "อุดรธานี", "total": 1180, "done": 990, "noShow": 120,
      "cancelled": 70, "confirmed": 0, "pending": 0, "rescheduled": 0,
      "newCustomers": 280, "returningCustomers": 830, "courseCustomers": 70 }
  ],
  "daily": [ { "date": "2026-08-01", "total": 640, "done": 520, "noShow": 60 } ]
}
```

## ตั้งค่า

1. สร้างคีย์ยาวอย่างน้อย 32 ตัวอักษร:
   ```bash
   openssl rand -base64 48
   ```
2. ตั้งเป็น secret ของโปรเจกต์:
   ```bash
   supabase secrets set QLASS_EXTERNAL_API_KEY=...
   ```
3. รัน migration `20260829090000_external_queue_stats.sql` (สร้าง RPC `public.external_queue_stats`)
4. deploy ฟังก์ชันแบบไม่ตรวจ JWT ของ Supabase เพราะฟังก์ชันตรวจ API key เอง:
   ```bash
   supabase functions deploy external-queue-stats --no-verify-jwt
   ```

ถ้ายังไม่ได้ตั้ง `QLASS_EXTERNAL_API_KEY` หรือคีย์สั้นกว่า 32 ตัวอักษร ฟังก์ชันจะตอบ `503` และปิดรับทุก request (fail closed)

## เรื่องที่ตั้งใจออกแบบไว้แบบนี้

- **ไม่มีข้อมูลส่วนบุคคลเลย** — การรวมยอดทำใน SQL (`public.external_queue_stats`) ซึ่งอ่านจาก `queues` แค่ 4 คอลัมน์: `branch_id`, `date`, `status`, `customer_type` · ชื่อ เบอร์โทร โน้ต และ `id` ของคิว ไม่เคยออกจากฐานข้อมูล
- **ไม่คืน `price`** โดยตั้งใจ — ยอดขายใช้จากระบบบัญชี ไม่ใช่จากโปรแกรมลงคิว endpoint นี้ตอบเรื่อง "จำนวนคิว" อย่างเดียว
- **คนละคีย์กับการล็อกอินของทีม** — เพิกถอน `QLASS_EXTERNAL_API_KEY` ได้โดยไม่กระทบ `staff-session` และคีย์นี้ทำอย่างอื่นไม่ได้นอกจากอ่านสถิติ
- **ไม่มี CORS allowlist** เพราะไม่ใช่ฟังก์ชันที่เบราว์เซอร์เรียก เป็น server-to-server ที่ถือ secret key · ฟังก์ชันไม่ตอบ header CORS ให้ใคร หน้าเว็บข้ามโดเมนจึงเรียกไม่ได้อยู่แล้ว (ต่างจาก `staff-session` / `search-hn` ที่เบราว์เซอร์เรียกตรงจึงต้องมี origin allowlist)
- **RPC ให้สิทธิ์เฉพาะ `service_role`** — `anon` และ `authenticated` เรียกไม่ได้ ตามแนวเดียวกับ goal18 ที่ถอนสิทธิ์ browser role
- รวมยอดใน SQL แทนการดึงแถวมานับใน Edge Function เพราะ `queues` โตเรื่อยๆ การดึงแถวต้องวนเพจทีละ 1000 และเอาข้อมูลลูกค้าผ่าน memory โดยไม่จำเป็น
- อ่านอย่างเดียว ไม่มีคำสั่งเขียนใดๆ

## ข้อจำกัด

- `since` และ `until` บังคับคู่กันเสมอ รูปแบบ `YYYY-MM-DD` ช่วงไม่เกิน 370 วัน
- รับเฉพาะ `GET` (อย่างอื่นตอบ `405`)
- `status` ถูกจัดกลุ่มไว้แล้ว: `pending` รวม `pending` + `waiting_queue` + `follow1..3` · `rescheduled` รวม `rescheduled` + `rescheduled_in`
- คิวที่ยังไม่ระบุสาขา (`branch_id` เป็น null) จะรวมอยู่ในรายการชื่อ `ไม่ระบุสาขา` ไม่ถูกทิ้งเงียบๆ
