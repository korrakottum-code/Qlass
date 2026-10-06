-- เพิ่มช่อง waiting / rescheduledIn / overdue ให้ public.external_queue_stats
--
-- ทำไม: แดชบอร์ด CEO นับ "คิวค้าง" เกินจริง (186 vs 38 ของ ก.ย. 2569) เพราะช่อง pending
-- รวม waiting_queue ไว้ และ rescheduled รวม rescheduled_in ไว้ จึงแยกไม่ออกว่าอะไรคือ
-- "คิวรอ" (ยังไม่มีวันนัดจริง) และอะไรคือ "เลื่อนมา" (ยังไม่ปิดงาน) เพิ่มช่องแยกให้
-- โดย **ไม่เปลี่ยนความหมายช่องเดิมสักช่อง** (แดชบอร์ดยังอ่าน pending/rescheduled เดิมอยู่)
--
-- ช่องใหม่ (ทั้งใน totals และในแต่ละแถวของ branches):
--   waiting / waitingNew / waitingReturning / waitingCourse = status 'waiting_queue'
--                                                             (แยกตาม customer_type new/old/course)
--   rescheduledIn = status 'rescheduled_in'
--   overdue       = status ใน (pending, follow1, follow2, follow3, confirmed, rescheduled_in)
--                   และ date < วันนี้ตามเวลาไทย — กติกาเดียวกับ classifyActivation()
--                   ใน src/utils/statusActivation.js (หน้า "การแอคทีฟสถานะคิว")
--
-- วันนี้ต้องเป็นเวลาไทยเสมอ: เซิร์ฟเวอร์ฐานข้อมูลเป็น UTC ถ้าใช้ current_date ตรงๆ
-- ช่วง 00:00-06:59 น. ไทยจะนับ "เมื่อวาน" เป็นวันนี้ ทำให้คิวของวันนี้ไม่ถูกนับเป็นค้าง
-- ในขณะที่หน้า Qlass (ใช้เวลาไทย) นับไปแล้ว
--
-- ยังไม่มีข้อมูลส่วนบุคคลเหมือนเดิม: อ่านแค่ 6 คอลัมน์เดิมของ queues ไม่มี name / phone /
-- note / price / id ของคิว

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
      count(*) filter (where s.customer_type = 'course')::int as course_customers,
      count(*) filter (where s.status = 'waiting_queue')::int as waiting,
      count(*) filter (where s.status = 'waiting_queue' and s.customer_type = 'new')::int as waiting_new,
      count(*) filter (where s.status = 'waiting_queue' and s.customer_type = 'old')::int as waiting_returning,
      count(*) filter (where s.status = 'waiting_queue' and s.customer_type = 'course')::int as waiting_course,
      count(*) filter (where s.status = 'rescheduled_in')::int as rescheduled_in,
      count(*) filter (
        where s.status in ('pending', 'follow1', 'follow2', 'follow3', 'confirmed', 'rescheduled_in')
          and s.date < (now() at time zone 'Asia/Bangkok')::date
      )::int as overdue
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
        'courseCustomers',     sum(course_customers)::int,
        'waiting',             sum(waiting)::int,
        'waitingNew',          sum(waiting_new)::int,
        'waitingReturning',    sum(waiting_returning)::int,
        'waitingCourse',       sum(waiting_course)::int,
        'rescheduledIn',       sum(rescheduled_in)::int,
        'overdue',             sum(overdue)::int
      ) from per_branch
    ), jsonb_build_object(
        'total', 0, 'done', 0, 'noShow', 0, 'cancelled', 0, 'confirmed', 0,
        'pending', 0, 'rescheduled', 0, 'newCustomers', 0,
        'returningCustomers', 0, 'courseCustomers', 0,
        'waiting', 0, 'waitingNew', 0, 'waitingReturning', 0, 'waitingCourse', 0,
        'rescheduledIn', 0, 'overdue', 0
    )),
    'branches', coalesce((
      select jsonb_agg(jsonb_build_object(
        'branchId', branch_id, 'name', branch_name, 'total', total,
        'done', done, 'noShow', no_show, 'cancelled', cancelled,
        'confirmed', confirmed, 'pending', pending, 'rescheduled', rescheduled,
        'newCustomers', new_customers, 'returningCustomers', returning_customers,
        'courseCustomers', course_customers,
        'waiting', waiting, 'waitingNew', waiting_new,
        'waitingReturning', waiting_returning, 'waitingCourse', waiting_course,
        'rescheduledIn', rescheduled_in, 'overdue', overdue
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
  'สถิติคิวแบบรวมยอดสำหรับ API ภายนอก (รายหัตถการ/รายโปร + คิวรอ/เลื่อนมา/คิวค้างตามเวลาไทย) — ไม่คืนข้อมูลส่วนบุคคลหรือราคา เรียกได้เฉพาะ service_role';

revoke all on function public.external_queue_stats(date, date) from public;
revoke all on function public.external_queue_stats(date, date) from anon;
revoke all on function public.external_queue_stats(date, date) from authenticated;
grant execute on function public.external_queue_stats(date, date) to service_role;
