-- แบบทดสอบก่อน/หลังเทรนในเมนูคู่มือ: สวิตช์เปิดรอบ + ผลคะแนนของทุกคน
--
-- ═══ ทำไมต้องอยู่ในฐานข้อมูล ═══
-- เดิมผลแบบทดสอบเก็บใน localStorage ของแต่ละเครื่อง ผู้ดูแลระบบจึงเห็นคะแนนได้แค่เครื่องตัวเอง
-- เจ้าของต้องการ (14 ก.ย. 2569): 1) ผู้ดูแลระบบเป็นคน "เปิด" แบบทดสอบ — เปิดรอบก่อนเทรนก่อน
-- แล้วค่อยเปิดรอบหลังเทรนทีหลัง คนอื่นจะเห็นแท็บแบบทดสอบก็ต่อเมื่อมีรอบที่เปิดอยู่
-- 2) ผู้ดูแลระบบเห็นคะแนนของทุกคน ทั้งสองรอบ ในหน้าเดียว
--
-- ═══ ตารางนี้ไม่แตะอะไรเดิม ═══
-- ไม่มีคอลัมน์ใหม่ในตารางอื่น ไม่มี trigger ไม่กระทบคิว/ค่าคอม/รายงาน
-- ถ้ายังไม่ได้รัน migration นี้ ฝั่งแอปถือว่า "ยังไม่เปิดแบบทดสอบ" (แท็บไม่ขึ้นสำหรับพนักงาน
-- ผู้ดูแลระบบเห็นข้อความบอกว่ายังไม่ได้ติดตั้ง) ระบบส่วนอื่นทำงานปกติทุกอย่าง
--
-- ═══ ข้อมูลที่เก็บ ═══
-- ไม่มีข้อมูลลูกค้า มีแค่ชื่อพนักงาน บทบาท สาขา คะแนน และคำตอบรายข้อ (id คำถาม → ตัวเลือก)
-- 1 คน 1 รอบ มี 1 แถว ทำใหม่จะทับแถวเดิมและนับ attempts เพิ่ม
--
-- ═══ สิทธิ์ ═══
-- ตามแบบตารางตั้งค่าอื่น (procedure_areas / room_procedures) ที่เปิด read/write ให้ anon
-- ฝั่งแอปเป็นคนกันว่าใครแก้สวิตช์ได้ (superadmin เท่านั้น) ถ้าวันหน้าย้ายไป Edge Function
-- ค่อยถอนสิทธิ์เขียนของ anon ทีหลังโดยไม่ต้องแก้ตาราง
--
-- Rollback:
--   drop table if exists public.quiz_results;
--   drop table if exists public.quiz_settings;

begin;

create table if not exists public.quiz_settings (
  id          text primary key default 'global',
  pre_open    boolean not null default false,
  post_open   boolean not null default false,
  updated_at  timestamptz not null default now(),
  updated_by  text,
  constraint quiz_settings_single_row check (id = 'global')
);
comment on table public.quiz_settings is
  'สวิตช์เปิด/ปิดรอบแบบทดสอบก่อน/หลังเทรน (แถวเดียว id = global). ผู้ดูแลระบบเปิดจากแท็บแบบทดสอบในเมนูคู่มือ. ไม่มีแถว = ปิดทั้งสองรอบ';

insert into public.quiz_settings (id) values ('global') on conflict (id) do nothing;

create table if not exists public.quiz_results (
  id            uuid primary key default gen_random_uuid(),
  staff_id      uuid not null references public.staff(id) on delete cascade,
  staff_name    text not null,
  staff_role    text,
  branch_id     uuid references public.branches(id) on delete set null,
  round         text not null,
  score         integer not null,
  total         integer not null,
  pct           integer not null,
  answers       jsonb not null default '{}'::jsonb,
  attempts      integer not null default 1,
  submitted_at  timestamptz not null default now(),
  constraint quiz_results_round_check check (round in ('pre', 'post')),
  constraint quiz_results_score_sane check (score between 0 and total and total > 0),
  constraint quiz_results_staff_round_uniq unique (staff_id, round)
);
comment on table public.quiz_results is
  'ผลแบบทดสอบก่อน/หลังเทรนของพนักงาน 1 คน 1 รอบ 1 แถว (ทำใหม่ทับแถวเดิม attempts +1). ไม่มีข้อมูลลูกค้า';

create index if not exists quiz_results_round_idx on public.quiz_results (round, submitted_at desc);

alter table public.quiz_settings enable row level security;
alter table public.quiz_results  enable row level security;

drop policy if exists "Allow public read access on quiz_settings" on public.quiz_settings;
drop policy if exists "Allow public update on quiz_settings"      on public.quiz_settings;
drop policy if exists "Allow public insert on quiz_settings"      on public.quiz_settings;
create policy "Allow public read access on quiz_settings" on public.quiz_settings for select using (true);
create policy "Allow public insert on quiz_settings"      on public.quiz_settings for insert with check (true);
create policy "Allow public update on quiz_settings"      on public.quiz_settings for update using (true) with check (true);

drop policy if exists "Allow public read access on quiz_results" on public.quiz_results;
drop policy if exists "Allow public insert on quiz_results"      on public.quiz_results;
drop policy if exists "Allow public update on quiz_results"      on public.quiz_results;
drop policy if exists "Allow public delete on quiz_results"      on public.quiz_results;
create policy "Allow public read access on quiz_results" on public.quiz_results for select using (true);
create policy "Allow public insert on quiz_results"      on public.quiz_results for insert with check (true);
create policy "Allow public update on quiz_results"      on public.quiz_results for update using (true) with check (true);
create policy "Allow public delete on quiz_results"      on public.quiz_results for delete using (true);

commit;
