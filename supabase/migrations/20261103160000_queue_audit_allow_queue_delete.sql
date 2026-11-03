-- ลบคิวไม่ได้ ถ้าคิวนั้นมีประวัติใน queue_audit (3 พ.ย. 2569)
--
-- queue_audit.queue_id ตั้งไว้ on delete restrict ตั้งแต่ goal12 แต่แอปลบคิวด้วยการลบแถวจริง
-- คิวที่สร้างผ่านเซิร์ฟเวอร์ (create_queue_v1 2,558 คิว, Booking API, จองออนไลน์) จึงกด "ลบ" แล้ว
-- ล้มด้วย queue_audit_queue_id_fkey ส่วนคิวทั่วไปไม่มีแถวใน queue_audit เลยลบได้ปกติ
--
-- แก้เป็น on delete set null: ลบคิวได้ แถวประวัติยังอยู่ (ใครสร้าง/เมื่อไหร่/ผ่านช่องทางไหน)
-- ส่วนว่าใครลบคิวอะไร มีบันทึกใน activity_logs (delete_queue) อยู่แล้ว
-- ไม่มีโค้ดหรือฟังก์ชันไหนอ่าน queue_audit — เปลี่ยนแค่กติกาของ foreign key
--
-- ย้อนกลับ: ลบแถวที่ queue_id เป็น null ก่อน แล้วตั้ง not null + restrict กลับ

set local lock_timeout = '3s';

alter table public.queue_audit alter column queue_id drop not null;
alter table public.queue_audit drop constraint queue_audit_queue_id_fkey;
alter table public.queue_audit
  add constraint queue_audit_queue_id_fkey
  foreign key (queue_id) references public.queues(id) on delete set null;
