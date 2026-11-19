-- จองออนไลน์: เวลาตามจำนวนคูปอง ตั้งรายโปร (ทีมตั้ง 20 พ.ย. 2569) — ขั้น 1: โครงสร้าง ยังไม่เปลี่ยนผล
--
-- โจทย์: เดิมหลายคูปอง = เวลาหัตถการ × จำนวนใบ (Hifu 3 ใบ กันเตียง 2 ชม.) แต่คูปองใบถัดไปใช้เวลาไม่เท่าใบแรก
-- และบางโปรใช้ได้ครั้งละ 1 สิทธิ์ (โปรเซ็ต / กำจัดขน / ดริปผิว / Pico)
--
-- online_booking_promos.coupon_minutes int[] = [นาทีของ 1 ใบ, 2 ใบ, 3 ใบ]
--   ความยาวรายการ = จำนวนใบสูงสุดของโปรนั้น เช่น {30,40} = ได้สูงสุด 2 ใบ, {15} = ครั้งละ 1 สิทธิ์
--   null = กติกาเดิมทุกอย่าง (1–3 ใบ, เวลา × จำนวนใบ)
--
-- ไฟล์นี้ไม่ใส่ค่าให้โปรไหนเลย → ทุกโปรเป็น null → ผลการจองเหมือนเดิมทุกตัวอักษร
-- ค่าจริงอยู่ในขั้น 2 (20261120120100) ลงหลังหน้าจองรุ่นใหม่ขึ้นแล้วเท่านั้น
--
-- เปลี่ยนเฉพาะ:
--   - online_booking_catalog_v1: ส่ง coupon_minutes ไปหน้าจองด้วย (หน้ารุ่นเก่าไม่อ่านช่องนี้ ไม่มีผล)
--   - online_booking_slots_v2 / online_booking_create_v2: เวลา = online_booking_coupon_blocks_v1(...)
--     แทน r.dur * p_count และจำนวนใบที่เกินเพดานของโปร ปัดลงเป็นเพดาน (หน้ารุ่นเก่าที่ยังส่ง 2–3 ใบมา
--     จองได้ ไม่ error — ไม่ปฏิเสธลูกค้า)
--   - v1 (หน้ารุ่นเก่ามากที่ไม่ส่งจำนวนใบ = 1 ใบเสมอ) ไม่แตะ
-- แก้แบบแทนข้อความในนิยามที่รันจริง หาไม่เจอหรือเจอมากกว่า 1 ที่ = หยุดทั้ง migration ไม่แก้ครึ่ง ๆ
-- ตาราง online_booking_promos ปิดจากคีย์หน้าเว็บอยู่แล้ว (RLS ไม่มี policy) ไม่เปลี่ยน

set local lock_timeout = '3s';

create or replace function public.online_booking_coupon_minutes_ok(p_minutes int[])
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_minutes is null
      or (cardinality(p_minutes) between 1 and 3
          and array_ndims(p_minutes) = 1
          and not exists (select 1 from unnest(p_minutes) m where m is null or m < 5 or m > 240 or m % 5 <> 0));
$$;

alter table public.online_booking_promos
  add column if not exists coupon_minutes int[];

do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'online_booking_promos_coupon_minutes_check') then
    alter table public.online_booking_promos
      add constraint online_booking_promos_coupon_minutes_check
      check (public.online_booking_coupon_minutes_ok(coupon_minutes));
  end if;
end
$c$;

-- จำนวนใบที่ใช้จริง: ไม่ได้ตั้ง = ตามที่ส่งมา; ตั้งแล้ว = ไม่เกินเพดานของโปร
create or replace function public.online_booking_coupon_count_v1(p_promo_id uuid, p_count int)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select case
           when m is null then p_count
           else least(greatest(p_count, 1), cardinality(m))
         end
    from (select (select op.coupon_minutes from public.online_booking_promos op where op.promo_id = p_promo_id) m) x;
$$;

-- เวลา (บล็อก 5 นาที): ไม่ได้ตั้ง = เวลาหัตถการ × จำนวนใบ (เดิม); ตั้งแล้ว = นาทีตามรายการ
create or replace function public.online_booking_coupon_blocks_v1(p_promo_id uuid, p_base_blocks int, p_count int)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select case
           when m is null then p_base_blocks * p_count
           else m[least(greatest(p_count, 1), cardinality(m))] / 5
         end
    from (select (select op.coupon_minutes from public.online_booking_promos op where op.promo_id = p_promo_id) m) x;
$$;

revoke all on function public.online_booking_coupon_count_v1(uuid, int) from public, anon, authenticated;
revoke all on function public.online_booking_coupon_blocks_v1(uuid, int, int) from public, anon, authenticated;
grant execute on function public.online_booking_coupon_count_v1(uuid, int) to service_role;
grant execute on function public.online_booking_coupon_blocks_v1(uuid, int, int) to service_role;

do $mig$
declare
  f record;
  v_def text;
  v_new text;
  c_cnt_old constant text := 'if p_count is null or p_count < 1 or p_count > c_max_count then raise exception ''INVALID_COUNT''; end if;';
  c_cnt_new constant text := c_cnt_old || E'\n  p_count := public.online_booking_coupon_count_v1(p_promo_id, p_count);';
  c_dur_old constant text := 'r.dur * p_count';
  c_dur_new constant text := 'public.online_booking_coupon_blocks_v1(p_promo_id, r.dur, p_count)';
  c_cat_old constant text := '''duration_minutes'', pc.blocks * 5)';
  c_cat_new constant text := '''duration_minutes'', pc.blocks * 5, ''coupon_minutes'', op.coupon_minutes)';
begin
  for f in
    select p.oid, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('online_booking_slots_v2', 'online_booking_create_v2', 'online_booking_catalog_v1')
  loop
    v_def := pg_get_functiondef(f.oid);
    if f.proname = 'online_booking_catalog_v1' then
      if position(c_cat_new in v_def) > 0 then continue; end if;
      if (length(v_def) - length(replace(v_def, c_cat_old, ''))) / length(c_cat_old) <> 1 then
        raise exception '% : catalog pattern not found exactly once', f.proname;
      end if;
      v_new := replace(v_def, c_cat_old, c_cat_new);
    else
      if position(c_dur_new in v_def) > 0 then continue; end if;
      if (length(v_def) - length(replace(v_def, c_cnt_old, ''))) / length(c_cnt_old) <> 1
         or (length(v_def) - length(replace(v_def, c_dur_old, ''))) / length(c_dur_old) <> 1 then
        raise exception '% : count/duration pattern not found exactly once', f.proname;
      end if;
      v_new := replace(replace(v_def, c_cnt_old, c_cnt_new), c_dur_old, c_dur_new);
    end if;
    execute v_new;
  end loop;
end
$mig$;
