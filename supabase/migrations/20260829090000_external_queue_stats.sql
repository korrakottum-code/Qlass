-- API ภายนอก: สถิติคิวแบบรวมยอด (read-only, ไม่มีข้อมูลส่วนบุคคล)
--
-- ทำไมต้องรวมยอดใน SQL แทนที่จะให้ Edge Function ดึงแถวไปนับเอง:
-- ตาราง queues โตขึ้นเรื่อยๆ (หลายหมื่นแถวต่อเดือนเมื่อครบทุกสาขา) การดึงแถวออกมา
-- ต้องวนเพจทีละ 1000 และส่งข้อมูลระดับแถว — ซึ่งรวมถึงคอลัมน์ที่เป็นข้อมูลลูกค้า
-- ผ่าน memory ของฟังก์ชันโดยไม่จำเป็น การ group ใน SQL ทำให้ **ข้อมูลส่วนบุคคล
-- ไม่เคยออกจากฐานข้อมูลเลย** และตอบกลับเป็นตัวเลขล้วนขนาดคงที่
--
-- ฟังก์ชันนี้ไม่คืน name, phone, note, price หรือ id ของคิวใดๆ ทั้งสิ้น
-- (price ถูกกันออกโดยตั้งใจ — ยอดขายใช้จากระบบบัญชี ไม่ใช่จากโปรแกรมลงคิว)
--
-- สิทธิ์: ให้เฉพาะ service_role เรียกได้ ผ่าน Edge Function ที่ตรวจ API key แล้ว
-- browser role (anon/authenticated) เรียกไม่ได้ ตามแนวเดียวกับ goal18

create or replace function public.external_queue_stats(
  p_since date,
  p_until date
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with scoped as (
    select q.branch_id, q.date, q.status, q.customer_type
    from public.queues q
    where q.date between p_since and p_until
  ),
  per_branch as (
    select
      s.branch_id,
      coalesce(b.name, 'ไม่ระบุสาขา') as branch_name,
      count(*)::int as total,
      count(*) filter (where s.status = 'done')::int as done,
      count(*) filter (where s.status = 'no_show')::int as no_show,
      count(*) filter (where s.status = 'cancelled')::int as cancelled,
      count(*) filter (where s.status = 'confirmed')::int as confirmed,
      count(*) filter (where s.status in ('pending', 'waiting_queue', 'follow1', 'follow2', 'follow3'))::int as pending,
      count(*) filter (where s.status in ('rescheduled', 'rescheduled_in'))::int as rescheduled,
      count(*) filter (where s.customer_type = 'new')::int as new_customers,
      count(*) filter (where s.customer_type = 'old')::int as returning_customers,
      count(*) filter (where s.customer_type = 'course')::int as course_customers
    from scoped s
    left join public.branches b on b.id = s.branch_id
    group by s.branch_id, coalesce(b.name, 'ไม่ระบุสาขา')
  ),
  per_day as (
    select
      s.date,
      count(*)::int as total,
      count(*) filter (where s.status = 'done')::int as done,
      count(*) filter (where s.status = 'no_show')::int as no_show
    from scoped s
    group by s.date
  )
  select jsonb_build_object(
    'since', p_since,
    'until', p_until,
    'totals', coalesce((
      select jsonb_build_object(
        'total',               sum(total)::int,
        'done',                sum(done)::int,
        'noShow',              sum(no_show)::int,
        'cancelled',           sum(cancelled)::int,
        'confirmed',           sum(confirmed)::int,
        'pending',             sum(pending)::int,
        'rescheduled',         sum(rescheduled)::int,
        'newCustomers',        sum(new_customers)::int,
        'returningCustomers',  sum(returning_customers)::int,
        'courseCustomers',     sum(course_customers)::int
      ) from per_branch
    ), jsonb_build_object(
        'total', 0, 'done', 0, 'noShow', 0, 'cancelled', 0, 'confirmed', 0,
        'pending', 0, 'rescheduled', 0, 'newCustomers', 0,
        'returningCustomers', 0, 'courseCustomers', 0
    )),
    'branches', coalesce((
      select jsonb_agg(jsonb_build_object(
        'branchId',            branch_id,
        'name',                branch_name,
        'total',               total,
        'done',                done,
        'noShow',              no_show,
        'cancelled',           cancelled,
        'confirmed',           confirmed,
        'pending',             pending,
        'rescheduled',         rescheduled,
        'newCustomers',        new_customers,
        'returningCustomers',  returning_customers,
        'courseCustomers',     course_customers
      ) order by total desc, branch_name)
      from per_branch
    ), '[]'::jsonb),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date',   date,
        'total',  total,
        'done',   done,
        'noShow', no_show
      ) order by date)
      from per_day
    ), '[]'::jsonb)
  );
$$;

comment on function public.external_queue_stats(date, date) is
  'สถิติคิวแบบรวมยอดสำหรับ API ภายนอก — ไม่คืนข้อมูลส่วนบุคคลหรือราคา เรียกได้เฉพาะ service_role';

-- ปิดสิทธิ์ทุกคนก่อน แล้วเปิดให้เฉพาะ service_role (fail closed)
revoke all on function public.external_queue_stats(date, date) from public;
revoke all on function public.external_queue_stats(date, date) from anon;
revoke all on function public.external_queue_stats(date, date) from authenticated;
grant execute on function public.external_queue_stats(date, date) to service_role;
