-- คูปอง: แก้ข้อมูลล็อต + ลบล็อตที่ออกผิด (เลขรันถอยกลับ)
--
-- ทำไม: ออกล็อตแล้วคีย์ผิด (ชื่อโปร/ราคา/วันหมดอายุ/จำนวน) ของเดิมทำได้แค่ "ยกเลิกทั้งล็อต"
-- แล้วออกใหม่ ซึ่งเลขรันต่อจากล็อตที่ยกเลิก (ตัวนับเดินหน้าอย่างเดียว) จัดการยาก
--
-- เพิ่ม 2 ฟังก์ชัน (service_role เท่านั้น เหมือน coupon_*_v1 ตัวอื่น) และตารางบันทึกการแก้/ลบ:
--   coupon_batch_update_v1  แก้ชื่อ/หมวด/ราคา/วันหมดอายุ/หมายเหตุของทั้งล็อต รหัสไม่เปลี่ยน
--                           ทำได้เมื่อไม่มีใบไหนในล็อตถูกใช้ (used_count > 0) และไม่มีประวัติการตัดเลย
--   coupon_batch_delete_v1  ลบล็อตทิ้งถาวร แล้วถอยตัวนับกลับไปก่อนล็อตนั้น (ออกใหม่ได้เลขเดิม)
--                           ทำได้เมื่อ (ก) เป็นล็อตท้ายสุดของหมวด (last_no ตรงกับตัวนับ)
--                           (ข) ไม่มีใบไหนถูกใช้ และไม่มีประวัติการตัด (แม้ย้อนแล้วก็ไม่ลบ)
--
-- ไม่แตะตาราง/ฟังก์ชันที่ลงของจริงแล้ว (20260929120000_coupons.sql) — เพิ่มอย่างเดียว
-- ยกเลิก (rollback) ได้ด้วย:
--   drop function public.coupon_batch_update_v1(uuid, uuid, text, text, numeric, date, text);
--   drop function public.coupon_batch_delete_v1(uuid, uuid);
--   drop table public.coupon_batch_log;

set local lock_timeout = '3s';

create table if not exists public.coupon_batch_log (
  id          uuid primary key default gen_random_uuid(),
  batch_id    uuid not null,
  action      text not null check (action in ('update', 'delete')),
  actor_id    uuid references public.staff(id) on delete set null,
  actor_name  text not null default '',
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists coupon_batch_log_batch_idx on public.coupon_batch_log (batch_id, created_at desc);
alter table public.coupon_batch_log enable row level security;
revoke all on table public.coupon_batch_log from anon, authenticated;
grant all on table public.coupon_batch_log to service_role;

-- แก้ข้อมูลทั้งล็อต: ใบเดียวที่ถูกใช้แล้ว = ปฏิเสธทั้งล็อต (ไม่แก้ครึ่งๆ กลางๆ)
create or replace function public.coupon_batch_update_v1(
  p_actor_staff_id uuid, p_batch_id uuid,
  p_name text, p_category text, p_price numeric, p_expiry_date date, p_note text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.coupon_batches;
  v_name text := btrim(coalesce(p_name, ''));
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_cat text := coalesce(p_category, '');
  v_changed int;
  v_actor text;
begin
  if length(v_name) < 1 or length(v_name) > 120 then raise exception 'invalid_name'; end if;
  if p_price is null or p_price < 0 then raise exception 'invalid_price'; end if;
  if p_expiry_date is null or p_expiry_date < (now() at time zone 'Asia/Bangkok')::date then raise exception 'invalid_expiry'; end if;

  select * into b from public.coupon_batches where id = p_batch_id for update;
  if not found then raise exception 'batch_not_found'; end if;

  -- ล็อกแถวคูปองของล็อตก่อนตรวจ กันมีคนตัดใช้แทรกระหว่างแก้ (ตัดใช้ล็อกแถวเดียวกัน)
  perform 1 from public.coupons where batch_id = b.id for update;
  if exists (select 1 from public.coupons where batch_id = b.id and used_count > 0)
     or exists (select 1 from public.coupon_redemptions r join public.coupons c on c.id = r.coupon_id where c.batch_id = b.id) then
    raise exception 'batch_has_used';
  end if;

  update public.coupons
     set name = v_name, category = v_cat, price = p_price, expiry_date = p_expiry_date, note = v_note
   where batch_id = b.id;
  get diagnostics v_changed = row_count;

  update public.coupon_batches
     set name = v_name, category = v_cat, price = p_price, expiry_date = p_expiry_date, note = v_note
   where id = b.id;

  select name into v_actor from public.staff where id = p_actor_staff_id;
  insert into public.coupon_batch_log (batch_id, action, actor_id, actor_name, detail)
  values (b.id, 'update', p_actor_staff_id, coalesce(v_actor, ''), jsonb_build_object(
    'firstCode', b.prefix || '-' || lpad(b.first_no::text, 7, '0'),
    'lastCode',  b.prefix || '-' || lpad(b.last_no::text, 7, '0'),
    'quantity', b.quantity,
    'before', jsonb_build_object('name', b.name, 'category', b.category, 'price', b.price, 'expiryDate', b.expiry_date, 'note', b.note),
    'after',  jsonb_build_object('name', v_name, 'category', v_cat, 'price', p_price, 'expiryDate', p_expiry_date, 'note', v_note)));

  return jsonb_build_object('changed', v_changed);
end;
$$;

-- ลบล็อตท้ายสุดของหมวดที่ยังไม่เคยถูกใช้ แล้วถอยตัวนับกลับไปก่อนล็อตนั้น
create or replace function public.coupon_batch_delete_v1(p_actor_staff_id uuid, p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.coupon_batches;
  k public.coupon_counters;
  v_deleted int;
  v_actor text;
begin
  select * into b from public.coupon_batches where id = p_batch_id for update;
  if not found then raise exception 'batch_not_found'; end if;

  -- ล็อกตัวนับของหมวด: ออกล็อตใหม่ในหมวดเดียวกันต้องรอ จะไม่ได้เลขซ้ำกับที่กำลังคืน
  select * into k from public.coupon_counters where prefix = b.prefix for update;
  if not found or k.last_no <> b.last_no then raise exception 'batch_not_latest'; end if;

  perform 1 from public.coupons where batch_id = b.id for update;
  if exists (select 1 from public.coupons where batch_id = b.id and used_count > 0)
     or exists (select 1 from public.coupon_redemptions r join public.coupons c on c.id = r.coupon_id where c.batch_id = b.id) then
    raise exception 'batch_has_used';
  end if;

  delete from public.coupons where batch_id = b.id;
  get diagnostics v_deleted = row_count;
  delete from public.coupon_batches where id = b.id;
  update public.coupon_counters set last_no = b.first_no - 1 where prefix = b.prefix;

  select name into v_actor from public.staff where id = p_actor_staff_id;
  insert into public.coupon_batch_log (batch_id, action, actor_id, actor_name, detail)
  values (b.id, 'delete', p_actor_staff_id, coalesce(v_actor, ''), jsonb_build_object(
    'prefix', b.prefix,
    'firstCode', b.prefix || '-' || lpad(b.first_no::text, 7, '0'),
    'lastCode',  b.prefix || '-' || lpad(b.last_no::text, 7, '0'),
    'quantity', b.quantity, 'deleted', v_deleted, 'name', b.name, 'price', b.price,
    'expiryDate', b.expiry_date, 'cancelled', b.cancelled_at is not null));

  return jsonb_build_object('deleted', v_deleted, 'nextNo', b.first_no,
                            'nextCode', b.prefix || '-' || lpad(b.first_no::text, 7, '0'));
end;
$$;

revoke all on function
  public.coupon_batch_update_v1(uuid, uuid, text, text, numeric, date, text),
  public.coupon_batch_delete_v1(uuid, uuid)
  from public, anon, authenticated;
grant execute on function
  public.coupon_batch_update_v1(uuid, uuid, text, text, numeric, date, text),
  public.coupon_batch_delete_v1(uuid, uuid)
  to service_role;
