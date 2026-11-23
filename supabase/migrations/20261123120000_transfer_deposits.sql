-- ลูกค้าโอนเงินแล้ว รอจองคิว (แคมเปญครบรอบ 6 ปี Class Clinic และใช้ต่อได้ไม่จำกัดช่วง)
--
-- พนักงานบันทึกการโอน (ชื่อ เบอร์ สาขา โปร ยอดโอน วันที่ + สลิปบังคับ) → ภายหลังกด "เลือกวันที่" จองคิวจริงในฟอร์มบันทึกคิวเดิม
-- แล้วผูกคิวกลับมาที่รายการนี้ (queue_id) → หน้ารายการแสดง "จองแล้ว + วันเวลา" ตามคิวล่าสุด (ไล่ตามการเลื่อนนัด)
-- ยอดรวมรายคนบันทึก (recorded_by = บัญชีที่ล็อกอิน เซิร์ฟเวอร์ใส่เอง เบราว์เซอร์ส่งมาแทนไม่ได้) ใช้คิดค่าคอม
--
-- ความปลอดภัย (แบบเดียวกับคูปอง): ตารางมีชื่อ/เบอร์/ยอดเงินลูกค้า จึงปิดจากคีย์หน้าเว็บตั้งแต่วันแรก
--   RLS เปิด ไม่มี policy + ถอนสิทธิ์ anon/authenticated; ทุกการอ่าน/เขียนผ่าน Edge Function staff-session (ตรวจ role ฝั่งเซิร์ฟเวอร์)
--   ซึ่งเรียกฟังก์ชันด้านล่างด้วย service_role — ฟังก์ชันทั้งหมดถอนสิทธิ์จาก public/anon/authenticated
--   สลิปเก็บใน bucket ส่วนตัว "deposit-slips" (public = false, ไม่มี policy บน storage.objects) อัปโหลด/เปิดดูผ่าน staff-session เท่านั้น
--   (เปิดดูด้วยลิงก์ชั่วคราว 60 วินาที)
--
-- ไม่แตะตารางเดิมใดเลย (อ่านอย่างเดียวจาก queues / staff / branches / promos / procedures) ย้อนกลับ: ดู supabase/rollback/20261123120000_transfer_deposits.sql

create table if not exists public.transfer_deposits (
  id              uuid primary key default gen_random_uuid(),
  customer_name   text not null check (length(btrim(customer_name)) between 1 and 120),
  customer_phone  text not null check (customer_phone ~ '^[0-9]{9,10}$'),
  branch_id       uuid not null references public.branches(id) on delete restrict,
  promo_id        uuid references public.promos(id) on delete set null,
  procedure_id    uuid references public.procedures(id) on delete set null,
  -- ชื่อโปร/หัตถการ ณ ตอนบันทึก (โปรถูกเปลี่ยนชื่อ/ลบทีหลัง รายการเก่ายังอ่านออก)
  promo_name      text not null default '',
  procedure_name  text not null default '',
  amount          numeric(12,2) not null check (amount > 0 and amount <= 1000000),
  record_date     date not null,
  note            text check (note is null or length(note) <= 300),
  slip_path       text not null check (slip_path ~ '^[0-9]{4}-[0-9]{2}/[0-9a-f-]{36}\.(jpg|png|webp)$'),
  recorded_by     uuid not null references public.staff(id) on delete restrict,
  created_at      timestamptz not null default now(),
  -- คิวที่จองให้ (คิวแรกที่ลง ถ้าเลื่อนนัด ระบบไล่ต่อจาก rescheduled_from_id เอง)
  queue_id        uuid references public.queues(id) on delete set null,
  booked_by       uuid references public.staff(id) on delete set null,
  booked_at       timestamptz,
  -- ยกเลิก/คืนเงิน: ไม่ลบแถว แต่ไม่นับยอด
  cancelled_at    timestamptz,
  cancelled_by    uuid references public.staff(id) on delete set null,
  cancel_reason   text,
  check ((cancelled_at is null) = (cancel_reason is null))
);

-- 1 คิว ผูกได้กับรายการโอนเดียว
create unique index if not exists transfer_deposits_queue_uidx on public.transfer_deposits (queue_id) where queue_id is not null;
create index if not exists transfer_deposits_record_idx on public.transfer_deposits (record_date desc, created_at desc);
create index if not exists transfer_deposits_branch_idx on public.transfer_deposits (branch_id, record_date desc);
create index if not exists transfer_deposits_recorder_idx on public.transfer_deposits (recorded_by, record_date desc);
create index if not exists transfer_deposits_phone_idx on public.transfer_deposits (customer_phone);

alter table public.transfer_deposits enable row level security;
revoke all on table public.transfer_deposits from anon, authenticated;

comment on table public.transfer_deposits is
  'ลูกค้าโอนเงินแล้วรอจองคิว — ปิดจากคีย์หน้าเว็บ อ่าน/เขียนผ่าน staff-session deposit_* เท่านั้น';

-- bucket สลิป: ส่วนตัว จำกัดขนาด/ชนิดไฟล์ (ไม่สร้าง policy ใด ๆ = มีแต่ service_role ที่เข้าถึงได้)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('deposit-slips', 'deposit-slips', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 2097152,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- ไล่ตามการเลื่อนนัด: คิวเดิมสถานะ "เลื่อนออก" → คิวใหม่ที่ rescheduled_from_id ชี้มา (สูงสุด 10 ทอด)
create or replace function public.deposit_current_queue(p_queue_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id uuid := p_queue_id;
  v_status text;
  v_next uuid;
  i int := 0;
begin
  if v_id is null then return null; end if;
  loop
    select status into v_status from public.queues where id = v_id;
    if not found then return null; end if;
    exit when v_status is distinct from 'rescheduled' or i >= 10;
    select id into v_next from public.queues
     where rescheduled_from_id = v_id
     order by created_at desc nulls last limit 1;
    exit when v_next is null;
    v_id := v_next;
    i := i + 1;
  end loop;
  return v_id;
end;
$$;

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

-- p_branch_id = null → ทุกสาขา (staff-session บังคับสาขาตัวเองให้ผู้จัดการสาขา/แคชเชีย)
-- p_status: all | waiting (ยังไม่จอง หรือคิวถูกยกเลิก/ไม่มา) | booked | cancelled
create or replace function public.deposit_list_v1(
  p_branch_id uuid, p_search text, p_status text, p_from date, p_to date, p_limit int, p_offset int
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_digits text := nullif(regexp_replace(coalesce(p_search, ''), '[^0-9]', '', 'g'), '');
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_total int;
  v_rows jsonb;
begin
  if p_status not in ('all', 'waiting', 'booked', 'cancelled') then raise exception 'invalid_deposit_payload'; end if;
  with base as (
    select d.*,
      (select q.status from public.queues q where q.id = public.deposit_current_queue(d.queue_id)) as q_status
      from public.transfer_deposits d
     where (p_branch_id is null or d.branch_id = p_branch_id)
       and (p_from is null or d.record_date >= p_from)
       and (p_to is null or d.record_date <= p_to)
       and (v_search is null
            or d.customer_name ilike '%' || v_search || '%'
            or (v_digits is not null and length(v_digits) >= 3 and d.customer_phone like '%' || v_digits || '%'))
  ), filtered as (
    select * from base
     where case p_status
       when 'all' then true
       when 'cancelled' then cancelled_at is not null
       when 'booked' then cancelled_at is null and q_status is not null and q_status not in ('cancelled', 'no_show')
       when 'waiting' then cancelled_at is null and (q_status is null or q_status in ('cancelled', 'no_show'))
     end
  )
  select count(*)::int,
         coalesce((select jsonb_agg(public.deposit_json(p) order by p.record_date desc, p.created_at desc)
                     from (select f.id from filtered f order by f.record_date desc, f.created_at desc limit v_limit offset v_offset) pick
                     join public.transfer_deposits p on p.id = pick.id), '[]'::jsonb)
    into v_total, v_rows
    from filtered;
  return jsonb_build_object('total', v_total, 'deposits', v_rows);
end;
$$;

create or replace function public.deposit_create_v1(
  p_actor_staff_id uuid, p_branch_id uuid, p_customer_name text, p_customer_phone text,
  p_promo_id uuid, p_amount numeric, p_record_date date, p_note text, p_slip_path text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_customer_name, ''));
  v_phone text := regexp_replace(coalesce(p_customer_phone, ''), '[^0-9]', '', 'g');
  v_promo public.promos%rowtype;
  v_proc_name text := '';
  v_row public.transfer_deposits%rowtype;
begin
  if length(v_name) < 1 or length(v_name) > 120 then raise exception 'invalid_name'; end if;
  if v_phone !~ '^[0-9]{9,10}$' then raise exception 'invalid_phone'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1000000 then raise exception 'invalid_amount'; end if;
  if p_record_date is null then raise exception 'invalid_date'; end if;
  -- วันที่บันทึก: ย้อนได้ไม่เกิน 7 วัน (ลืมกรอกวันที่โอน) ห้ามล่วงหน้า — วันตามเวลาไทย
  if p_record_date > (now() at time zone 'Asia/Bangkok')::date
     or p_record_date < (now() at time zone 'Asia/Bangkok')::date - 7 then
    raise exception 'invalid_date';
  end if;
  if not exists (select 1 from public.branches where id = p_branch_id) then raise exception 'invalid_branch'; end if;
  select * into v_promo from public.promos where id = p_promo_id;
  if not found then raise exception 'invalid_promo'; end if;
  select name into v_proc_name from public.procedures where id = v_promo.procedure_id;

  insert into public.transfer_deposits (
    customer_name, customer_phone, branch_id, promo_id, procedure_id, promo_name, procedure_name,
    amount, record_date, note, slip_path, recorded_by
  ) values (
    v_name, v_phone, p_branch_id, v_promo.id, v_promo.procedure_id, coalesce(v_promo.name, ''), coalesce(v_proc_name, ''),
    round(p_amount, 2), p_record_date, nullif(btrim(coalesce(p_note, '')), ''), p_slip_path, p_actor_staff_id
  ) returning * into v_row;
  return public.deposit_json(v_row);
end;
$$;

-- ผูกคิวที่เพิ่งจองกับรายการโอน — คิวต้องเป็นเบอร์เดียวกับรายการ (กันผูกผิดคน) และยังไม่ผูกกับรายการอื่น
-- จองใหม่ได้เฉพาะตอนยังไม่จอง หรือคิวเดิมถูกยกเลิก/ไม่มา
create or replace function public.deposit_link_v1(p_actor_staff_id uuid, p_deposit_id uuid, p_queue_id uuid, p_branch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.transfer_deposits%rowtype;
  v_queue public.queues%rowtype;
  v_current_status text;
begin
  select * into v_row from public.transfer_deposits where id = p_deposit_id for update;
  if not found or (p_branch_id is not null and v_row.branch_id <> p_branch_id) then raise exception 'deposit_not_found'; end if;
  if v_row.cancelled_at is not null then raise exception 'deposit_cancelled'; end if;
  if v_row.queue_id = p_queue_id then return public.deposit_json(v_row); end if; -- กดซ้ำ/ส่งซ้ำ
  select q.status into v_current_status from public.queues q where q.id = public.deposit_current_queue(v_row.queue_id);
  if v_current_status is not null and v_current_status not in ('cancelled', 'no_show') then raise exception 'deposit_already_booked'; end if;
  select * into v_queue from public.queues where id = p_queue_id;
  if not found then raise exception 'queue_not_found'; end if;
  if regexp_replace(coalesce(v_queue.phone, ''), '[^0-9]', '', 'g') <> v_row.customer_phone then raise exception 'queue_phone_mismatch'; end if;
  if exists (select 1 from public.transfer_deposits where queue_id = p_queue_id and id <> p_deposit_id) then raise exception 'queue_already_linked'; end if;

  update public.transfer_deposits
     set queue_id = p_queue_id, booked_by = p_actor_staff_id, booked_at = now()
   where id = p_deposit_id
  returning * into v_row;
  return public.deposit_json(v_row);
end;
$$;

create or replace function public.deposit_cancel_v1(p_actor_staff_id uuid, p_deposit_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
  v_row public.transfer_deposits%rowtype;
begin
  if length(v_reason) < 2 or length(v_reason) > 200 then raise exception 'invalid_reason'; end if;
  update public.transfer_deposits
     set cancelled_at = now(), cancelled_by = p_actor_staff_id, cancel_reason = v_reason
   where id = p_deposit_id and cancelled_at is null
  returning * into v_row;
  if not found then
    if exists (select 1 from public.transfer_deposits where id = p_deposit_id) then raise exception 'deposit_cancelled'; end if;
    raise exception 'deposit_not_found';
  end if;
  return public.deposit_json(v_row);
end;
$$;

-- สลิปของรายการ (ให้ staff-session ออกลิงก์ชั่วคราว) — ตรวจสาขาให้บทบาทระดับสาขา
create or replace function public.deposit_slip_path_v1(p_deposit_id uuid, p_branch_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select slip_path from public.transfer_deposits
   where id = p_deposit_id and (p_branch_id is null or branch_id = p_branch_id);
$$;

-- ยอดรวมรายคนบันทึก (ไม่นับรายการที่ยกเลิก/คืนเงิน) — แสดง 3 แบบคู่กันให้เลือกเกณฑ์ค่าคอมทีหลัง:
--   ทั้งหมด (นับตอนบันทึก) / จองคิวแล้ว / ลูกค้ามาทำแล้ว (คิวสถานะ done)
-- p_recorder = null → ทุกคน, ไม่ null → เฉพาะคนนั้น
create or replace function public.deposit_stats_v1(p_from date, p_to date, p_branch_id uuid, p_recorder uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select d.recorded_by, d.amount,
           (select q.status from public.queues q where q.id = public.deposit_current_queue(d.queue_id)) as q_status
      from public.transfer_deposits d
     where d.cancelled_at is null
       and (p_from is null or d.record_date >= p_from)
       and (p_to is null or d.record_date <= p_to)
       and (p_branch_id is null or d.branch_id = p_branch_id)
       and (p_recorder is null or d.recorded_by = p_recorder)
  ), per as (
    select recorded_by,
           count(*)::int as count, sum(amount) as amount,
           count(*) filter (where q_status is not null and q_status not in ('cancelled', 'no_show'))::int as booked_count,
           coalesce(sum(amount) filter (where q_status is not null and q_status not in ('cancelled', 'no_show')), 0) as booked_amount,
           count(*) filter (where q_status = 'done')::int as done_count,
           coalesce(sum(amount) filter (where q_status = 'done'), 0) as done_amount
      from base group by recorded_by
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'staffId', per.recorded_by,
           'staffName', coalesce((select coalesce(nullif(s.nickname, ''), s.name) from public.staff s where s.id = per.recorded_by), ''),
           'count', per.count, 'amount', per.amount,
           'bookedCount', per.booked_count, 'bookedAmount', per.booked_amount,
           'doneCount', per.done_count, 'doneAmount', per.done_amount
         ) order by per.amount desc), '[]'::jsonb)
    from per;
$$;

revoke all on function public.deposit_current_queue(uuid) from public, anon, authenticated;
revoke all on function public.deposit_json(public.transfer_deposits) from public, anon, authenticated;
revoke all on function public.deposit_list_v1(uuid, text, text, date, date, int, int) from public, anon, authenticated;
revoke all on function public.deposit_create_v1(uuid, uuid, text, text, uuid, numeric, date, text, text) from public, anon, authenticated;
revoke all on function public.deposit_link_v1(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.deposit_cancel_v1(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.deposit_slip_path_v1(uuid, uuid) from public, anon, authenticated;
revoke all on function public.deposit_stats_v1(date, date, uuid, uuid) from public, anon, authenticated;
grant execute on function public.deposit_list_v1(uuid, text, text, date, date, int, int) to service_role;
grant execute on function public.deposit_create_v1(uuid, uuid, text, text, uuid, numeric, date, text, text) to service_role;
grant execute on function public.deposit_link_v1(uuid, uuid, uuid, uuid) to service_role;
grant execute on function public.deposit_cancel_v1(uuid, uuid, text) to service_role;
grant execute on function public.deposit_slip_path_v1(uuid, uuid) to service_role;
grant execute on function public.deposit_stats_v1(date, date, uuid, uuid) to service_role;
