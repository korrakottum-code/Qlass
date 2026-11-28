# API ภายนอก: ยอดโอนมัดจำแคมเปญ 6 ปี (`deposit-campaign-stats`)

ให้แดชบอร์ดของทีมโฆษณาดึง **ยอดรวม** ของรายการ "ลูกค้าโอนแล้ว รอจองคิว" (เช่น ทุก 30 นาที) โดยไม่ต้องเข้าฐานข้อมูล Qlass และไม่มีข้อมูลลูกค้าออกจากระบบ ใช้ชั่วคราวช่วงแคมเปญเท่านั้น และ**ปิดเองตั้งแต่ 4 ธ.ค. 2569** (เวลาไทย)

```
GET https://<project>.supabase.co/functions/v1/deposit-campaign-stats
GET https://<project>.supabase.co/functions/v1/deposit-campaign-stats?since=2026-11-23&until=2026-11-27
Header: Authorization: Bearer <QLASS_DEPOSIT_STATS_API_KEY>
```

ถ้าไม่ส่ง `since` และ `until` จะได้ 30 วันล่าสุด (นับวันนี้ด้วย) ย้อนหลังได้ไม่เกิน 30 วัน และขอวันในอนาคตไม่ได้

ตอบกลับ:

```json
{
  "since": "2026-10-29",
  "until": "2026-11-27",
  "expiresAfter": "2026-12-03",
  "asOf": "2026-11-27T03:00:00.000Z",
  "totals": {
    "count": 452, "amount": 1234560,
    "bookedCount": 120, "bookedAmount": 358800,
    "notBookedCount": 332, "notBookedAmount": 875760,
    "cancelledCount": 12, "cancelledAmount": 35880
  },
  "rows": [
    { "date": "2026-11-27", "branchId": "…", "branchName": "ขอนแก่น",
      "promoName": "โปร 6 ปี Bienox 100u 2990฿", "procedureName": "Botox",
      "status": "active", "booked": true, "count": 3, "amount": 8970 }
  ]
}
```

(ตัวเลขข้างบนเป็นตัวอย่าง ไม่ใช่ยอดจริง)

## ความหมายของแต่ละช่อง

- `date` คือวันที่บันทึก (record_date) แบบเดียวกับการ์ดสรุปในหน้า "ลูกค้าโอนแล้ว รอจองคิว" ตัวเลขจึงตรงกับหน้า Qlass
- `status` มี 2 ค่า: `active` คือรายการปกติ ส่วน `cancelled` คือยกเลิกหรือคืนเงิน (ในระบบเป็นปุ่มเดียวกัน จึงแยกสองอย่างนี้ไม่ได้)
- `booked` เป็น `true` เมื่อคิวล่าสุดของรายการ (ไล่ตามการเลื่อนนัดแล้ว) ไม่ได้เป็น ยกเลิก / ไม่มา / เลื่อนออก ทั้งนี้นับคิวรอและลูกค้าที่มาทำแล้วเป็นจองแล้วด้วย และรายการ `cancelled` จะเป็น `false` เสมอ
- `totals.count` และ `totals.amount` ไม่นับรายการที่ยกเลิกหรือคืนเงิน เหมือนหน้า Qlass
- `amount` เป็นบาท

## สิ่งที่ไม่มีใน API นี้ (ตั้งใจ)

API นี้ไม่ส่งชื่อลูกค้า เบอร์ สลิป หมายเหตุ เหตุผลยกเลิก ชื่อหรือ id ของพนักงานที่บันทึก และ id ของรายการหรือคิว ทุกอย่างรวมยอดใน SQL (`public.deposit_campaign_stats_v1`) ข้อมูลรายแถวจึงไม่ออกจากฐานข้อมูล

## ข้อจำกัด

| กรณี | ตอบ |
|---|---|
| ไม่มีคีย์ / คีย์ผิด | `401 unauthorized` |
| ยังไม่ได้ตั้งคีย์ หรือคีย์สั้นกว่า 32 ตัว หรือคีย์ซ้ำกับ `QLASS_EXTERNAL_API_KEY` | `503 api_not_configured` |
| ย้อนเกิน 30 วัน หรือวันในอนาคต | `400 range_out_of_window` |
| เรียกเกิน 30 ครั้งในชั่วโมงเดียว (ทุกคนรวมกัน) | `429 rate_limited` |
| ตั้งแต่ 4 ธ.ค. 2569 | `410 api_expired` |

## ตั้งค่า (เจ้าของระบบทำเอง ห้ามส่งค่าคีย์ในแชท)

1. รัน migration `20261127120000_deposit_campaign_stats.sql`
2. สร้างคีย์ใหม่ที่ไม่ซ้ำกับคีย์อื่น (`openssl rand -base64 48`) แล้วตั้งค่า:
   ```bash
   supabase secrets set QLASS_DEPOSIT_STATS_API_KEY=...
   ```
3. deploy ฟังก์ชันโดยไม่ตรวจ JWT (ฟังก์ชันตรวจคีย์เอง):
   ```bash
   supabase functions deploy deposit-campaign-stats --no-verify-jwt
   ```
4. ส่งคีย์ให้ทีมโฆษณาผ่านช่องทางที่ปลอดภัย

**เพิกถอน:** ลบ secret (`supabase secrets unset QLASS_DEPOSIT_STATS_API_KEY`) ฟังก์ชันจะตอบ 503 ทันที และไม่กระทบส่วนอื่นของระบบ ส่วน**ล้างออกทั้งหมดหลังแคมเปญ** ให้ลบฟังก์ชันแล้วรัน `supabase/rollback/20261127120000_deposit_campaign_stats.sql`

## รายชื่อ + เบอร์ลูกค้า (`deposit-campaign-list`) — เพิ่ม 28 พ.ย. 2569

เจ้าของสั่งให้ทีมโฆษณาดึงชื่อและเบอร์ลูกค้าได้ด้วย โดย**ใช้คีย์เดิม** (`QLASS_DEPOSIT_STATS_API_KEY`) ไม่สร้างคีย์ใหม่ เป็นฟังก์ชันใหม่แยกจากยอดรวม (ยอดรวมไม่ถูกแก้)

```
GET https://<project>.supabase.co/functions/v1/deposit-campaign-list
GET https://<project>.supabase.co/functions/v1/deposit-campaign-list?since=2026-11-23&until=2026-11-27
Header: Authorization: Bearer <คีย์เดียวกับยอดรวม>
```

ตอบรายแถว (ใหม่สุดก่อน): `date`, `branchName`, `promoName`, `procedureName`, `amount`, `status` (`active` / `cancelled`), `booked`, `customerName`, `customerPhone` — ไม่มีสลิป หมายเหตุ เหตุผลยกเลิก ผู้บันทึก หรือ id ใด ๆ

ข้อจำกัดเหมือนยอดรวม (30 วัน, หมดอายุ 4 ธ.ค. 2569) แต่นับ 30 ครั้ง/ชม. แยกจากยอดรวม **ลบคีย์ = ปิดทั้งยอดรวมและรายชื่อ** ถ้าจะปิดเฉพาะรายชื่อ ให้ลบฟังก์ชัน `deposit-campaign-list` แล้วรัน `supabase/rollback/20261128120000_deposit_campaign_list.sql`

ข้อมูลนี้เป็นข้อมูลส่วนบุคคลของลูกค้า: ผู้รับคีย์ต้องเก็บคีย์และข้อมูลที่ดึงไปอย่างระวัง ใช้เพื่องานแคมเปญเท่านั้น
