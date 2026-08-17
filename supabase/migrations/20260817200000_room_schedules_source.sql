-- ปุ่มปิด/เปิดเตียงรายวันบนหัวคอลัมน์ Timeline — ต้องแยก "แถวที่ปุ่มสร้าง" ออกจากแถวที่คน
-- กรอกเองในหน้าตารางห้อง/เครื่อง เพราะปุ่ม "เปิดคืน" ต้องลบเฉพาะของตัวเอง (เจ้าของเคาะ)
--
--   source = null          → แถวเดิมทั้งหมด / แถวที่กรอกเองผ่าน ScheduleModal (ปุ่มห้ามลบ)
--   source = 'bed_switch'  → แถวที่ปุ่มปิดเตียงสร้าง (ปุ่มเปิดคืนลบเฉพาะแบบนี้)
--
-- ═══ ปลอดภัยขณะคนใช้อยู่ ═══
-- ADD COLUMN แบบ nullable ไม่มี default = แก้ catalog อย่างเดียว ไม่ rewrite ตาราง (PG 11+)
-- ล็อกตารางระดับ AccessExclusive แค่มิลลิวินาที (ตาราง ~2.7 MB, transaction ของ PostgREST สั้น)
-- แถวเดิม 17k+ ไม่ถูกแตะ — ผู้อ่านเดิมที่ select * ได้ key เพิ่มมาหนึ่งตัวที่ไม่มีใครใช้
-- CHECK constraint บนคอลัมน์ที่ยัง null ทั้งหมด validate ทันที
--
-- unique index บางส่วน: กันสองผู้จัดการกดปิดเตียงเดียวกันพร้อมกันที่ระดับ DB (ได้ 23505 แทนสองแถว)
-- สร้างบนชุดแถวที่ยังไม่มีเลย จึงเสร็จทันที ไม่บล็อกอะไร
--
-- ฝั่งแอป (createRoomSchedule) ส่ง source เฉพาะเมื่อมีค่า — ถ้า migration นี้ยังไม่ลง
-- การบันทึกตารางเดิมยังทำงานเหมือนเดิมทุกประการ มีแค่ปุ่มปิดเตียงใหม่ที่จะล้ม
--
-- Rollback:
--   drop index if exists public.room_schedules_bed_switch_one_per_day;
--   alter table public.room_schedules drop column if exists source;

alter table public.room_schedules
  add column if not exists source text
  check (source is null or source in ('bed_switch'));

comment on column public.room_schedules.source is
  'null = แถวที่กรอกเอง/แถวเดิม; bed_switch = สร้างจากปุ่มปิดเตียงบนหัว Timeline (ปุ่มเปิดคืนลบเฉพาะค่านี้)';

create unique index if not exists room_schedules_bed_switch_one_per_day
  on public.room_schedules (room_id, date)
  where source = 'bed_switch';
