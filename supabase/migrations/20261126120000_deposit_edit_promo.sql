-- ลูกค้าโอนแล้ว รอจองคิว: แก้โปร/หัตถการที่เลือกผิด (เจ้าของขอ 26 พ.ย. 2569)
-- แก้ได้เฉพาะโปร (ไม่แก้ยอดโอน/ชื่อ/เบอร์ — ยอดโอนผูกกับค่าคอม) และเก็บประวัติทุกครั้งว่าใครแก้ จากอะไรเป็นอะไร
-- โปรของรายการโอนใช้แค่แสดงชื่อ + เติมฟอร์มตอนกด "เลือกวันที่" ไม่มีผลกับคิวที่จองไปแล้ว
-- ย้อน: supabase/rollback/20261126120000_deposit_edit_promo.sql

alter table public.transfer_deposits
  add column if not exists edit_log jsonb not null default '[]'::jsonb;

create or replace function public.deposit_json(d public.transfer_deposits)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', d.id,
    'customerName', d.customer_name,
    'customerPhone', d.customer_phone,
    'branchId', d.branch_id,
    'branchName', coalesce((select b.name from public.branches b where b.id = d.branch_id), ''),
    'promoId', d.promo_id,
    'procedureId', d.procedure_id,
    'promoName', d.promo_name,
    'procedureName', d.procedure_name,
    'amount', d.amount,
    'recordDate', d.record_date,
    'note', d.note,
    'hasSlip', d.slip_path is not null,
    'recordedBy', d.recorded_by,
    'recordedByName', coalesce((select coalesce(nullif(s.nickname, ''), s.name) from public.staff s where s.id = d.recorded_by), ''),
    'createdAt', d.created_at,
    'queueId', d.queue_id,
    'bookedAt', d.booked_at,
    'cancelledAt', d.cancelled_at,
    'cancelReason', d.cancel_reason,
    'booking', (
      select jsonb_build_object('queueId', q.id, 'date', q.date, 'timeBlock', q.time_block, 'status', q.status)
        from public.queues q where q.id = public.deposit_current_queue(d.queue_id)
    ),
    'lastEdit', (
      select jsonb_build_object(
        'at', e->>'at',
        'fromPromoName', e->>'fromPromoName',
        'byName', coalesce((select coalesce(nullif(s.nickname, ''), s.name) from public.staff s where s.id::text = e->>'by'), '')
      )
        from jsonb_array_elements(coalesce(d.edit_log, '[]'::jsonb)) with ordinality as x(e, n)
       order by x.n desc limit 1
    )
  );
$$;
revoke all on function public.deposit_json(public.transfer_deposits) from public, anon, authenticated;

create or replace function public.deposit_update_promo_v1(
  p_actor_staff_id uuid, p_deposit_id uuid, p_promo_id uuid, p_branch_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.transfer_deposits%rowtype;
  v_promo public.promos%rowtype;
  v_proc_name text := '';
begin
  if p_actor_staff_id is null or p_deposit_id is null then raise exception 'invalid_deposit_payload'; end if;
  select * into v_row from public.transfer_deposits where id = p_deposit_id for update;
  -- ผู้จัดการสาขา/แคชเชีย: รายการของสาขาอื่น = ไม่พบ (ไม่บอกว่ามีอยู่)
  if not found or (p_branch_id is not null and v_row.branch_id is distinct from p_branch_id) then
    raise exception 'deposit_not_found';
  end if;
  if v_row.cancelled_at is not null then raise exception 'deposit_cancelled'; end if;
  select * into v_promo from public.promos where id = p_promo_id;
  if not found then raise exception 'invalid_promo'; end if;
  if v_row.promo_id is not distinct from v_promo.id then return public.deposit_json(v_row); end if;
  select name into v_proc_name from public.procedures where id = v_promo.procedure_id;

  update public.transfer_deposits
     set promo_id = v_promo.id,
         procedure_id = v_promo.procedure_id,
         promo_name = coalesce(v_promo.name, ''),
         procedure_name = coalesce(v_proc_name, ''),
         edit_log = coalesce(edit_log, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
           'at', now(), 'by', p_actor_staff_id,
           'fromPromoId', v_row.promo_id, 'fromPromoName', v_row.promo_name,
           'toPromoId', v_promo.id, 'toPromoName', coalesce(v_promo.name, '')
         ))
   where id = p_deposit_id
  returning * into v_row;
  return public.deposit_json(v_row);
end;
$$;
revoke all on function public.deposit_update_promo_v1(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.deposit_update_promo_v1(uuid, uuid, uuid, uuid) to service_role;
