-- ลบสาขาแล้วห้ามลบคิว/ห้องตามทอด
--
-- ตาราง branches ยังไม่ได้เปิด RLS และบัญชีสาธารณะ (anon key ที่ฝังอยู่ในหน้าเว็บ ใครก็
-- ดึงออกมาได้) มีสิทธิ์ delete บนตารางนี้ — ตรวจยิงจากภายนอกจริงเมื่อ 12 ก.ย. 2569
-- อ่านรายชื่อสาขาได้ และสั่งลบได้
--
-- ของเดิม branch_id เป็น ON DELETE CASCADE ทั้ง queues และ rooms แปลว่าคำสั่งลบสาขา
-- คำสั่งเดียวจากคนนอก ลบคิวทั้งสาขาหายตามไปด้วย (ตอนนั้นเอื้อมถึง 179,000 แถว)
--
-- เปลี่ยนเป็น RESTRICT: ลบสาขาที่ยังมีคิวหรือห้องอยู่ไม่ได้อีกต่อไป เส้นทางลบข้อมูล
-- จำนวนมากจึงหายไป โดยไม่ต้องแตะ RLS (เปิด RLS ตอนนี้ล็อกอินพัง — ยังไม่มี select policy)
-- และพฤติกรรมที่ได้ก็ถูกกว่าเดิมอยู่แล้ว: ไม่ควรมีใครลบสาขาที่มีคิวพันกว่ารายการด้วยปุ่มเดียว
--
-- หมายเหตุการนำขึ้นโปรดักชัน 12 ก.ย. 2569 (หน้าร้านเปิดอยู่): ใช้ lock_timeout 3 วินาที
-- + NOT VALID ก่อน แล้วค่อย VALIDATE แยก เพื่อไม่ให้ถือล็อกนานจนขวางคิวงานอื่น
-- ทดสอบพฤติกรรมบนตารางจำลองในสคีมาแยกก่อน แล้วลบสคีมาทดสอบทิ้ง ไม่แตะข้อมูลจริง
alter table public.queues drop constraint if exists queues_branch_id_fkey;
alter table public.queues add constraint queues_branch_id_fkey
  foreign key (branch_id) references public.branches(id) on delete restrict;

alter table public.rooms drop constraint if exists rooms_branch_id_fkey;
alter table public.rooms add constraint rooms_branch_id_fkey
  foreign key (branch_id) references public.branches(id) on delete restrict;
