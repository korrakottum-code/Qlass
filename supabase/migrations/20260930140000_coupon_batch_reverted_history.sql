-- คูปอง: แก้/ลบล็อตได้เมื่อประวัติการตัดทั้งหมดถูกย้อนแล้ว (ไม่มีใบไหนใช้อยู่จริง)
--
-- ทำไม: 20260930120000 ปฏิเสธแก้/ลบล็อตถ้ามี "ประวัติการตัด" แม้ย้อนแล้ว (used_count = 0) ผลคือทดสอบตัดแล้วย้อน
-- ทำให้ลบล็อตทดสอบทิ้งเพื่อเริ่มเลขใหม่ไม่ได้ ต้องไปลบประวัติในฐานข้อมูลมือ
--
-- เปลี่ยนอะไร (แทนที่ 2 ฟังก์ชันเดิม ลายเซ็นเดิม ไม่แตะตาราง):
--   coupon_batch_update_v1  แก้ได้เมื่อ ไม่มีใบไหน used_count > 0 และไม่มีประวัติที่ "ยังไม่ถูกย้อน"
--   coupon_batch_delete_v1  ลบได้ตามเงื่อนไขเดียวกัน; ก่อนลบจะ "เก็บสำเนาประวัติที่ย้อนแล้ว" ลงบันทึก coupon_batch_log
--                           (detail.redemptions) แล้วจึงลบแถวประวัติกับคูปอง จึงไม่มีหลักฐานหายเงียบ ๆ
-- เงื่อนไขอื่นเหมือนเดิมทุกข้อ (ล็อตท้ายสุดของหมวด, ล็อกตัวนับก่อน, สิทธิ์ service_role เท่านั้น)
--
-- ยกเลิก (rollback): ลง 20260930120000 ซ้ำเฉพาะสองฟังก์ชัน (create or replace) ได้

set local lock_timeout = '3s';

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

  perform 1 from public.coupons where batch_id = b.id for update;
  if exists (select 1 from public.coupons where batch_id = b.id and used_count > 0)
     or exists (select 1 from public.coupon_redemptions r join public.coupons c on c.id = r.coupon_id
                 where c.batch_id = b.id and r.reverted_at is null) then
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
  v_history jsonb;
begin
  select * into b from public.coupon_batches where id = p_batch_id for update;
  if not found then raise exception 'batch_not_found'; end if;

  select * into k from public.coupon_counters where prefix = b.prefix for update;
  if not found or k.last_no <> b.last_no then raise exception 'batch_not_latest'; end if;

  perform 1 from public.coupons where batch_id = b.id for update;
  if exists (select 1 from public.coupons where batch_id = b.id and used_count > 0)
     or exists (select 1 from public.coupon_redemptions r join public.coupons c on c.id = r.coupon_id
                 where c.batch_id = b.id and r.reverted_at is null) then
    raise exception 'batch_has_used';
  end if;

  -- เหลือแต่ประวัติที่ย้อนแล้ว: เก็บสำเนาลงบันทึกก่อน แล้วค่อยลบแถวประวัติ (FK restrict ต้องลบก่อนคูปอง)
  select coalesce(jsonb_agg(jsonb_build_object(
           'code', c.code, 'branchName', r.branch_name, 'staffName', r.staff_name, 'note', r.note,
           'redeemedAt', r.redeemed_at, 'revertedAt', r.reverted_at, 'revertedBy', r.reverted_by_name)
           order by r.redeemed_at), '[]'::jsonb)
    into v_history
    from public.coupon_redemptions r join public.coupons c on c.id = r.coupon_id
   where c.batch_id = b.id;

  delete from public.coupon_redemptions r using public.coupons c
   where r.coupon_id = c.id and c.batch_id = b.id;
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
    'expiryDate', b.expiry_date, 'cancelled', b.cancelled_at is not null,
    'redemptions', v_history));

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
