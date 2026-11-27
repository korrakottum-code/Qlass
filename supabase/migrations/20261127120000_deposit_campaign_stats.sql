-- API ภายนอก: ยอดรวมรายการโอน "ลูกค้าโอนแล้ว รอจองคิว" (แคมเปญ 6 ปี) ให้แดชบอร์ดทีมโฆษณา (ขอ 27 พ.ย. 2569)
--
-- ส่งเฉพาะ "ยอดรวม" ต่อ วันที่บันทึก × สาขา × โปร/หัตถการ × สถานะ × จองแล้ว/ยัง (นับจำนวน + รวมเงิน)
-- ไม่มีชื่อลูกค้า เบอร์ สลิป หมายเหตุ เหตุผลยกเลิก ผู้บันทึก หรือ id ของรายการ/คิวใด ๆ
-- วันที่ = record_date (วันที่บันทึก) แบบเดียวกับการ์ดสรุปในหน้า Qlass ตัวเลขจึงตรงกัน
-- "ยกเลิก" รวมยกเลิกและคืนเงิน เพราะในระบบเป็นปุ่มเดียวกัน (แยกกันแค่ข้อความเหตุผล ซึ่งไม่ส่งออก)
-- "จองแล้ว" = คิวล่าสุด (ไล่ตามการเลื่อนนัด) ไม่ใช่ ยกเลิก/ไม่มา/เลื่อนออก — เกณฑ์เดียวกับ deposit_stats_v1 และการ์ดสรุป
--
-- กันไว้ในฐานข้อมูลด้วย ไม่ใช่แค่ใน Edge Function:
--   ย้อนหลังได้ไม่เกิน 30 วัน (นับวันนี้ด้วย, เวลาไทย) และห้ามขอวันในอนาคต
--   เรียกได้ไม่เกิน 30 ครั้งต่อชั่วโมง (แดชบอร์ดดึงทุก 30 นาที = 2 ครั้ง/ชม.)
--   หมดอายุเอง: ตั้งแต่ 4 ธ.ค. 2569 (เวลาไทย) ตอบ api_expired เสมอ (แคมเปญจบ 2 ธ.ค.)
--
-- สิทธิ์: service_role เท่านั้น ผ่าน Edge Function deposit-campaign-stats ที่ตรวจคีย์ QLASS_DEPOSIT_STATS_API_KEY
-- ตารางนับครั้งเรียกปิดจากคีย์หน้าเว็บเหมือน transfer_deposits
-- ย้อน: supabase/rollback/20261127120000_deposit_campaign_stats.sql

create table if not exists public.deposit_campaign_stats_calls (
  id bigint generated always as identity primary key,
  at timestamptz not null default now()
);
create index if not exists deposit_campaign_stats_calls_at_idx on public.deposit_campaign_stats_calls (at);
alter table public.deposit_campaign_stats_calls enable row level security;
revoke all on table public.deposit_campaign_stats_calls from public, anon, authenticated;

create or replace function public.deposit_campaign_stats_v1(p_since date, p_until date)
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

  if (select count(*) from public.deposit_campaign_stats_calls where at > now() - interval '1 hour') >= 30 then
    raise exception 'rate_limited';
  end if;
  insert into public.deposit_campaign_stats_calls default values;
  delete from public.deposit_campaign_stats_calls where at < now() - interval '2 days';

  with base as (
    select d.record_date, d.branch_id, d.promo_name, d.procedure_name, d.amount,
           (d.cancelled_at is not null) as is_cancelled,
           (select q.status from public.queues q where q.id = public.deposit_current_queue(d.queue_id)) as q_status
      from public.transfer_deposits d
     where d.record_date between p_since and p_until
  ), marked as (
    select b.*,
           (not b.is_cancelled and b.q_status is not null
             and b.q_status not in ('cancelled', 'no_show', 'rescheduled')) as is_booked
      from base b
  ), grouped as (
    select m.record_date, m.branch_id, m.promo_name, m.procedure_name, m.is_cancelled, m.is_booked,
           count(*)::int as cnt, sum(m.amount) as amt
      from marked m
     group by m.record_date, m.branch_id, m.promo_name, m.procedure_name, m.is_cancelled, m.is_booked
  )
  select jsonb_build_object(
    'since', p_since,
    'until', p_until,
    'expiresAfter', '2026-12-03',
    'totals', jsonb_build_object(
      'count',           coalesce(sum(g.cnt) filter (where not g.is_cancelled), 0),
      'amount',          coalesce(sum(g.amt) filter (where not g.is_cancelled), 0),
      'bookedCount',     coalesce(sum(g.cnt) filter (where g.is_booked), 0),
      'bookedAmount',    coalesce(sum(g.amt) filter (where g.is_booked), 0),
      'notBookedCount',  coalesce(sum(g.cnt) filter (where not g.is_cancelled and not g.is_booked), 0),
      'notBookedAmount', coalesce(sum(g.amt) filter (where not g.is_cancelled and not g.is_booked), 0),
      'cancelledCount',  coalesce(sum(g.cnt) filter (where g.is_cancelled), 0),
      'cancelledAmount', coalesce(sum(g.amt) filter (where g.is_cancelled), 0)
    ),
    'rows', coalesce(jsonb_agg(jsonb_build_object(
      'date',          g.record_date,
      'branchId',      g.branch_id,
      'branchName',    coalesce((select br.name from public.branches br where br.id = g.branch_id), ''),
      'promoName',     g.promo_name,
      'procedureName', g.procedure_name,
      'status',        case when g.is_cancelled then 'cancelled' else 'active' end,
      'booked',        g.is_booked,
      'count',         g.cnt,
      'amount',        g.amt
    ) order by g.record_date desc, g.branch_id, g.promo_name, g.is_cancelled, g.is_booked desc) filter (where g.cnt is not null), '[]'::jsonb)
  ) into v_result
  from grouped g;

  return v_result;
end;
$$;

revoke all on function public.deposit_campaign_stats_v1(date, date) from public;
revoke all on function public.deposit_campaign_stats_v1(date, date) from anon;
revoke all on function public.deposit_campaign_stats_v1(date, date) from authenticated;
grant execute on function public.deposit_campaign_stats_v1(date, date) to service_role;
