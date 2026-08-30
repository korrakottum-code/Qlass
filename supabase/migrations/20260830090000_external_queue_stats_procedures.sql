-- เพิ่ม byProcedure / byPromo ให้ public.external_queue_stats
--
-- ทำไม: แดชบอร์ดผู้บริหารต้องตอบให้ได้ว่า "ยอดคิวที่หายไป หายจากหัตถการไหน"
-- ไม่ใช่แค่ "หายไปเท่าไหร่" — เดิมฟังก์ชันคืนแค่ยอดรวมกับรายสาขา
--
-- ยังไม่มีข้อมูลส่วนบุคคลเหมือนเดิม: อ่านเพิ่มแค่ procedure_id / promo_id
-- ซึ่งเป็น foreign key ไปตารางรายการหัตถการและโปร ไม่ใช่ข้อมูลลูกค้า
--
-- byPromo จำกัด 40 อันดับแรก เพราะมีโปรอยู่ ~284 รายการ ส่วนใหญ่มีไม่กี่คิว
-- ถ้าส่งทั้งหมดจะเป็น payload ที่ไม่มีใครใช้

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
    select q.branch_id, q.date, q.status, q.customer_type, q.procedure_id, q.promo_id
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
  per_procedure as (
    select
      coalesce(p.name, 'ไม่ระบุหัตถการ') as procedure_name,
      count(*)::int as total,
      count(*) filter (where s.status = 'done')::int as done,
      count(*) filter (where s.status = 'no_show')::int as no_show,
      count(*) filter (where s.status = 'cancelled')::int as cancelled,
      count(*) filter (where s.customer_type = 'new')::int as new_customers,
      count(*) filter (where s.customer_type = 'course')::int as course_customers
    from scoped s
    left join public.procedures p on p.id = s.procedure_id
    group by coalesce(p.name, 'ไม่ระบุหัตถการ')
  ),
  per_promo as (
    select
      coalesce(pr.name, 'ไม่ระบุโปร') as promo_name,
      count(*)::int as total,
      count(*) filter (where s.status = 'done')::int as done,
      count(*) filter (where s.customer_type = 'new')::int as new_customers
    from scoped s
    left join public.promos pr on pr.id = s.promo_id
    group by coalesce(pr.name, 'ไม่ระบุโปร')
    order by count(*) desc
    limit 40
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
        'branchId', branch_id, 'name', branch_name, 'total', total,
        'done', done, 'noShow', no_show, 'cancelled', cancelled,
        'confirmed', confirmed, 'pending', pending, 'rescheduled', rescheduled,
        'newCustomers', new_customers, 'returningCustomers', returning_customers,
        'courseCustomers', course_customers
      ) order by total desc, branch_name)
      from per_branch
    ), '[]'::jsonb),
    'procedures', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', procedure_name, 'total', total, 'done', done,
        'noShow', no_show, 'cancelled', cancelled,
        'newCustomers', new_customers, 'courseCustomers', course_customers
      ) order by total desc, procedure_name)
      from per_procedure
    ), '[]'::jsonb),
    'promos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', promo_name, 'total', total, 'done', done, 'newCustomers', new_customers
      ) order by total desc, promo_name)
      from per_promo
    ), '[]'::jsonb),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', date, 'total', total, 'done', done, 'noShow', no_show
      ) order by date)
      from per_day
    ), '[]'::jsonb)
  );
$$;

comment on function public.external_queue_stats(date, date) is
  'สถิติคิวแบบรวมยอดสำหรับ API ภายนอก (รวมรายหัตถการและรายโปร) — ไม่คืนข้อมูลส่วนบุคคลหรือราคา เรียกได้เฉพาะ service_role';

revoke all on function public.external_queue_stats(date, date) from public;
revoke all on function public.external_queue_stats(date, date) from anon;
revoke all on function public.external_queue_stats(date, date) from authenticated;
grant execute on function public.external_queue_stats(date, date) to service_role;
