-- เตียง TikTok: ติ๊กรายเตียง "เตียงนี้รับเฉพาะ TikTok" (เจ้าของตัดสิน 19 พ.ย. 2569)
--
-- โจทย์: คิวหมอ TikTok (ฉีด + Ultraformer ฯลฯ ที่ลงเตียง M) ต้องลงแค่เตียงที่กันไว้ ไม่ปนเตียงธรรมดา
-- เพื่อไม่แย่งที่ลูกค้าช่องทางอื่น — แต่ไม่ล็อกชื่อ M02 ในโค้ด หน้าร้านเปิด/ย้ายเตียงเองได้จากหน้าตั้งค่าเตียง
-- (คนที่ตั้งเครื่องให้เตียงได้อยู่แล้ว = superadmin / head_admin / ผู้จัดการสาขา)
--
-- กติกา (ใช้กับคิวที่ลงใหม่/ย้ายเตียงใหม่เท่านั้น — คิวเดิมทั้งหมดไม่แตะ):
--   1. เตียงที่ติ๊ก rooms.tiktok_only รับเฉพาะคิวโปร TikTok (คิวธรรมดาลงไม่ได้)
--   2. คิวโปร TikTok ลงเตียงที่ไม่ได้ติ๊กไม่ได้ ถ้าสาขานั้นมีเตียงติ๊กประเภทเดียวกัน (M/T/N)
--      ที่ทำหัตถการนั้นได้ (ตามล็อกเครื่อง/ติ๊กรายเตียง เหมือนหน้าจองออนไลน์)
--   ยกเว้น "ปิดคิว" (คิวกันช่องเวลา ไม่ใช่ลูกค้า) ลงเตียงไหนก็ได้
--   3. สาขาที่ยังไม่ติ๊กเตียงไหน = ลงปนได้แบบเดิม (เจ้าของเลือก) — ค่าเริ่มต้นไม่ติ๊กสักเตียง
--      ไฟล์นี้จึงยังไม่เปลี่ยนผลการลงคิวเลย จนกว่าจะมีคนติ๊กเตียง
--   ฝั่ง Treatment (T) ตอนนี้ไม่ติ๊ก = ลงปนได้; อยากกันวันไหนก็ติ๊กเตียง T ได้ทันทีโดยไม่ต้องแก้โค้ด
--   ลูกค้าจองเองเห็นแค่ "เวลาเต็ม" (ไม่บอกว่าเป็นเตียง TikTok / ไม่บอกโควต้า)
--
-- ครอบทุกทางลงคิว:
--   - trigger บนตาราง queues = ด่านสุดท้าย (หน้าแอดมินที่ insert/update ตรง, create_queue_v1, บอท booking-api)
--   - หน้าจองออนไลน์ (online_booking_slots_v1/v2, online_booking_create_v1/v2) กรองเตียงตามกติกาก่อน
--     จึงไม่โชว์เวลาที่ลงไม่ได้ และเลือกเตียงที่ถูกให้เอง
--
-- คิวเดิมไม่แตะ:
--   - แก้ไขคิวโดยไม่เปลี่ยนเตียง/โปร/หัตถการ (เช่น เปลี่ยนสถานะ เวลา ชื่อ) = ไม่ตรวจ
--   - คิวที่ผิดกติกาอยู่แล้วก่อนติ๊ก แก้โปร/หัตถการได้ถ้าไม่ย้ายเตียง
--   - แถว "เลื่อนมา" (rescheduled_in) ที่สร้างตอนเลื่อนนัด = ไม่ตรวจ (เลื่อนนัดใช้เตียงเดิม เลือกเตียงไม่ได้)
--
-- ปิดฉุกเฉิน (ไม่ต้อง deploy): update public.tiktok_bed_rule_settings set enabled = false;
--   ทั้ง trigger และหน้าจองออนไลน์อ่านสวิตช์เดียวกันนี้

set local lock_timeout = '3s';

alter table public.rooms
  add column if not exists tiktok_only boolean not null default false;

create table if not exists public.tiktok_bed_rule_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.tiktok_bed_rule_settings (id, enabled) values (true, true) on conflict (id) do nothing;
alter table public.tiktok_bed_rule_settings enable row level security;
revoke all on public.tiktok_bed_rule_settings from anon, authenticated;

-- 'ok' | 'tiktok_needs_tiktok_bed' | 'tiktok_bed_only'
create or replace function public.tiktok_bed_rule_v1(
  p_room_id uuid, p_promo_id uuid, p_procedure_id uuid, p_promo_name text default null)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_room_id is null then 'ok'
    when not coalesce((select s.enabled from public.tiktok_bed_rule_settings s where s.id), false) then 'ok'
    -- "ปิดคิว" = คิวกันช่องเวลา ไม่ใช่ลูกค้า — ปิดช่องบนเตียง TikTok ได้เสมอ
    when exists (select 1 from public.procedures p where p.id = p_procedure_id and p.name = 'ปิดคิว') then 'ok'
    else coalesce((
      select case
               when r.tiktok_only and not t.is_tt then 'tiktok_bed_only'
               when t.is_tt and not r.tiktok_only and exists (
                 select 1
                   from public.booking_api_candidate_rooms_v1(r.branch_id, p_procedure_id) c
                   join public.rooms r2 on r2.id = c.room_id
                  where r2.tiktok_only and r2.type = r.type) then 'tiktok_needs_tiktok_bed'
               else 'ok'
             end
        from public.rooms r,
             (select btrim(coalesce((select pr.name from public.promos pr where pr.id = p_promo_id), p_promo_name, ''))
                       ilike 'tiktok%' as is_tt) t
       where r.id = p_room_id), 'ok')
  end;
$$;
revoke all on function public.tiktok_bed_rule_v1(uuid, uuid, uuid, text) from public, anon, authenticated;

create or replace function public.queues_tiktok_bed_rule()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v text;
begin
  if new.room_id is null or new.archived_at is not null then return new; end if;
  if tg_op = 'INSERT' then
    if coalesce(new.status, '') in ('cancelled', 'no_show', 'rescheduled', 'rescheduled_in') then return new; end if;
  else
    if new.room_id is not distinct from old.room_id
       and new.promo_id is not distinct from old.promo_id
       and new.procedure_id is not distinct from old.procedure_id then
      return new;
    end if;
    -- คิวเดิมที่ลงไว้ก่อนมีกติกา (ผิดกติกาอยู่แล้ว) แก้โปร/หัตถการได้ ถ้าไม่ย้ายเตียง
    if new.room_id is not distinct from old.room_id
       and public.tiktok_bed_rule_v1(old.room_id, old.promo_id, old.procedure_id, old.promo_name_snapshot) <> 'ok' then
      return new;
    end if;
    if coalesce(new.status, '') in ('cancelled', 'no_show', 'rescheduled') then return new; end if;
  end if;

  v := public.tiktok_bed_rule_v1(new.room_id, new.promo_id, new.procedure_id, new.promo_name_snapshot);
  if v <> 'ok' then
    raise exception using errcode = 'P0001', message = 'TIKTOK_BED_RULE:' || v;
  end if;
  return new;
end;
$$;

revoke all on function public.queues_tiktok_bed_rule() from public, anon, authenticated;

drop trigger if exists queues_tiktok_bed_rule on public.queues;
create trigger queues_tiktok_bed_rule
  before insert or update on public.queues
  for each row execute function public.queues_tiktok_bed_rule();

-- หน้าจองออนไลน์: แก้เฉพาะบรรทัดเลือกเตียง ส่วนอื่นของฟังก์ชันเหมือนเดิมทุกตัวอักษร
-- (ดึงนิยามที่รันอยู่จริงมาแทนข้อความ ถ้าหาข้อความเดิมไม่เจอ = หยุดทั้ง migration ไม่แก้ครึ่ง ๆ)
do $mig$
declare
  f record;
  v_def text;
  v_new text;
  c_slot_old constant text := 'exists (select 1 from public.booking_api_free_rooms_v1(p_branch_id, v_proc, p_date, s.blk, v_dur))';
  c_slot_new constant text := 'exists (select 1 from public.booking_api_free_rooms_v1(p_branch_id, v_proc, p_date, s.blk, v_dur) fr where public.tiktok_bed_rule_v1(fr.room_id, p_promo_id, v_proc) = ''ok'')';
  c_cand_old constant text := 'for v_cand in select c.room_id from public.booking_api_candidate_rooms_v1(p_branch_id, v_proc) c';
  c_cand_new constant text := 'for v_cand in select c.room_id from public.booking_api_candidate_rooms_v1(p_branch_id, v_proc) c where public.tiktok_bed_rule_v1(c.room_id, v_promo, v_proc) = ''ok''';
begin
  for f in
    select p.oid, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('online_booking_slots_v1', 'online_booking_slots_v2', 'online_booking_create_v1', 'online_booking_create_v2')
  loop
    v_def := pg_get_functiondef(f.oid);
    if f.proname like 'online_booking_slots_%' then
      if position(c_slot_new in v_def) > 0 then continue; end if;
      if position(c_slot_old in v_def) = 0 then raise exception '% : slot pattern not found', f.proname; end if;
      v_new := replace(v_def, c_slot_old, c_slot_new);
    else
      if position(c_cand_new in v_def) > 0 then continue; end if;
      if position(c_cand_old in v_def) = 0 then raise exception '% : candidate pattern not found', f.proname; end if;
      v_new := replace(v_def, c_cand_old, c_cand_new);
    end if;
    execute v_new;
  end loop;
end
$mig$;
