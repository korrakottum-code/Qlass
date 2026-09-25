-- ประวัติการลบ (activity_logs): คีย์หน้าเว็บ "เพิ่มและอ่านได้อย่างเดียว" แก้/ลบ/ล้างทั้งตารางไม่ได้
--
-- ปัญหา (พบตอนเช็คสุขภาพ 25 ก.ย. 2569): ตารางนี้เก็บว่าใครลบอะไรไปเมื่อไหร่ แต่คีย์สาธารณะที่ฝังในหน้าเว็บ
-- (ใครเปิดเว็บก็ดึงไปได้) มีสิทธิ์ UPDATE / DELETE / TRUNCATE เต็ม พิสูจน์ด้วยการยิงตรงเข้า PostgREST ก่อนแก้:
-- PATCH และ DELETE ด้วยรหัสแถวปลอมตอบ 204 (ยอมให้ทำ) แปลว่าคนลบคิวแล้วลบร่องรอยตัวเองทิ้งได้
--
-- ตรวจแล้วว่าแอปใช้ตารางนี้แค่ 2 อย่าง: INSERT ตอนลบคิว/โปร/ห้อง (createActivityLog ทำแบบ best-effort ไม่ต้องอ่านกลับ)
-- กับ SELECT ในหน้าประวัติการลบ — ไม่มีโค้ดไหน (แอป สคริปต์ workflow) แก้หรือลบประวัติเลย ตารางไม่มี trigger
-- และไม่อยู่ใน realtime publication ถอนสิทธิ์จึงไม่กระทบการทำงานใด ๆ
--
-- ทำอะไร: สร้าง policy อ่านก่อน (กันช่วงที่อ่านไม่ได้) แล้วลบ policy ที่เปิดกว้าง 3 ตัว (allow all / update / delete)
-- แล้วถอนสิทธิ์ UPDATE DELETE TRUNCATE REFERENCES TRIGGER จาก anon และ authenticated เก็บ INSERT policy เดิมไว้
-- service_role ไม่ถูกแตะ (ข้าม RLS อยู่แล้ว)
--
-- สิ่งที่ยังไม่ได้ปิด (ตั้งใจ ต่อเป็นขั้นถัดไป): ใครก็เพิ่มแถวปลอมได้ และอ่านประวัติได้ (มีชื่อ/เบอร์ของคิวที่ลบ)
-- และการลบคิวตรงผ่านคีย์สาธารณะไม่ทิ้งประวัติเลย — ต้องปิดที่ตาราง queues (ย้ายทางเขียนไป edge function ก่อน)
--
-- ย้อนกลับ: ดูไฟล์ rollback ใน docs/GOAL_ANON_WRITE_LOCKDOWN.md หัวข้อ activity_logs

create policy "activity_logs_read" on public.activity_logs
  for select to anon, authenticated using (true);

drop policy if exists "allow all" on public.activity_logs;
drop policy if exists "Allow public update on activity_logs" on public.activity_logs;
drop policy if exists "Allow public delete on activity_logs" on public.activity_logs;

revoke update, delete, truncate, references, trigger on public.activity_logs from anon, authenticated;
