-- เปิด Realtime ให้ room_procedures (ล็อกเตียง↔หัตถการ) และ room_schedules (ปิด/เปิดเตียงรายวัน)
--
-- ทำไม: แอปมี Realtime แค่ queues ตัวเดียว ตั้งค่าล็อกหรือปิดเตียงบนเครื่อง A เครื่อง B ที่เปิด
-- ค้างจะไม่เห็นจนกว่าจะรีเฟรช → B ยังลง Pico ในเตียง Diode หรือลงคิวในเตียงที่ปิดไปแล้วได้
-- ที่หน้าจอ → เซิร์ฟเวอร์ปฏิเสธ → error งง ๆ ตรวจแล้ว publication supabase_realtime มีแค่
-- queues, line_bookings, ai_memory — ต้องเพิ่มที่นี่ ไม่งั้น subscription ฝั่งแอปจะเงียบสนิท
--
-- ═══ ปลอดภัยขณะคนใช้อยู่ ═══
-- ALTER PUBLICATION ADD TABLE = แก้ metadata อย่างเดียว ล็อกแค่ ShareUpdateExclusive บนตาราง
-- ที่เพิ่ม — ไม่บล็อก select/insert/update/delete ใด ๆ
-- ไม่ต้องเปลี่ยน REPLICA IDENTITY (default = PK): DELETE payload มี {room_id, procedure_id}
-- (composite PK ของ room_procedures) และ {id} (ของ room_schedules) ครบอยู่แล้ว
-- RLS: ทั้งสองตารางมี policy select using (true) → Realtime ส่ง event ผ่านได้
--
-- เขียนแบบ idempotent — รันซ้ำไม่ error
--
-- Rollback:
--   alter publication supabase_realtime drop table public.room_procedures, public.room_schedules;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'room_procedures'
  ) then
    alter publication supabase_realtime add table public.room_procedures;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'room_schedules'
  ) then
    alter publication supabase_realtime add table public.room_schedules;
  end if;
end $$;
