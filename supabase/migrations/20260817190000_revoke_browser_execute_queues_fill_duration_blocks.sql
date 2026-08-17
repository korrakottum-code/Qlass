-- ปิดสิทธิ์ execute ของ trigger function จาก #142 (20260817180000_freeze_queue_duration)
--
-- ฟังก์ชันสร้างด้วย security definer และ Postgres default ให้ public execute ได้ ทำให้
-- Supabase advisor แจ้ง lint 0028/0029 (anon/authenticated เรียกผ่าน /rest/v1/rpc ได้)
-- ตัวมันเป็น trigger function (returns trigger) เรียกตรงจาก REST ทำอะไรไม่ได้อยู่แล้ว
-- แต่ไม่มีเหตุผลที่จะเปิดไว้ — ปิดตามแนวเดียวกับ create_queue_v1
--
-- trigger บน queues ยังทำงานปกติ: trigger รันในสิทธิ์ของตารางเจ้าของ ไม่ใช่ผู้เรียก REST
-- ทดสอบหลัง revoke แล้ว (2026-08-17): insert คิว Pico ไม่ระบุเวลา → เติม 6 บล็อคถูกต้อง
--
-- ลงบน production แล้วเมื่อ 2026-08-17 (ผ่าน MCP apply_migration)

revoke all on function public.queues_fill_duration_blocks() from public, anon, authenticated;
