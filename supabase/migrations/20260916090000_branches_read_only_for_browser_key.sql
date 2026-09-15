-- ปิดสิทธิ์เขียนตาราง branches ของคีย์ที่อยู่ในหน้าเว็บ (ขั้นที่ 2 ต่อจาก #198)
--
-- ═══ ปัญหา ═══
-- คีย์ที่หน้าเว็บใช้ ฝังอยู่ในไฟล์ที่ใครเปิดหน้าเว็บก็โหลดไปอ่านได้ และตราบใดที่คีย์นั้น
-- ยังมีสิทธิ์ INSERT/UPDATE/DELETE/TRUNCATE ตารางนี้ คนนอกก็สร้าง แก้ หรือลบสาขาได้
--
-- พิสูจน์กับของจริงก่อนแก้ (16 ก.ย. 2569) ยิงตรงเข้า PostgREST ด้วยคีย์นั้น:
--   PATCH  /rest/v1/branches -> 204 (รับคำสั่ง)
--   DELETE /rest/v1/branches -> 204 (รับคำสั่ง)
-- ใช้ id ที่ไม่มีอยู่จริงทั้งสองครั้ง จึงไม่มีแถวไหนถูกแตะ แต่ยืนยันว่าสิทธิ์เปิดอยู่จริง
--
-- policy 3 ตัวที่มีอยู่ (insert/update/delete แบบ public) ไม่มีผลอะไรเลยเพราะ RLS ปิดอยู่
-- เก็บไว้มีแต่ทำให้คนอ่านเข้าใจผิดว่ามีการป้องกันอยู่
--
-- ═══ ทำไมเพิ่งทำได้ตอนนี้ ═══
-- หน้า "จัดการสาขา" เคยเขียนตารางนี้ตรงจากเบราว์เซอร์ ปิดสิทธิ์ก่อนย้าย = ผู้ดูแลระบบ
-- จัดการสาขาไม่ได้ทันที #198 ย้ายทางเขียนไปฝั่งเซิร์ฟเวอร์เรียบร้อยแล้ว และเจ้าของงาน
-- ทดสอบแก้ชื่อสาขาผ่านของจริงแล้วว่าใช้ได้
--
-- ═══ ลำดับในทรานแซกชันนี้ ═══
-- สร้าง policy อ่านก่อน แล้วค่อยเปิด RLS — ถ้าเปิด RLS ก่อน จะมีจังหวะที่ไม่มี policy
-- ซึ่งแปลว่าอ่านไม่ได้เลย และ "อ่านสาขาไม่ได้" = ทั้งแอปใช้งานไม่ได้
--
-- service_role (ที่ Edge Function ใช้) ข้าม RLS อยู่แล้ว และไม่ได้ถูกถอนสิทธิ์ใด ๆ
-- ทางเขียนของผู้ดูแลระบบจึงยังทำงานเหมือนเดิม
--
-- ย้อนกลับได้ทันทีด้วย scratchpad/rollback_branches_20260916.sql — ไม่มีการลบหรือแก้
-- ข้อมูลสักแถวในไฟล์นี้ แตะแต่สิทธิ์อย่างเดียว
--
-- ═══ ลงโปรดักชันแล้ว 16 ก.ย. 2569 ═══
-- ตรวจหลังลง: อ่านสาขาได้ครบ 29 · แก้/สร้าง/ลบจากคีย์หน้าเว็บ -> 42501 permission denied
-- ตารางหลักที่แอปโหลดตอนเปิดครบ 7 ตาราง ยังอ่านได้ 200 ทั้งหมด · ล็อกอินปกติ
-- รายการเตือนระดับ ERROR ของ Supabase หมดแล้ว (เหลือแต่ INFO กับ WARN)

set local lock_timeout = '3s';

drop policy if exists "Allow public insert on branches" on public.branches;
drop policy if exists "Allow public update on branches" on public.branches;
drop policy if exists "Allow public delete on branches" on public.branches;

create policy "branches readable by app"
  on public.branches
  for select
  to anon, authenticated
  using (true);

alter table public.branches enable row level security;

revoke insert, update, delete, truncate, references, trigger
  on table public.branches from anon, authenticated;

comment on table public.branches is
  'Branch list. Read-only for the browser key: writes go through staff-session (branch_create / branch_update / branch_delete, superadmin only). See migration 20260916 and PR #198.';
