# แผนแก้ความปลอดภัย Qlass แบบไม่กระทบผู้ใช้ (Zero-Impact)

ประเมินผลกระทบของการแก้ช่องโหว่ความปลอดภัยต่อผู้ใช้ ~100 คนที่ใช้งานอยู่ พร้อมเสนอวิธีแก้แบบ backward-compatible ที่ผู้ใช้ไม่ต้อง login ใหม่หรือตั้ง PIN ใหม่.

> สถานะ: **แผน — ยังไม่เริ่มแก้** (เก็บไว้อ้างอิง)

---

## ข้อจำกัดสำคัญ (อ่านก่อน)

แอปปัจจุบัน **ไม่มี Supabase Auth session** — ทุก operation (อ่าน/เขียน/ลบ ทุกตาราง) วิ่งผ่าน **anon key ตัวเดียว** ที่ฝังในโค้ด (`src/utils/supabaseClient.js:5`).

ผลที่ตามมา:
- **ห้ามเปิด RLS แบบ default-deny ทันที** → ถ้าทำ ทุกตารางจะถูกบล็อก ผู้ใช้ 100 คนใช้งานไม่ได้ทันที
- การแก้ที่ "ไม่กระทบผู้ใช้" = พฤติกรรมหน้าจอเหมือนเดิมเป๊ะ (ยังกด PIN เท่าเดิม, ยังเห็นข้อมูลเท่าเดิม)

---

## สรุปความเสี่ยงที่จะแก้ (เรียงตามคุ้มค่า/ความเสี่ยงต่ำ)

| # | ช่องโหว่ | วิธีแก้ zero-impact | กระทบผู้ใช้ | ความเสี่ยงพัง | ความยาก |
|---|---|---|---|---|---|
| 1 | PIN ถูกดาวน์โหลดมา client + เช็คฝั่ง client | ย้ายไป RPC `verify_pin()` (server-side) | ❌ ไม่กระทบ (กด PIN เหมือนเดิม) | ต่ำ | ปานกลาง |
| 2 | `staff.pin` + commission อ่านได้ผ่าน anon | ซ่อนคอลัมน์ด้วย VIEW + RPC | ❌ ไม่กระทบ | ปานกลาง | ปานกลาง |
| 3 | `hn_customers` (เบอร์ลูกค้า 160K) เปิดสาธารณะ | ย้าย lookup ไป Edge Function | ❌ ไม่กระทบ (ช่องค้นหาเหมือนเดิม) | ต่ำ | ปานกลาง |
| 4 | PIN เก็บ plaintext | hash ตอน verify (เฟสหลัง) | ❌ ไม่กระทบ | ปานกลาง | สูง |
| 5 | ตารางอื่นเปิด anon เขียน/ลบได้ | เฟสหลัง (ต้องมี auth จริงก่อน) | ⚠️ เสี่ยงกระทบ | สูง | สูง |

> ข้อ 5 (RLS เต็มรูปแบบบนตาราง operational) **ทำไม่ได้แบบ zero-impact** เพราะต้องมี auth จริงก่อน — แยกเป็น roadmap ระยะยาว ไม่อยู่ในเฟสนี้.

---

## แผนทำจริง (เฟสที่กระทบผู้ใช้ = ศูนย์)

### เฟส 1 — ปกป้อง PIN (ข้อ 1+2)
**เป้า:** anon key อ่าน PIN ไม่ได้อีกต่อไป แต่ผู้ใช้ยังกด PIN login ได้เหมือนเดิม

1. สร้าง SQL ใหม่ (ไฟล์ `migrations/`):
   - VIEW `staff_directory` = staff ทุกคอลัมน์ **ยกเว้น** `pin`, `commission_*` (ใช้สำหรับหน้า login picker)
   - FUNCTION `verify_pin(p_staff_id uuid, p_pin text)` `SECURITY DEFINER` → คืน record (ไม่มี pin) ถ้า PIN ตรง, คืน null ถ้าผิด
   - FUNCTION `get_staff_full(p_requestor_id uuid)` → คืนข้อมูลรวม commission **เฉพาะ** role admin/superadmin (สำหรับหน้า Staff/Commission)
   - เปิด RLS บน `staff`: anon **SELECT ไม่ได้โดยตรง** แต่เข้าผ่าน view/function ได้
2. แก้ฝั่ง client (ไม่เปลี่ยน UX):
   - `LoginScreen.jsx` / `App.jsx`: เปลี่ยนจากเทียบ `next === selected.pin` → เรียก `supabase.rpc('verify_pin', ...)`
   - `fetchStaff()` ในหน้า login → ดึงจาก `staff_directory` (ไม่มี pin)
   - หน้า Staff/Commission (admin) → ดึงผ่าน `get_staff_full`
   - `createStaff/updateStaff/deleteStaff` → ย้ายเป็น RPC `SECURITY DEFINER` (เขียน pin ได้แต่ anon อ่านไม่ได้)

**ผลกระทบผู้ใช้:** ไม่มี — ยังกด PIN 4 หลักเหมือนเดิม, หน้าจอเหมือนเดิม

### เฟส 2 — ปกป้องข้อมูลลูกค้า (ข้อ 3)
1. สร้าง Edge Function `hn-lookup` รับ phone/name → query `hn_customers` ด้วย service key ฝั่ง server
2. ปิด public SELECT policy บน `hn_customers`
3. แก้ `searchHnCustomers()` ให้เรียก Edge Function แทน query ตรง

**ผลกระทบผู้ใช้:** ไม่มี — ช่อง HN Lookup ทำงานเหมือนเดิม

### เฟส 3 (ทางเลือก/เฟสหลัง) — hash PIN
- เพิ่ม `pin_hash` คู่กับ `pin`, ให้ `verify_pin` รองรับทั้งสอง, ทยอย migrate, แล้วลบ `pin` plaintext
- ทำได้ทีหลังโดยไม่กระทบผู้ใช้

---

## วิธีทดสอบก่อน deploy (กันพังกับ 100 คน)

1. **ทดสอบบน branch + Supabase แยก** (หรือ staging) ก่อนแตะ production
2. รัน SQL migration ทีละ statement, ตรวจ view/function คืนค่าถูก
3. ทดสอบ login ครบทุก role (cashier/admin/superadmin/ceo) ว่ายัง login ได้
4. ทดสอบ Staff CRUD + Commission ยังทำงาน
5. ทดสอบ HN Lookup ยังค้นเจอ
6. **Deploy นอกเวลาทำการ** + เตรียม rollback (ไฟล์ SQL `DROP`/คืน policy เดิม)

## แผนถอย (Rollback)
- ทุก migration เขียนคู่กับ script ย้อนกลับ
- Client code merge เป็น PR แยกแต่ละเฟส — revert ได้ทีละเฟส
- เก็บ anon SELECT policy เดิมไว้ใน comment เพื่อคืนเร็ว

---

## สิ่งที่จะ "ไม่ทำ" ในเฟสนี้ (เพราะกระทบผู้ใช้)
- ❌ เปลี่ยนไปใช้ Supabase Auth (ต้อง login ใหม่ทุกคน)
- ❌ เปิด RLS default-deny บนตาราง operational (queues/procedures/rooms ฯลฯ)
- ❌ บังคับตั้ง PIN ใหม่

> หมายเหตุ: ตราบใดที่ตาราง operational ยังเปิด anon เขียนได้ ช่องโหว่ "ใครมี anon key ก็เขียน/ลบข้อมูลได้" ยังคงอยู่ — การปิดสมบูรณ์ต้องมี auth จริง (roadmap ระยะยาว แยกหารือ)

---

## ลำดับถัดไป
รออนุมัติแผน → เริ่มเฟส 1 (เขียน SQL migration + แก้ client โดยไม่เปลี่ยน UX) → ทดสอบ → เฟส 2.
