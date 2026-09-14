-- บริเวณของหัตถการ: หัตถการเดียวแต่ทำได้หลายจุด และแต่ละจุดใช้เวลาไม่เท่ากัน
--
-- ═══ อาการ ═══
-- procedures.blocks มีค่าเดียวต่อหัตถการ แต่ Diode ทำได้หลายบริเวณ (รักแร้ / หนวด /
-- แขน / ขา / hollywood / หลัง) ซึ่งใช้เวลาต่างกัน แอดมินต้องกด +/- แก้เวลาเองทุกคิว
-- ผลจากข้อมูลจริง 1 มี.ค. - 8 ก.ย. 2026:
--   - คิว Diode 49,773 คิว เป็น 3 บล็อค (15 นาที) เป๊ะ 47,576 คิว = 95.6%
--   - แปลว่าแทบไม่มีใครกดแก้ ตารางเตียงจึงสั้นกว่าความจริงเกือบทุกคิวที่ไม่ใช่รักแร้
-- ระบบไม่มีที่เก็บ "บริเวณ" เลย โน้ตเป็นข้อความอิสระและว่าง 33,144 จาก ~36,000 คิว
--
-- ═══ ทำไมเป็นตารางใหม่ ไม่ใช่แตกเป็นหัตถการย่อย ═══
-- แตก Diode เป็น "Diode-รักแร้ / Diode-ขา / ..." จะกระทบของเดิมทั้งเส้น: ลิสต์หัตถการ
-- ในหน้าลงคิว, room_procedures (ล็อกเตียง-หัตถการ), promos ที่ผูก procedure_id,
-- คอมมิชชั่น, รายงาน CEO, external_queue_stats ที่แยกยอดรายหัตถการ — และคิวเก่า
-- 49,773 แถวจะอ้างหัตถการที่ความหมายเปลี่ยนไป ตารางลูกแยกไม่แตะของพวกนี้เลยสักอย่าง
--
-- ═══ ของที่ไม่ถูกแตะ ═══
-- ไม่มีคอลัมน์ใหม่ในตาราง queues และไม่แก้ create_queue_v1
-- เวลาที่รวมได้จากบริเวณจะถูกเขียนลง queues.duration_blocks ช่องเดิมที่ทุกหน้าอ่านอยู่แล้ว
-- (ตารางเตียง / เช็คคิวชน / ความจุ / คอมมิชชั่น / export / trigger freeze duration)
-- ฝั่งเซิร์ฟเวอร์รับ duration_blocks อิสระอยู่แล้ว ขอแค่ >= 1 (ดู create_queue_v1 บรรทัด
-- v_duration := coalesce(nullif(...,'')::integer, v_procedure.blocks)) จึงไม่ต้องแก้ตาม
--
-- ═══ ลงแล้วไม่มีอะไรเปลี่ยน ═══
-- migration นี้สร้างตารางเปล่า ไม่ seed ข้อมูล — หัตถการที่ไม่มีแถวที่นี่ = "ยังไม่ตั้งค่า"
-- ฝั่งแอปต้องทำงานเหมือนเดิมเป๊ะ ไม่มีปุ่มโผล่ (กติกาเดียวกับ room_procedures
-- ดู src/utils/procedureAreas.js — จุดตัดสินใจเดียวของทั้งระบบ)
-- ข้อมูลเปิดใช้จริงอยู่แยกใน supabase/seeds/procedure_areas_diode.sql รันตอนจะเปิดสวิตช์
--
-- ═══ สวิตช์ปิดฉุกเฉิน (ไม่ต้อง deploy ใหม่) ═══
--   delete from public.procedure_areas where procedure_id = '<id ของหัตถการนั้น>';
-- ทุกเครื่องกลับไปใช้ค่าเวลาปกติทันที คิวที่ลงไปแล้วไม่ขยับ เพราะเวลาถูกตรึงไว้ในคิวเอง
-- ตั้งแต่ 20260817180000_freeze_queue_duration แล้ว
--
-- Rollback:
--   drop table if exists public.procedure_areas;

begin;

create table if not exists public.procedure_areas (
  id           uuid primary key default gen_random_uuid(),
  procedure_id uuid not null references public.procedures(id) on delete cascade,
  name         text not null,
  blocks       integer not null,
  sort_order   integer not null default 0,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  constraint procedure_areas_name_not_blank check (btrim(name) <> ''),
  -- 1 บล็อค = 5 นาที. เพดาน 48 บล็อค = 4 ชม. ยาวกว่าหัตถการที่นานที่สุดในระบบ
  -- (Ultraformer 8 บล็อค) หลายเท่า กันพิมพ์ผิดแล้วคิวเดียวกินเตียงทั้งวัน
  constraint procedure_areas_blocks_sane check (blocks between 1 and 48)
);

comment on table public.procedure_areas is
  'บริเวณที่ทำได้ของแต่ละหัตถการ พร้อมเวลาที่ใช้ (blocks, 1 บล็อค = 5 นาที). หัตถการที่ไม่มีแถวที่นี่เลย = ยังไม่ตั้งค่า ฝั่งแอปต้องทำงานเหมือนเดิมทุกอย่าง ห้ามตีความว่า "ต้องเลือกบริเวณก่อนถึงจะลงคิวได้". ลบแถวทิ้ง = ปิดฟีเจอร์ของหัตถการนั้นทันทีโดยไม่ต้อง deploy.';

-- ชื่อบริเวณห้ามซ้ำในหัตถการเดียวกัน — กัน "ขา" สองอันคนละเวลาที่แอดมินแยกไม่ออก
create unique index if not exists procedure_areas_procedure_name_uniq
  on public.procedure_areas (procedure_id, btrim(name));

-- หน้าลงคิวถามด้วย procedure_id ทุกครั้งที่เลือกหัตถการ
create index if not exists procedure_areas_procedure_id_idx
  on public.procedure_areas (procedure_id);

-- ─── สิทธิ์: เป็นข้อมูลตั้งค่าหลักระดับเดียวกับ procedures / room_procedures ───
-- ตารางพวกนั้นเปิด read/write ให้ anon อยู่แล้ว ตารางนี้จึงตามแบบเดียวกัน
-- (ไม่ใช่ข้อมูลลูกค้า — ไม่เข้าเงื่อนไขการล็อกของ Goal 17/18)
-- ต้องมี select policy ตั้งแต่แรก ไม่งั้นตารางจะอ่านไม่ได้ทั้งใบ
alter table public.procedure_areas enable row level security;

drop policy if exists "Allow public read access on procedure_areas" on public.procedure_areas;
drop policy if exists "Allow public insert on procedure_areas"      on public.procedure_areas;
drop policy if exists "Allow public update on procedure_areas"      on public.procedure_areas;
drop policy if exists "Allow public delete on procedure_areas"      on public.procedure_areas;

create policy "Allow public read access on procedure_areas"
  on public.procedure_areas for select using (true);
create policy "Allow public insert on procedure_areas"
  on public.procedure_areas for insert with check (true);
create policy "Allow public update on procedure_areas"
  on public.procedure_areas for update using (true) with check (true);
create policy "Allow public delete on procedure_areas"
  on public.procedure_areas for delete using (true);

grant select, insert, update, delete on table public.procedure_areas to anon, authenticated;

commit;
