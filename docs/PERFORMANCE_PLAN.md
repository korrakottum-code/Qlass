# แผนแก้ Performance Qlass แบบไม่กระทบผู้ใช้ (Zero-Impact)

ข้อมูลขึ้นช้ามาก + บางครั้ง timeout จนขึ้น "ไม่พบข้อมูลพนักงาน". แผนนี้แก้ที่ root cause โดย**ไม่ให้กระทบผู้ใช้ ~100 คนที่ใช้งานอยู่**.

> สถานะ: **PR พร้อมแล้ว — รอเพิ่ม index ก่อน merge**
>
> - Branch: `perf/faster-login-load` (push แล้ว)
> - PR: https://github.com/korrakottum-code/Qlass/pull/new/perf/faster-login-load
>
> ⚠️ **อย่า merge ก่อนเพิ่ม index** — Phase 2b โหลด queues 2 รอบ (~35+60 pages) แทนที่ 1 รอบ (~60 pages) → ถ้ายังไม่มี index จะ**เพิ่มภาระ DB มากกว่าเดิม** บน free tier + 100 คน

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

| เฟส | สิ่งที่ทำ | ผลลัพธ์ | กระทบผู้ใช้ | เสี่ยงพัง | แก้ที่ |
|---|---|---|---|---|---|
| 1 | **เพิ่ม index บน `queues` + `room_schedules`** 🔴จำเป็น | เร็วขึ้น 10-50 เท่า (แก้ root cause) | ❌ ไม่กระทบ (CONCURRENTLY) | ต่ำมาก | Supabase SQL |
| 2 | แยก staff load + progressive queue (2-phase) | login ขึ้นเร็ว, ไม่ค้าง | ❌ ไม่กระทบ | ต่ำ | `App.jsx` ✅ทำแล้ว |
| 3 | ลด sinceDate window เหลือ ~7 วัน (หลังมี index) | โหลดแรกเบาลงอีก | ❌ ไม่กระทบ | ต่ำ | `App.jsx` |

---

### เฟส 1 — เพิ่ม Index (ทำก่อน, คุ้มสุด, เสี่ยงต่ำสุด)

**ทำใน Supabase Dashboard → SQL Editor** (ไม่ต้อง deploy code)

ใช้ `CREATE INDEX CONCURRENTLY` เพื่อ**ไม่ล็อกตารางระหว่างสร้าง** (ผู้ใช้ยังเขียน/อ่านได้ปกติ):

```sql
-- index หลัก: เร่ง ORDER BY date + filter ตามวัน
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_queues_date
  ON queues (date DESC);

-- เร่งการเช็ค conflict ห้อง+วัน (fetchQueuesForRoomDate)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_queues_room_date
  ON queues (room_id, date);

-- เร่ง filter ตามสาขา
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_queues_branch_id
  ON queues (branch_id);

-- เร่งคำนวณคอมมิชชั่นรายพนักงาน
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_queues_recorded_by
  ON queues (recorded_by);

-- room_schedules: เร่ง map ตามห้อง
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_room_schedules_room_id
  ON room_schedules (room_id);
```

**หมายเหตุ:** `CREATE INDEX CONCURRENTLY` ต้องรัน**ทีละคำสั่ง** (ห้ามอยู่ใน transaction block เดียวกัน) — รันทีละบรรทัด

**วิธีตรวจว่าได้ผล (ก่อน/หลัง):**
```sql
EXPLAIN ANALYZE
SELECT * FROM queues ORDER BY date DESC, time_block ASC LIMIT 1000;
```
- ก่อน: เห็น `Seq Scan` + เวลานาน
- หลัง: เห็น `Index Scan using idx_queues_date` + เวลาลดลงมาก

**ผลกระทบผู้ใช้:** ❌ ไม่มี — แค่เร็วขึ้น
**Rollback:** `DROP INDEX CONCURRENTLY idx_queues_date;` (ฯลฯ)

---

### เฟส 2 — แยก Staff Load (2-Phase)

แก้ `App.jsx` `loadFromSupabase()`:

- **Phase 1:** `getAllStaff()` อย่างเดียว → set staff → `setIsLoading(false)` → login ขึ้นทันที
- **Phase 2:** ตารางที่เหลือ (รวม queues) ใน `Promise.all` แยก try/catch → ถ้า queue ล้ม ก็ไม่กระทบ staff/login

**กันปัญหา "login เร็วแต่ข้อมูลยังไม่ขึ้น":**
- เพิ่ม state `isDataReady` (default false) → set true เมื่อ Phase 2 เสร็จ
- ถ้า `currentUser && !isDataReady` → แสดง overlay "กำลังโหลดข้อมูล..." จนข้อมูลครบ

**ผลกระทบผู้ใช้:** ❌ ไม่มี — UX เหมือนเดิม แค่ login ขึ้นเร็วขึ้นและไม่ค้างถ้า queue ช้า
**ทดสอบ:** login ครบทุก role (cashier/admin/superadmin/ceo/branch_manager) — เห็นข้อมูลครบ
**Rollback:** revert commit เดียว

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

## ลำดับทำตอนดึก (คนใช้น้อย)

1. รัน SQL เฟส 1 (index) ใน Supabase Dashboard — ทีละบรรทัด (CONCURRENTLY)
2. วัดซ้ำด้วย `node scripts/perf_probe.mjs` — queues page1 ควรลดจาก ~9,000 ms เหลือหลักร้อย ms
3. ถ้า index ได้ผล → ลด sinceDate window ใน `App.jsx` Phase 2a จาก 30 → 7 วัน
4. ทดสอบ local ทุก role → commit → branch + PR → Vercel deploy

## ✅ สิ่งที่ทำไว้แล้ว (frontend, ยังไม่ commit — อยู่ใน working tree)

- `App.jsx`: แยก staff load (Phase 1) + progressive queue load (Phase 2a 30วัน / Phase 2b ทั้งหมด background merge) + `isDataReady` overlay
- `supabaseService.js` + `ActivityLogPage.jsx`: เพิ่ม date filter หน้าประวัติการลบ (default วันนี้)
- `scripts/perf_probe.mjs`: สคริปต์วัดเวลา query (read-only)

> หมายเหตุ: fix Marketing/PR (`helpers.js` — branchId null) **ยังไม่ได้ทำ** (หายตอน reset) — ทำแยกทีหลังถ้าต้องการ

> ⚠️ ถ้า reset/clean working tree จะหายทั้งหมด — ถ้าจะเก็บให้ commit ลง branch ก่อน

## วิธีทดสอบก่อน deploy (กันพังกับ 100 คน)
1. เฟส 1: รัน SQL บน Supabase ได้เลย (CONCURRENTLY ไม่ล็อก) — วัด EXPLAIN ANALYZE ก่อน/หลัง
2. เฟส 2-3: ทดสอบบน local ก่อน → login ครบทุก role → เช็ค booking/timeline/queue-table/summary/commission/export/backup ครบ
3. Deploy ผ่าน branch + PR (main ป้องกัน push ตรง) — Vercel auto-deploy
4. Deploy นอกเวลาทำการ + เตรียม revert

## แผนถอย (Rollback)
- เฟส 1: `DROP INDEX CONCURRENTLY ...`
- เฟส 2-3: revert PR ทีละเฟส
