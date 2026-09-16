# ส่งต่อให้ทีม Data — วิธีดึงข้อมูลสถิติคิวแบบอัตโนมัติ

เอกสารนี้เขียนไว้ให้ **ทีม Data ก๊อปทั้งไฟล์ไปวางในแชทกับ AI ผู้ช่วยเขียนโค้ด** (ChatGPT, Claude, Copilot ฯลฯ) แล้วให้ AI นั้นเขียนสคริปต์ดึงข้อมูลอัตโนมัติให้เลย — ไม่ต้องมีความรู้โค้ดมาก่อน

---

## นี่คืออะไร

Qlass (ระบบคิวคลินิก) มี API สำหรับดึง **จำนวนคิวแบบรวมยอด** (ไม่ใช่ข้อมูลลูกค้ารายคน) ออกไปใช้ต่อได้ เช่น เอาไปจับคู่กับยอดค่าโฆษณาเพื่อคำนวณต้นทุนต่อคิว, ทำแดชบอร์ด, หรือดึงเข้า Google Sheet/BigQuery อัตโนมัติทุกวัน

**ข้อมูลที่ได้:** จำนวนคิวแยกตามสถานะ/สาขา/หัตถการ/โปรโมชัน/รายวัน
**ข้อมูลที่ไม่ได้ (ตั้งใจไม่ให้):** ชื่อ เบอร์โทร โน้ตลูกค้า และราคา (`price`)

---

## รายละเอียด API

```
GET https://hjuvtsjjtucdirlkdgwa.supabase.co/functions/v1/external-queue-stats?since=2026-08-01&until=2026-08-31
Header: Authorization: Bearer <API_KEY>
```

- `since`, `until` — บังคับใส่ทั้งคู่ รูปแบบ `YYYY-MM-DD` ช่วงห่างกันไม่เกิน 370 วัน
- เมธอดอื่นนอกจาก `GET` จะถูกปฏิเสธ
- ต้องมี header `Authorization: Bearer <API_KEY>` ทุกครั้ง ไม่งั้นได้ `401 unauthorized`

`<API_KEY>` ให้ขอจากทีมเทคนิค (ดูหัวข้อ "เรื่องความปลอดภัย" ด้านล่างว่าทำไมเอกสารนี้ไม่ใส่ค่าจริงไว้) — URL ด้านบนเป็นของจริงแล้ว ใช้ได้เลย (ตรวจสอบแล้วว่า function deploy อยู่และคีย์ตั้งค่าพร้อมใช้งาน)

### ตัวอย่าง response

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
  "procedures": [ { "name": "Hifu", "total": 1252, "done": 980, "noShow": 190,
                    "cancelled": 40, "newCustomers": 310, "courseCustomers": 620 } ],
  "promos":     [ { "name": "โปรประจำเดือน", "total": 784, "done": 610, "newCustomers": 240 } ],
  "daily":      [ { "date": "2026-08-01", "total": 640, "done": 520, "noShow": 60 } ]
}
```

**หมายเหตุการจัดกลุ่มสถานะ:** `pending` รวม pending + waiting_queue + follow1-3 · `rescheduled` รวม rescheduled + rescheduled_in · คิวที่ไม่ระบุสาขา/หัตถการ/โปร จะขึ้นเป็นแถวชื่อ "ไม่ระบุสาขา"/"ไม่ระบุหัตถการ"/"ไม่ระบุโปร" (ไม่หายไปเฉยๆ)

---

## พรอมต์พร้อมใช้ — วางให้ AI ผู้ช่วยของคุณเขียนสคริปต์ให้

ก๊อปข้อความด้านล่างทั้งหมด (รวมส่วน API ด้านบน) ไปวางในแชทกับ AI แล้วบอกเขาว่าจะดึงไปไว้ที่ไหน:

> ช่วยเขียนสคริปต์ที่ดึงข้อมูลจาก REST API ด้านล่างนี้โดยอัตโนมัติ (เช่น รันทุกวันตอนเช้าด้วย cron หรือ scheduled task):
>
> - Endpoint: `GET https://hjuvtsjjtucdirlkdgwa.supabase.co/functions/v1/external-queue-stats?since=YYYY-MM-DD&until=YYYY-MM-DD`
> - Auth header: `Authorization: Bearer <API_KEY>` (ฉันจะใส่ค่าจริงเป็น environment variable ชื่อ `QLASS_STATS_API_KEY` เอง ห้าม hardcode คีย์ลงในโค้ด)
> - ให้ดึงข้อมูลของ "เมื่อวาน" ทุกครั้งที่รัน (since = until = เมื่อวาน) แล้วเอา field `totals`, `branches`, `daily` ไปเขียนต่อท้าย [**บอก AI ว่าจะเก็บที่ไหน เช่น "Google Sheet ชื่อ X แท็บ Y" หรือ "ตาราง BigQuery ชื่อ Z" หรือ "ไฟล์ CSV ในโฟลเดอร์ ..."**]
> - ถ้า response ไม่ใช่ status 200 ให้ retry 1 ครั้งแล้ว log error ไว้ ไม่ต้องหยุดทั้งระบบ
> - เขียนคำแนะนำวิธีตั้ง environment variable และวิธี schedule ให้รันอัตโนมัติด้วย (ตามแพลตฟอร์มที่ฉันจะใช้ เช่น Google Apps Script / GitHub Actions / cron บนเครื่อง — บอก AI ว่าจะใช้อะไร)

ใส่ปลายทางที่อยากเก็บข้อมูล (Sheet/DB/CSV) และแพลตฟอร์มที่จะรัน schedule ให้ชัดในพรอมต์ ก่อนส่งให้ AI จะได้โค้ดที่ใช้งานได้จริงโดยไม่ต้องถามกลับหลายรอบ

---

## เรื่องความปลอดภัย (สำคัญ อ่านก่อนใช้งาน)

1. **อย่าวาง API key จริงลงในแชทกับ AI ผู้ช่วย** — AI tool บางตัวเก็บ log การสนทนาไว้ฝั่งเขา ถ้าคีย์หลุดเข้าไปในนั้นเท่ากับหลุดออกจากมือเราแล้ว ให้ AI เขียนโค้ดที่ "อ่านคีย์จาก environment variable" แทน แล้วค่อยเอาคีย์จริงไปใส่เองตอนตั้งค่ารันจริง (ไม่ใช่พิมพ์ในพรอมต์)
2. **คีย์นี้อ่านได้อย่างเดียว ทำอะไรฐานข้อมูลไม่ได้** — แต่ก็ยังควรเก็บเหมือนรหัสผ่าน ไม่แชร์ในแชทกลุ่ม ไม่ใส่ในโค้ดที่ push ขึ้น public repo
3. **ถ้าสงสัยว่าคีย์หลุด** แจ้งทีมเทคนิคเพื่อ revoke/สร้างคีย์ใหม่ได้ทันที ไม่กระทบระบบ login ของพนักงาน
4. ขอ `<PROJECT_REF>` และ `<API_KEY>` จริงจากทีมเทคนิคผ่านช่องทางส่วนตัว (ไม่ใช่แชทกลุ่มหรือเอกสารที่แชร์วงกว้าง)

---

*อ้างอิงรายละเอียดฉบับเต็ม: `docs/EXTERNAL_QUEUE_STATS_API.md` ในโค้ด Qlass*
