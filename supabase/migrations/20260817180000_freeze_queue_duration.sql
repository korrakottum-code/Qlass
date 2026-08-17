-- ตรึงระยะเวลาของคิวไว้กับตัวคิวเอง ไม่ให้ยืด/หดย้อนหลังเมื่อมีคนแก้ตั้งค่าหัตถการ
--
-- ═══ อาการ ═══
-- ทุกที่ที่อ่านระยะเวลาคิวใช้สูตร coalesce(q.duration_blocks, p.blocks, 1) — ตกไปหยิบ
-- ค่า "ตั้งค่าหัตถการ ณ ตอนนี้" เมื่อคิวไม่ได้เก็บค่าของตัวเอง และ 96.7% ของคิวไม่เก็บ
-- (139,877 จาก 144,701 แถว ณ 2026-08-17) เพราะฝั่งแอปเขียน null ทุกครั้งที่พนักงาน
-- ไม่ได้กด +/- แก้เวลาเอง
--
-- ผลคือแก้ "Pico = 30 นาที" ครั้งเดียว คิว Pico ที่จองไปแล้วทั้งอดีตและอนาคตยาวขึ้นตาม
-- ทันที เกิดผลข้างเคียงสามอย่าง:
--   1. คิวเก่าชนกันเองย้อนหลัง (วัดได้: สัปดาห์ มิ.ย.-ก.ค. ชนกัน 40-50% ส่วนสัปดาห์
--      ล่าสุดที่จองหลังการแก้ค่าเหลือ 2.5%)
--   2. ตัวเลขความจุและ CEO Dashboard ย้อนหลังขยับเองโดยไม่มีใครแตะข้อมูลคิว
--   3. การตรวจคิวชนกันตอนบันทึกอาจบล็อกคิวที่ควรลงได้
--
-- ═══ ทำไมแก้ที่ฐานข้อมูล ไม่ใช่ที่ฝั่งแอป ═══
-- ทางที่เขียนคิวลงตารางมีหลายทาง: หน้าบันทึกคิว, Timeline, เรียกคิวรอเข้ารับบริการ,
-- เลื่อนคิว, ลงหลายคิวพร้อมกัน, create_queue_v1 และการยิง SQL ตรง ถ้าไปแก้ทีละจุด
-- พลาดจุดเดียวบั๊กก็ยังอยู่ trigger ที่ระดับตารางครอบทุกทางในที่เดียว
--
-- ═══ ข้อจำกัดที่ต้องรู้ ═══
-- ค่าที่ถูกต้อง "ณ เวลาที่จองจริง" กู้ไม่ได้แล้ว — effective_duration_blocks มีแค่ 101 แถว
-- (คิวจากช่วงทดลอง Goal 13) และ queue_audit เก็บแต่ชื่อฟิลด์ ไม่เก็บค่า
-- การ backfill นี้จึงตรึงคิวเก่าไว้ที่ "ค่าตั้งค่าหัตถการวันนี้" ซึ่งไม่ใช่ค่าที่ถูกต้อง
-- ตามประวัติศาสตร์ แต่หยุดการเปลี่ยนย้อนหลังในอนาคตได้ และดีกว่าปล่อยให้ลอยต่อไป
--
-- คิวที่ไม่มีหัตถการ (53 แถว) ยังเป็น null ต่อ ถูกต้องแล้ว — ไม่มีหัตถการก็ไม่มีระยะเวลา
-- สูตรอ่านเดิม coalesce(..., 1) รองรับอยู่แล้ว ไม่ต้องแก้ที่ไหน
--
-- Rollback:
--   drop trigger if exists queues_freeze_duration on public.queues;
--   drop function if exists public.queues_fill_duration_blocks();
--   (ไม่ย้อน backfill — ค่าที่เติมไปคือค่าที่ระบบใช้อยู่แล้วก่อนหน้านี้ทุกครั้งที่อ่าน)

begin;

-- ─── 1. เติมค่าให้คิวเก่า ───
-- ค่าที่เติมคือค่าเดียวกับที่ระบบคำนวณให้อยู่แล้วทุกครั้งที่อ่าน ณ วันนี้ จึงไม่มีคิวไหน
-- เปลี่ยนความยาวจากการ backfill นี้ — มันแค่หยุดค่าไม่ให้เปลี่ยนอีกในอนาคต
update public.queues q
set duration_blocks = p.blocks
from public.procedures p
where q.procedure_id = p.id
  and q.duration_blocks is null
  and p.blocks is not null;

-- ─── 2. กันไม่ให้เกิดใหม่ ───
create or replace function public.queues_fill_duration_blocks()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.procedure_id is null then
    return new; -- ไม่มีหัตถการก็ไม่มีระยะเวลาให้เติม
  end if;

  -- ไม่ได้ระบุระยะเวลามา (สร้างใหม่ หรือจงใจล้างค่าเพื่อขอใช้ค่าเริ่มต้น) → เติมให้
  if new.duration_blocks is null then
    select p.blocks into new.duration_blocks
    from public.procedures p
    where p.id = new.procedure_id;
    return new;
  end if;

  -- เปลี่ยนหัตถการโดยไม่ได้ส่งระยะเวลาใหม่มาด้วย: ค่าที่ติดมาเป็นของหัตถการเก่า ใช้ต่อไม่ได้
  -- (ฝั่งแอปล้างเป็น null ให้อยู่แล้วตอนเปลี่ยนหัตถการ แต่การยิง SQL ตรงไม่ได้ทำ)
  if tg_op = 'UPDATE'
     and new.procedure_id is distinct from old.procedure_id
     and new.duration_blocks is not distinct from old.duration_blocks
  then
    select p.blocks into new.duration_blocks
    from public.procedures p
    where p.id = new.procedure_id;
  end if;

  return new;
end $$;

comment on function public.queues_fill_duration_blocks() is
  'ตรึงระยะเวลาคิวไว้กับตัวคิวตอนเขียน เพื่อไม่ให้การแก้ procedures.blocks ไปเปลี่ยนความยาวของคิวที่จองไปแล้ว';

drop trigger if exists queues_freeze_duration on public.queues;

create trigger queues_freeze_duration
  before insert or update of duration_blocks, procedure_id on public.queues
  for each row
  execute function public.queues_fill_duration_blocks();

commit;
