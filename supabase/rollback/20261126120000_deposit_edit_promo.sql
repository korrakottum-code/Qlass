-- ย้อน 20261126120000_deposit_edit_promo.sql
-- โปรที่แก้ไปแล้วจะคงเป็นค่าใหม่ (ประวัติการแก้หายไปพร้อมคอลัมน์ edit_log)
-- ต้องย้อน staff-session (ตัด action deposit_update_promo) ก่อน ไม่อย่างนั้นปุ่มแก้ไขจะขึ้น error

drop function if exists public.deposit_update_promo_v1(uuid, uuid, uuid, uuid);

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
    )
  );
$$;
revoke all on function public.deposit_json(public.transfer_deposits) from public, anon, authenticated;

alter table public.transfer_deposits drop column if exists edit_log;
