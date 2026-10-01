-- คูปอง: ประวัติการทำรายการ (ใครทำอะไรเมื่อไร) ที่ดูย้อนหลังได้
--
-- ของเดิมเก็บแค่ "แก้/ลบล็อต" (coupon_batch_log) กับการตัดใช้/ย้อน (coupon_redemptions)
-- ส่วนออกล็อต/ยกเลิก/กู้คืน/จัดการหมวด ไม่เหลือร่องรอยว่าใครกด จึงเพิ่มตารางบันทึกรวม + ฟังก์ชันอ่านที่รวมทุกแหล่ง
--
-- ไม่แตะตาราง/ฟังก์ชันที่ใช้งานอยู่เลย (ออกล็อต/ยกเลิก/ตัดใช้ ทำงานเหมือนเดิม) — เพิ่มอย่างเดียว:
--   coupon_audit_log          ตารางบันทึก (RLS เปิด ไม่มี policy ปิดจากคีย์หน้าเว็บ)
--   coupon_audit_write_v1     เขียนบันทึก 1 รายการ (edge function เรียกหลังทำรายการสำเร็จ แบบ best-effort ไม่ทำให้รายการหลักพัง)
--   coupon_audit_v1           อ่านแบบแบ่งหน้า รวม 4 แหล่ง: บันทึกนี้ + coupon_batch_log (แก้/ลบล็อต) + ประวัติตัดใช้ + ประวัติย้อน
--   ดัชนีบางส่วนบนประวัติที่ถูกย้อน (ตารางเล็ก สร้างทันที)
--
-- ยกเลิก (rollback):
--   drop function public.coupon_audit_v1(int, int, text);
--   drop function public.coupon_audit_write_v1(uuid, text, text, jsonb);
--   drop table public.coupon_audit_log;
--   drop index if exists public.coupon_redemptions_reverted_idx;

set local lock_timeout = '3s';

create table if not exists public.coupon_audit_log (
  id          uuid primary key default gen_random_uuid(),
  action      text not null check (action in (
                'generate', 'coupon_cancel', 'coupon_restore', 'batch_cancel', 'batch_restore',
                'category_create', 'category_update')),
  actor_id    uuid references public.staff(id) on delete set null,
  actor_name  text not null default '',
  target      text not null default '',
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists coupon_audit_log_time_idx on public.coupon_audit_log (created_at desc);
alter table public.coupon_audit_log enable row level security;
revoke all on table public.coupon_audit_log from anon, authenticated;
grant all on table public.coupon_audit_log to service_role;

create index if not exists coupon_redemptions_reverted_idx
  on public.coupon_redemptions (reverted_at desc) where reverted_at is not null;

-- เขียนบันทึก: ถ้า detail มี batchId จะเติมช่วงรหัส/ชื่อ/จำนวนของล็อตให้ (จำไว้แม้ล็อตถูกลบทีหลัง)
create or replace function public.coupon_audit_write_v1(
  p_actor_staff_id uuid, p_action text, p_target text, p_detail jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_detail jsonb := coalesce(p_detail, '{}'::jsonb);
  b public.coupon_batches;
begin
  select name into v_actor from public.staff where id = p_actor_staff_id;
  if v_detail ? 'batchId' and (v_detail->>'batchId') ~ '^[0-9a-f-]{36}$' then
    select * into b from public.coupon_batches where id = (v_detail->>'batchId')::uuid;
    if found then
      v_detail := v_detail || jsonb_build_object(
        'firstCode', b.prefix || '-' || lpad(b.first_no::text, 7, '0'),
        'lastCode',  b.prefix || '-' || lpad(b.last_no::text, 7, '0'),
        'name', b.name, 'quantity', b.quantity);
    end if;
  end if;
  insert into public.coupon_audit_log (action, actor_id, actor_name, target, detail)
  values (p_action, p_actor_staff_id, coalesce(v_actor, ''), left(coalesce(p_target, ''), 200), v_detail);
end;
$$;

-- อ่านรวมทุกแหล่งเรียงใหม่→เก่า: ดึงแหล่งละ (offset+limit+1) แถวแล้วค่อยรวม แบ่งหน้าได้ถูกต้องโดยไม่ไล่ทั้งตาราง
-- p_action = null → ทุกประเภท; ค่าที่รู้จัก: generate, coupon_cancel, coupon_restore, batch_cancel, batch_restore,
--   category_create, category_update, batch_update, batch_delete, redeem, revert
create or replace function public.coupon_audit_v1(p_limit int default 50, p_offset int default 0, p_action text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_take int;
  v_rows jsonb;
begin
  v_take := v_offset + v_limit + 1;
  select coalesce(jsonb_agg(to_jsonb(x) order by x."at" desc), '[]'::jsonb) into v_rows from (
    select u.* from (
      (select a.created_at as "at", a.action as "action", a.actor_name as "actor", a.target as "target", a.detail as "detail"
         from public.coupon_audit_log a
        where p_action is null or a.action = p_action
        order by a.created_at desc limit v_take)
      union all
      (select l.created_at, 'batch_' || l.action, l.actor_name,
              coalesce(l.detail->>'firstCode', '') || ' – ' || coalesce(l.detail->>'lastCode', ''), l.detail
         from public.coupon_batch_log l
        where p_action is null or 'batch_' || l.action = p_action
        order by l.created_at desc limit v_take)
      union all
      (select r.redeemed_at, 'redeem', r.staff_name, c.code,
              jsonb_build_object('branchName', r.branch_name, 'note', r.note, 'name', c.name)
         from public.coupon_redemptions r join public.coupons c on c.id = r.coupon_id
        where p_action is null or p_action = 'redeem'
        order by r.redeemed_at desc limit v_take)
      union all
      (select r.reverted_at, 'revert', coalesce(r.reverted_by_name, ''), c.code,
              jsonb_build_object('branchName', r.branch_name, 'redeemedAt', r.redeemed_at, 'name', c.name)
         from public.coupon_redemptions r join public.coupons c on c.id = r.coupon_id
        where r.reverted_at is not null and (p_action is null or p_action = 'revert')
        order by r.reverted_at desc limit v_take)
    ) u
    order by u."at" desc
    limit v_limit + 1 offset v_offset
  ) x;
  return jsonb_build_object(
    'events', (select coalesce(jsonb_agg(e order by (e->>'at') desc), '[]'::jsonb)
                 from (select e from jsonb_array_elements(v_rows) with ordinality t(e, n) where n <= v_limit order by n) s),
    'hasMore', jsonb_array_length(v_rows) > v_limit);
end;
$$;

revoke all on function
  public.coupon_audit_write_v1(uuid, text, text, jsonb),
  public.coupon_audit_v1(int, int, text)
  from public, anon, authenticated;
grant execute on function
  public.coupon_audit_write_v1(uuid, text, text, jsonb),
  public.coupon_audit_v1(int, int, text)
  to service_role;
