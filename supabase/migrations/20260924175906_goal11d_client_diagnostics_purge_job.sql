-- Goal 11D ขั้นที่ 1: ตัวลบข้อมูลเก่าของ client_diagnostics (ทำก่อนเปิดสวิตช์เก็บ error จากเครื่องพนักงาน)
--
-- ทำไม: คู่มือ docs/GOAL_11D_PRODUCTION_CUTOVER_RUNBOOK.md ห้ามเปิดสวิตช์จนกว่าจะมีตัวลบข้อมูลเก่า
-- ที่ทำงานเอง (ไม่พึ่งการเขียนใหม่) ตารางบนโปรดักชันสร้างจาก 20260913080000 ซึ่งไม่มีคอลัมน์ expires_at
-- และไม่มีตัวลบ — ถ้าเปิดสวิตช์ตอนนั้น แถวจะสะสมไม่จำกัด (พบตอนเช็คสุขภาพ 25 ก.ย. 2569)
--
-- ทำอะไร: ติดตั้ง pg_cron แล้วตั้งงานทุกชั่วโมง (นาทีที่ 17) ลบแถวที่เก่ากว่า 14 วัน โดยดูจาก created_at
-- ที่มี index อยู่แล้ว (idx_client_diagnostics_created_at) จึงเบา ตารางนี้ยังว่างและไม่ผูกกับข้อมูลธุรกิจใด ๆ
--
-- ชื่องาน goal11d_purge_expired_client_diagnostics ตรงกับที่คู่มือระบุไว้ในหัวข้อ rollback
--
-- ย้อนกลับ: select cron.unschedule('goal11d_purge_expired_client_diagnostics');
-- (ไม่ใช้ 20260724192800 เพราะฉบับนั้นสร้างตารางใหม่ที่มี expires_at ชนกับตารางที่มีอยู่แล้ว)

create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'goal11d_purge_expired_client_diagnostics',
  '17 * * * *',
  $$delete from public.client_diagnostics where created_at < now() - interval '14 days'$$
);
