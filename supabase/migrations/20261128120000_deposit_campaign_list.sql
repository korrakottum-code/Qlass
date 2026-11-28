-- API ภายนอก: รายชื่อ + เบอร์ลูกค้าที่โอนแล้ว (แคมเปญ 6 ปี) ให้ทีมโฆษณา (เจ้าของขอ 28 พ.ย. 2569 "ชื่อเบอร์")
--
-- แยกจาก deposit_campaign_stats_v1 (ยอดรวม) — คนละ RPC คนละ Edge Function ไม่แก้ของเดิม
-- ใช้คีย์เดียวกับยอดรวม (QLASS_DEPOSIT_STATS_API_KEY) ตามที่เจ้าของสั่ง: ลบคีย์ = ปิดทั้งสองช่อง
--
-- ส่งรายแถว: วันที่บันทึก, สาขา, โปร/หัตถการ, ยอดเงิน, สถานะ, จองแล้ว/ยัง, ชื่อลูกค้า, เบอร์ลูกค้า
-- ไม่ส่ง: สลิป, หมายเหตุ, เหตุผลยกเลิก, ผู้บันทึก/ผู้จอง/ผู้ยกเลิก, ประวัติแก้ไข, id รายการ/คิว
-- เกณฑ์ "จองแล้ว" และ "ยกเลิก" เหมือน deposit_campaign_stats_v1
--
-- กันในฐานข้อมูล: ย้อนไม่เกิน 30 วัน, ห้ามวันอนาคต, 30 ครั้ง/ชม. (นับแยกจากยอดรวม), หมดอายุตั้งแต่ 4 ธ.ค. 2569
-- สิทธิ์: service_role เท่านั้น ผ่าน Edge Function deposit-campaign-list ที่ตรวจคีย์ QLASS_DEPOSIT_STATS_API_KEY
-- ย้อน: supabase/rollback/20261128120000_deposit_campaign_list.sql

create table if not exists public.deposit_campaign_list_calls (
  id bigint generated always as identity primary key,
  at timestamptz not null default now()
);
create index if not exists deposit_campaign_list_calls_at_idx on public.deposit_campaign_list_calls (at);
alter table public.deposit_campaign_list_calls enable row level security;
revoke all on table public.deposit_campaign_list_calls from public, anon, authenticated;

create or replace function public.deposit_campaign_list_v1(p_since date, p_until date)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
  v_result jsonb;
begin
  if v_today > date '2026-12-03' then raise exception 'api_expired'; end if;
  if p_since is null or p_until is null or p_since > p_until then raise exception 'invalid_range'; end if;
  if p_since < v_today - 29 or p_until > v_today then raise exception 'range_out_of_window'; end if;

  if (select count(*) from public.deposit_campaign_list_calls where at > now() - interval '1 hour') >= 30 then
    raise exception 'rate_limited';
  end if;
  insert into public.deposit_campaign_list_calls default values;
  delete from public.deposit_campaign_list_calls where at < now() - interval '2 days';

  with base as (
    select d.record_date, d.created_at, d.branch_id, d.promo_name, d.procedure_name, d.amount,
           d.customer_name, d.customer_phone,
           (d.cancelled_at is not null) as is_cancelled,
           (select q.status from public.queues q where q.id = public.deposit_current_queue(d.queue_id)) as q_status
      from public.transfer_deposits d
     where d.record_date between p_since and p_until
  ), marked as (
    select b.*,
           (not b.is_cancelled and b.q_status is not null
             and b.q_status not in ('cancelled', 'no_show', 'rescheduled')) as is_booked
      from base b
  )
  select jsonb_build_object(
    'since', p_since,
    'until', p_until,
    'expiresAfter', '2026-12-03',
    'rows', coalesce(jsonb_agg(jsonb_build_object(
      'date',          m.record_date,
      'branchName',    coalesce((select br.name from public.branches br where br.id = m.branch_id), ''),
      'promoName',     m.promo_name,
      'procedureName', m.procedure_name,
      'amount',        m.amount,
      'status',        case when m.is_cancelled then 'cancelled' else 'active' end,
      'booked',        m.is_booked,
      'customerName',  m.customer_name,
      'customerPhone', m.customer_phone
    ) order by m.record_date desc, m.created_at desc), '[]'::jsonb)
  ) into v_result
  from marked m;

  return v_result;
end;
$$;

revoke all on function public.deposit_campaign_list_v1(date, date) from public;
revoke all on function public.deposit_campaign_list_v1(date, date) from anon;
revoke all on function public.deposit_campaign_list_v1(date, date) from authenticated;
grant execute on function public.deposit_campaign_list_v1(date, date) to service_role;
