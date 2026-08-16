-- ล็อกหัตถการกับเตียง: หัตถการลงได้เฉพาะเตียงที่รับมันจริง
--
-- โจทย์: ระบบล็อกแค่ประเภทห้อง (M = ห้องหมอ / T = เตียงเครื่อง) แปลว่าหัตถการฝั่ง T
-- ทุกตัวลงได้ทุกเตียง T — pico จึงลงเตียง diode ได้ ทั้งที่หน้างานทำไม่ได้
-- ตารางนี้ผูก "เตียง → หัตถการที่เตียงนั้นรับ" ต่อสาขา (rooms ผูก branch อยู่แล้ว)
--
-- กติกาที่ฝั่งแอปยึด (ดู src/utils/roomProcedures.js — จุดตัดสินใจเดียวของทั้งระบบ):
--   เตียงที่ไม่มีแถวในตารางนี้เลย = "ยังไม่ตั้งค่า" → ใช้กติกาเดิม M/T
--   ไม่ใช่ "ห้ามทุกอย่าง" เพราะ 29 สาขาเปิดพร้อมกันไม่ได้ ต้องทยอยตั้งทีละสาขา
-- ผลคือ migration นี้ลงแล้วพฤติกรรมไม่เปลี่ยนเลย จนกว่าจะมีคนตั้งค่าเตียงแรก
--
-- ═══ ส่วนที่ลบของเก่า ═══
-- production มี migration `20260805174030_room_groups_and_machines` ลงไว้ตั้งแต่ 5 ส.ค.
-- แต่ไฟล์ไม่เคยอยู่ใน git และไม่เคยถูกใช้งาน ตรวจก่อนลบเมื่อ 2026-08-17:
--   - public.room_machines            → 0 แถว
--   - public.rooms.group_name         → 168 ห้อง ไม่มีสักห้องที่มีค่า
--   - grep ทั่ว src/ supabase/ docs/  → ไม่มีที่ไหนอ้างถึงทั้งสองอย่าง
-- ปล่อยไว้จะกลายเป็นสองระบบซ้อนกันในฐานข้อมูลเดียว จึงลบทิ้งพร้อมกันในนี้
--
-- Rollback:
--   drop table if exists public.room_procedures;
--   alter table public.rooms add column if not exists group_name text;
--   create table if not exists public.room_machines (
--     id uuid primary key default gen_random_uuid(),
--     room_id uuid not null references public.rooms(id) on delete cascade,
--     name text not null default '', category text not null,
--     active boolean not null default true, notes text,
--     created_at timestamptz not null default now());

begin;

-- ─── ลบโครงเก่าที่ค้างไว้ (ว่างทั้งคู่ ไม่มีโค้ดอ้างถึง) ───
drop table if exists public.room_machines;
alter table public.rooms drop column if exists group_name;

-- ─── ตารางใหม่ ───
create table if not exists public.room_procedures (
  room_id      uuid not null references public.rooms(id)      on delete cascade,
  procedure_id uuid not null references public.procedures(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (room_id, procedure_id)
);

comment on table public.room_procedures is
  'เตียงไหนรับหัตถการอะไรได้. เตียงที่ไม่มีแถวที่นี่เลย = ยังไม่ตั้งค่า ให้ใช้กติกาเดิม rooms.type = procedures.room_type. ห้ามตีความว่า "ห้ามทุกอย่าง".';

-- ไล่ย้อนจากหัตถการว่ามีเตียงไหนรองรับบ้าง (ใช้ตอนเลือกหัตถการก่อนแล้วค่อยเลือกเตียง
-- และตอนเตือนว่าหัตถการนี้ไม่มีเตียงรองรับเลยในสาขา) — PK ครอบทางกลับให้แล้ว
create index if not exists room_procedures_procedure_id_idx
  on public.room_procedures (procedure_id);

-- ─── สิทธิ์: เป็นข้อมูลตั้งค่าหลักระดับเดียวกับ rooms / procedures ───
-- ตารางพวกนั้นเปิด read/write ให้ anon อยู่แล้ว ตารางนี้จึงตามแบบเดียวกัน
-- (ไม่ใช่ข้อมูลลูกค้า — ไม่เข้าเงื่อนไขการล็อกของ Goal 17/18)
alter table public.room_procedures enable row level security;

drop policy if exists "Allow public read access on room_procedures" on public.room_procedures;
drop policy if exists "Allow public insert on room_procedures"      on public.room_procedures;
drop policy if exists "Allow public update on room_procedures"      on public.room_procedures;
drop policy if exists "Allow public delete on room_procedures"      on public.room_procedures;

create policy "Allow public read access on room_procedures"
  on public.room_procedures for select using (true);
create policy "Allow public insert on room_procedures"
  on public.room_procedures for insert with check (true);
create policy "Allow public update on room_procedures"
  on public.room_procedures for update using (true) with check (true);
create policy "Allow public delete on room_procedures"
  on public.room_procedures for delete using (true);

grant select, insert, update, delete on table public.room_procedures to anon, authenticated;

commit;
