-- ปิดช่องที่หลุดไปตอนลง migration 20260916120000 (เก็บชื่อโปร/ห้อง ณ ตอนลงคิว)
--
-- ฟังก์ชัน trigger ใหม่ (queues_fill_name_snapshots) เป็น SECURITY DEFINER แต่ลืม
-- revoke สิทธิ์เรียกตรงจาก anon/authenticated เหมือนที่ทำกับ create_queue_v1 และ
-- queue_payload_unchanged ในไฟล์เดียวกัน — ตัวตรวจของ Supabase จับได้ทันทีที่ตรวจ
-- สุขภาพรอบถัดไป (WARN: "Public Can Execute SECURITY DEFINER Function" ผ่าน
-- /rest/v1/rpc/queues_fill_name_snapshots)
--
-- ผลกระทบจริงต่ำมาก: เป็นฟังก์ชัน trigger (returns trigger) เรียกตรงนอก trigger
-- context ไม่ได้อยู่แล้ว (Postgres ปฏิเสธด้วย error "trigger functions can only be
-- called as triggers" ก่อนจะรันโค้ดข้างในเลย) แต่ปิดให้ตรงกับฟังก์ชันพี่น้องตัวอื่น
-- ในระบบ (queues_fill_duration_blocks, queue_set_concurrency_metadata) ที่ revoke
-- ไว้ครบตั้งแต่แรก — ไม่ควรมีข้อยกเว้น
--
-- ═══ ลงโปรดักชันแล้ว 16 ก.ย. 2569 ═══
-- ตรวจหลังลง: ทดสอบสร้างคิวจริงในทรานแซกชันแล้ว rollback — trigger ยังทำงานถูกต้อง
-- ปกติ (การ revoke สิทธิ์เรียกตรงไม่กระทบการทำงานของ trigger เพราะ Postgres เรียก
-- trigger ผ่านกลไกคนละทางกับการเรียกฟังก์ชันตรง ไม่เช็คสิทธิ์ EXECUTE ของผู้เรียก)

set local lock_timeout = '3s';

revoke all on function public.queues_fill_name_snapshots() from public, anon, authenticated;
