# แผนแก้ Performance Qlass แบบไม่กระทบผู้ใช้ (Zero-Impact)

ข้อมูลขึ้นช้ามาก + บางครั้ง timeout จนขึ้น "ไม่พบข้อมูลพนักงาน". แผนนี้แก้ที่ root cause โดย**ไม่ให้กระทบผู้ใช้ ~100 คนที่ใช้งานอยู่**.

> สถานะ: **✅ เฟส 1 + 2 เสร็จแล้ว — ระบบกลับมาใช้งานได้ปกติ**
>
> - ✅ เฟส 1: เพิ่ม index 5 ตัว — **เสร็จ 11 มิ.ย. 2026** (query เร็วขึ้น 20-30 เท่า)
> - ✅ เฟส 2: แยก staff load + progressive queue (2-phase) — **ทำไว้แล้วใน App.jsx**
> - ⏳ เฟส 3: Lazy-load queues เก่า — ยังไม่ทำ (ไม่จำเป็นแล้วเพราะ index เร็วพอ)

---

## สรุปอาการ

- เปิดแอป → รอนานมากกว่าข้อมูลจะขึ้น
- บางครั้ง error: `canceling statement due to statement timeout` (code 57014)
- เมื่อ timeout → ขึ้นหน้า "ไม่พบข้อมูลพนักงาน" ทั้งที่ staff มีข้อมูล

---

## 📊 ข้อมูลวัดจริง (probe ผ่าน `scripts/perf_probe.mjs` — 9 มิ.ย. 2026)

| Query | เวลา | จำนวน |
|---|---|---|
| staff ทั้งหมด | **6,653 ms** | 64 rows |
| queues COUNT ทั้งหมด | 1,606 ms | **59,611 rows** |
| queues COUNT (30 วัน) | 3,461 ms | **35,049 rows** |
| queues page1 ORDER date ทั้งหมด | **8,963 ms** | 1,000 |
| queues page1 ORDER date (30 วัน) | **9,243 ms** | 1,000 |
| room_schedules COUNT | 1,674 ms | 5,753 rows |
| room_schedules page1 | 3,159 ms | 1,000 |

**บทสรุปสำคัญจากตัวเลขจริง:**
1. **queues มี 59,611 แถว** (ไม่ใช่ 9,000 ตามที่เคยประมาณ) → ต้อง paginate ~60 หน้า
2. **`sinceDate` 30 วัน แทบไม่ช่วย** — ยังได้ 35K แถว (58%) และ query **ช้ากว่า**ด้วยซ้ำ (9,243 vs 8,963 ms) → พิสูจน์ว่า**ไม่มี index บน `date`** → filter ก็ full scan เหมือนเดิม
3. **แม้แต่ staff 64 แถว ยังใช้ 6.6 วินาที** → instance ช้า (free tier / cold start) — query แรกมี overhead

➜ สรุป: **index ไม่ใช่ทางเลือกอีกต่อไป — เป็นสิ่งจำเป็น** และ `sinceDate` จะได้ผลก็ต่อเมื่อมี index แล้วเท่านั้น

---

## Root Cause (เรียงตามความรุนแรง)

### 1. 🔴 ตาราง `queues` ไม่มี index เลย — *ตัวการหลัก (ยืนยันด้วย probe แล้ว)*
- `supabase_schema.sql` สร้าง index ให้แค่ `tickets` และ `hn_customers`
- `queues` มีแต่ primary key (`id`) ไม่มี index บน `date`, `room_id`, `branch_id`, `recorded_by`
- `fetchQueues()` รัน `ORDER BY date DESC, time_block ASC` บน **59,611 แถว**
- ไม่มี index → **full table scan + sort ทุกครั้ง (~9 วินาที/page × 60 pages)** → ช้ามาก + ชน statement timeout

### 2. 🟠 โหลด queues ทั้งหมดทุกครั้งที่เปิดแอป
- `getAllQueues()` ดึงทุก record (paginate ทีละ 1000 → 9+ requests parallel)
- หน้า booking/timeline/queue-table ใช้แค่ข้อมูลไม่กี่วัน แต่โหลดทั้งหมด

### 3. 🟠 Promise.all เดียว — queue ล้ม = ทุกอย่างล้ม
- `App.jsx` โหลด staff + queues + ทุกตารางใน `Promise.all` เดียว
- ถ้า queue timeout → ทั้ง batch reject → `staff` ไม่ถูก set → หน้า "ไม่พบข้อมูลพนักงาน"

### 4. 🟡 `room_schedules` ก็ paginate + ไม่มี index บน `room_id`

---

## ⚠️ ข้อควรระวัง — Export/Backup/Commission ต้องใช้ข้อมูลย้อนหลัง

หน้า **Export** มี preset "ปีนี้" + custom date picker (เลือกวันไหนก็ได้) + ปุ่ม **Backup ข้อมูลทั้งหมด**
หน้า **Commission** default เดือนนี้ แต่มี date picker เลือกย้อนหลังได้

➡️ ห้ามจำกัด `sinceDate` แบบตายตัว (ไม่โหลดข้อมูลเก่าเลย) — จะทำให้ Export/Backup/Commission ย้อนหลัง**ข้อมูลขาด (พังแบบเงียบ อันตรายกับคอมมิชชั่น)**
➡️ วิธีที่ใช้ (frontend, ทำไว้แล้ว): **progressive load** — โหลดล่าสุด 30 วันก่อน → แล้วโหลดทั้งหมดต่อใน background → merge → ข้อมูลเก่ายังครบ (แต่ background load ยังช้าจนกว่าจะมี index)

---

## แผนทำจริง (เรียงตามคุ้มค่า/เสี่ยงต่ำ)

| เฟส | สิ่งที่ทำ | ผลลัพธ์ | สถานะ |
|---|---|---|---|
| 1 | **เพิ่ม index บน `queues` + `room_schedules`** | เร็วขึ้น 20-30 เท่า (แก้ root cause) | ✅ **เสร็จ 11 มิ.ย. 2026** |
| 2 | แยก staff load + progressive queue (2-phase) | login ขึ้นเร็ว, ไม่ค้าง | ✅ **เสร็จ (อยู่ใน App.jsx)** |
| 3 | ลด sinceDate window เหลือ ~7 วัน (หลังมี index) | โหลดแรกเบาลงอีก | ⏳ ยังไม่ทำ (ไม่จำเป็นแล้ว) |

---

### เฟส 1 — เพิ่ม Index ✅ เสร็จแล้ว (11 มิ.ย. 2026)

**รันผ่าน Supabase Dashboard → SQL Editor** — ทีละคำสั่ง (CONCURRENTLY)

Indexes ที่สร้าง:
```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_queues_date ON queues (date DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_queues_room_date ON queues (room_id, date);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_queues_branch_id ON queues (branch_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_queues_recorded_by ON queues (recorded_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_room_schedules_room_id ON room_schedules (room_id);
```

**📊 ผลวัดจริง (ก่อน vs หลัง):**

| Query | ก่อน (ไม่มี index) | หลัง (มี index) | เร็วขึ้น |
|---|---|---|---|
| staff (64 rows) | 6,653 ms | **334 ms** | ~20x |
| queues ORDER BY date (59K rows) | 8,963 ms | **292 ms** | ~30x |

**Rollback (ถ้าต้องการ):**
```sql
DROP INDEX CONCURRENTLY idx_queues_date;
DROP INDEX CONCURRENTLY idx_queues_room_date;
DROP INDEX CONCURRENTLY idx_queues_branch_id;
DROP INDEX CONCURRENTLY idx_queues_recorded_by;
DROP INDEX CONCURRENTLY idx_room_schedules_room_id;
```

---

### เฟส 2 — แยก Staff Load (2-Phase) ✅ เสร็จแล้ว

อยู่ใน `App.jsx` `loadFromSupabase()` แล้ว:

- **Phase 1:** `getAllStaff()` อย่างเดียว → set staff → `setIsLoading(false)` → login ขึ้นทันที
- **Phase 2a:** โหลด core data + queues ล่าสุด 30 วัน → `setIsDataReady(true)` → แอปใช้งานได้
- **Phase 2b:** โหลด queues ทั้งหมดใน background → merge เข้า state → Export/Commission ย้อนหลังได้ครบ

**กันปัญหา "login เร็วแต่ข้อมูลยังไม่ขึ้น":**
- state `isDataReady` → ถ้า `currentUser && !isDataReady` → แสดง overlay "กำลังโหลดข้อมูล..." จนข้อมูลครบ

---

### เฟส 3 (ทางเลือก) — Lazy-Load Queues เก่า

**เป้า:** เปิดแอปโหลดแค่ 90 วันล่าสุด (เบามาก) แต่ Export/Backup/Commission ย้อนหลังยังใช้ได้

แนวทาง (ทำเมื่อเฟส 1-2 ยังไม่พอ):
1. ตอน mount: `fetchQueues({ sinceDate: <90 วันก่อน> })` → state `queues`
2. เพิ่ม flag `hasLoadedAll` (false)
3. เมื่อผู้ใช้เข้า Export/Commission **แล้วเลือกช่วงวันที่เก่ากว่า 90 วัน** → trigger `fetchQueues()` เต็ม → merge เข้า state → set `hasLoadedAll = true`
4. ปุ่ม Backup → ถ้า `!hasLoadedAll` ให้โหลดเต็มก่อน export

**ความเสี่ยง:** ปานกลาง — ต้องระวัง logic หน้า Export/Commission/Summary ให้ครบ ไม่งั้นข้อมูลย้อนหลังขาด
**ทดสอบเพิ่ม:** Export "ปีนี้", Backup ทั้งหมด, Commission เดือนก่อนๆ ต้องได้ข้อมูลครบ

---

## ✅ สิ่งที่ทำเสร็จแล้ว

### 11 มิ.ย. 2026
- ✅ รัน SQL เฟส 1 (index) ใน Supabase Dashboard — 5 indexes ทั้งหมด
- ✅ วัดผลจริง — query เร็วขึ้น 20-30 เท่า (staff: 6.6s→0.3s, queues: 9s→0.3s)
- ✅ ปัญหา "ไม่พบข้อมูลพนักงาน" + timeout หายไปแล้ว

### ก่อนหน้า
- ✅ `App.jsx`: แยก staff load (Phase 1) + progressive queue load (Phase 2a 30วัน / Phase 2b ทั้งหมด background merge) + `isDataReady` overlay
- ✅ `supabaseService.js` + `ActivityLogPage.jsx`: เพิ่ม date filter หน้าประวัติการลบ (default วันนี้)
- ✅ `scripts/perf_probe.mjs`: สคริปต์วัดเวลา query (read-only)

## ⏳ สิ่งที่ยังไม่ได้ทำ (ไม่จำเป็นเร่งด่วน)

- เฟส 3: ลด sinceDate window จาก 30 → 7 วัน (ทำได้ แต่ไม่จำเป็นแล้วเพราะ index เร็วพอ)
- fix Marketing/PR (`helpers.js` — branchId null) — ทำแยกทีหลังถ้าต้องการ

## วิธีทดสอบก่อน deploy (กันพังกับ 100 คน)
1. เฟส 1: รัน SQL บน Supabase ได้เลย (CONCURRENTLY ไม่ล็อก) — วัด EXPLAIN ANALYZE ก่อน/หลัง
2. เฟส 2-3: ทดสอบบน local ก่อน → login ครบทุก role → เช็ค booking/timeline/queue-table/summary/commission/export/backup ครบ
3. Deploy ผ่าน branch + PR (main ป้องกัน push ตรง) — Vercel auto-deploy
4. Deploy นอกเวลาทำการ + เตรียม revert

## แผนถอย (Rollback)
- เฟส 1: `DROP INDEX CONCURRENTLY ...`
- เฟส 2-3: revert PR ทีละเฟส
