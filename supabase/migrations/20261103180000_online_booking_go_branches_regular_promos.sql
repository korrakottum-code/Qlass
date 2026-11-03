-- จองออนไลน์: สาขา Class Go จองโปรปกติได้ (3 พ.ย. 2569)
--
-- เดิม (20261103120000) ลอกกติกาจาก Booking API มาว่า "โปร Class Go เฉพาะสาขา Class Go และกลับกัน"
-- แต่หน้าร้านสาขา Go ลงโปรปกติเป็นหลัก (60 วันล่าสุด: Laser 3,033 / Injection 2,535 / IV Drip 935
-- เทียบกับหมวด Class Go 725 คิว) และเจ้าของไม่ได้ตั้งโปร Go แยกสำหรับจองออนไลน์ —
-- ลูกค้าเลือกสาขา Go แล้วเจอ "ยังไม่มีบริการ" ทั้งที่เตียงรับบริการเหล่านั้นได้
--
-- กติกาใหม่: โปรปกติ = ทุกสาขา; โปรหมวด Class Go = เฉพาะสาขา Class Go (ราคา/หัตถการ Go ไม่ใช้กับสาขาปกติ)
-- เตียงยังกรองด้วย booking_api_candidate_rooms_v1 เหมือนเดิม (บริการที่สาขาไม่มีเตียงรับ = ไม่ขึ้น)
-- ไม่แตะ booking_api_resolve_v1 (Booking API ของ Saifa ยังไม่ใช้จริง)
--
-- ย้อนกลับ: เปลี่ยนเงื่อนไขทั้ง 2 จุดกลับเป็น (category = 'Class Go') = (สาขา Go)

create or replace function public.online_booking_resolve_v1(p_branch_id uuid, p_promo_id uuid)
returns table (branch_active boolean, procedure_id uuid, promo_id uuid, price numeric, dur int, promo_name text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_active boolean;
  v_bname text;
  v_pr public.promos;
  v_cat text;
  v_blocks int;
begin
  select ob.active, b.name into v_active, v_bname
    from public.online_booking_branches ob join public.branches b on b.id = ob.branch_id
   where ob.branch_id = p_branch_id;
  if not found then raise exception 'INVALID_BRANCH'; end if;

  select pr.* into v_pr
    from public.promos pr join public.online_booking_promos op on op.promo_id = pr.id
   where pr.id = p_promo_id and coalesce(pr.active, false);
  if not found then raise exception 'INVALID_SERVICE'; end if;

  select p.category, p.blocks into v_cat, v_blocks from public.procedures p where p.id = v_pr.procedure_id;
  if not found or coalesce(v_blocks, 0) < 1 then raise exception 'INVALID_SERVICE'; end if;
  -- โปรหมวด Class Go ใช้ได้เฉพาะสาขา Class Go; โปรปกติใช้ได้ทุกสาขา (สาขา Go ลงโปรปกติเป็นหลัก)
  if coalesce(v_cat, '') = 'Class Go' and v_bname not like 'Class Go %' then raise exception 'INVALID_SERVICE'; end if;

  return query select v_active, v_pr.procedure_id, v_pr.id, v_pr.price, v_blocks, btrim(v_pr.name);
end;
$$;

create or replace function public.online_booking_catalog_v1(p_branch_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', pr.id, 'name', btrim(pr.name), 'price', pr.price, 'service', pc.name,
           'duration_minutes', pc.blocks * 5)
           order by coalesce(pr.sort_order, 0), pc.name, pr.price, btrim(pr.name)), '[]'::jsonb)
    from public.online_booking_branches ob
    join public.branches b on b.id = ob.branch_id
    join public.online_booking_promos op on true
    join public.promos pr on pr.id = op.promo_id and coalesce(pr.active, false)
    join public.procedures pc on pc.id = pr.procedure_id and coalesce(pc.blocks, 0) > 0
   where ob.branch_id = p_branch_id and ob.active
     and (coalesce(pc.category, '') <> 'Class Go' or b.name like 'Class Go %')
     and exists (select 1 from public.booking_api_candidate_rooms_v1(ob.branch_id, pc.id));
$$;

revoke all on function public.online_booking_resolve_v1(uuid, uuid), public.online_booking_catalog_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.online_booking_resolve_v1(uuid, uuid), public.online_booking_catalog_v1(uuid)
  to service_role;
