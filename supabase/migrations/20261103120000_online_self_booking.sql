-- ลูกค้าจองคิวเองผ่านหน้าเว็บ (/#book) — รอบแรกยังไม่มี OTP (เจ้าของ 3 พ.ย. 2569: "ตัดเรื่องโอทีพีออกไปก่อน ทำให้จองได้ก่อน")
--
-- เพิ่มอย่างเดียว ไม่แตะตาราง/ฟังก์ชันที่ใช้งานอยู่ — กติกาห้องว่างใช้ฟังก์ชันชุดเดียวกับ Booking API ของ Saifa
-- (booking_api_candidate_rooms_v1 / room_status_v1 / free_rooms_v1 / day_range_v1 = กติกาเดียวกับ create_queue_v1)
-- และล็อกห้อง-วันด้วยกุญแจเดียวกัน ('queue-room-day:<ห้อง>:<วัน>') จึงไม่ชนกับพนักงานที่ลงคิวพร้อมกัน
--
-- เปิดเฉพาะที่ตั้งค่าไว้: สาขาต้องอยู่ใน online_booking_branches (active) และบริการ (โปร) ต้องอยู่ใน online_booking_promos
-- ตั้งค่าจากเมนู "จองออนไลน์" (superadmin / head_admin) ผ่าน staff-session — ตารางทั้งหมดปิดจากคีย์หน้าเว็บ
-- หน้าเว็บลูกค้าเรียกผ่าน edge function `public-booking` (service_role) เท่านั้น
--
-- คิวลงเป็นพนักงาน "จองออนไลน์ (ลูกค้าจองเอง)" (role admin, ปิดใช้งาน = ล็อกอินไม่ได้, ค่าคอม 0)
-- หมายเหตุคิวขึ้นต้นด้วย "[จองออนไลน์]" ให้หน้าร้านเห็นในตารางคิว
--
-- กันจองมั่ว (ยังไม่มี OTP): ต้องจองก่อนนัด ≥ 2 ชม. ล่วงหน้าไม่เกิน 14 วัน, เบอร์เดียวมีคิวออนไลน์ที่ยังไม่ถึงวันได้ไม่เกิน 2 คิว,
-- edge function จำกัดจำนวนครั้งต่อ IP (online_booking_log เก็บแค่ hash ของ IP ไม่เก็บชื่อ/เบอร์)
--
-- ยกเลิก (rollback):
--   drop function public.online_booking_create_v1(text, uuid, uuid, timestamptz, text, text, text, text);
--   drop function public.online_booking_slots_v1(uuid, uuid, date);
--   drop function public.online_booking_catalog_v1(uuid);
--   drop function public.online_booking_branches_v1();
--   drop function public.online_booking_resolve_v1(uuid, uuid);
--   drop table public.online_booking_log, public.online_booking_requests, public.online_booking_config,
--              public.online_booking_promos, public.online_booking_branches;
--   (พนักงาน 0b0c1a55-5e1f-4b00-8000-000000000001 ลบได้เมื่อไม่มีคิวอ้างถึง)

set local lock_timeout = '3s';

create table if not exists public.online_booking_branches (
  branch_id   uuid primary key references public.branches(id) on delete cascade,
  active      boolean not null default true,
  updated_at  timestamptz not null default now()
);

create table if not exists public.online_booking_promos (
  promo_id    uuid primary key references public.promos(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table if not exists public.online_booking_config (
  key    text primary key,
  value  text not null
);

create table if not exists public.online_booking_requests (
  reference_id  text primary key check (reference_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  request_hash  text not null,
  queue_id      uuid references public.queues(id) on delete set null,
  response      jsonb not null,
  created_at    timestamptz not null default now()
);

create table if not exists public.online_booking_log (
  id        bigint generated always as identity primary key,
  at        timestamptz not null default now(),
  ip_hash   text not null,
  endpoint  text not null,
  status    integer not null,
  ms        integer,
  detail    jsonb
);
create index if not exists online_booking_log_rate_idx on public.online_booking_log (ip_hash, endpoint, at desc);
create index if not exists online_booking_log_at_idx on public.online_booking_log (at desc);

alter table public.online_booking_branches enable row level security;
alter table public.online_booking_promos enable row level security;
alter table public.online_booking_config enable row level security;
alter table public.online_booking_requests enable row level security;
alter table public.online_booking_log enable row level security;
revoke all on table public.online_booking_branches, public.online_booking_promos, public.online_booking_config,
  public.online_booking_requests, public.online_booking_log from anon, authenticated;
grant all on table public.online_booking_branches, public.online_booking_promos, public.online_booking_config,
  public.online_booking_requests, public.online_booking_log to service_role;
grant usage, select on sequence public.online_booking_log_id_seq to service_role;

-- พนักงานที่ใช้ลงคิวของลูกค้า: id คงที่ (staff-session กันแก้/ลบจากหน้าจัดการพนักงานด้วย id นี้)
-- PIN ไม่ใช่ตัวเลข 4 หลัก + ปิดใช้งาน = ล็อกอินไม่ได้แน่นอน
insert into public.staff (id, name, nickname, role, pin, active, commission_rate_new, commission_rate_old, commission_rate_course)
values ('0b0c1a55-5e1f-4b00-8000-000000000001', 'จองออนไลน์ (ลูกค้าจองเอง)', 'จองออนไลน์', 'admin', 'online-booking', false, 0, 0, 0)
on conflict (id) do nothing;

insert into public.online_booking_config (key, value)
values ('staff_id', '0b0c1a55-5e1f-4b00-8000-000000000001')
on conflict (key) do nothing;

-- (สาขา, โปร) → บริการ/ราคา/ความยาว — null procedure_id = จองไม่ได้ (ปิด/ไม่ได้เปิดให้จอง/ผิดกลุ่ม Class Go)
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
  -- โปรของ Class Go ใช้ได้เฉพาะสาขา Class Go และกลับกัน (กติกาเดียวกับ booking_api_resolve_v1)
  if (coalesce(v_cat, '') = 'Class Go') <> (v_bname like 'Class Go %') then raise exception 'INVALID_SERVICE'; end if;

  return query select v_active, v_pr.procedure_id, v_pr.id, v_pr.price, v_blocks, btrim(v_pr.name);
end;
$$;

-- สาขาที่เปิดให้ลูกค้าจองเอง
create or replace function public.online_booking_branches_v1()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name) order by b.name), '[]'::jsonb)
    from public.online_booking_branches ob join public.branches b on b.id = ob.branch_id
   where ob.active;
$$;

-- บริการที่จองได้ในสาขานี้: อยู่ในรายการที่ตั้งไว้ เปิดอยู่ ตรงกลุ่ม Class Go และสาขามีเตียงที่รับบริการนี้
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
     and (coalesce(pc.category, '') = 'Class Go') = (b.name like 'Class Go %')
     and exists (select 1 from public.booking_api_candidate_rooms_v1(ob.branch_id, pc.id));
$$;

-- ทุกช่อง 30 นาทีของวัน พร้อมว่าง/ไม่ว่าง (จองได้เมื่อ ≥ now+2 ชม. และไม่เกิน 14 วัน)
create or replace function public.online_booking_slots_v1(p_branch_id uuid, p_promo_id uuid, p_date date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c_min_lead interval := interval '2 hours';
  c_max_days int := 14;
  v_active boolean; v_proc uuid; v_dur int;
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
  v_slots jsonb;
begin
  select r.branch_active, r.procedure_id, r.dur into v_active, v_proc, v_dur
    from public.online_booking_resolve_v1(p_branch_id, p_promo_id) r;
  if p_date is null then raise exception 'INVALID_TIME'; end if;
  if not v_active or p_date < v_today or p_date > v_today + c_max_days then
    return jsonb_build_object('date', p_date, 'slots', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'time', to_char(p_date::timestamp + (s.blk * interval '5 minutes'), 'HH24:MI'),
           'start_time', to_char(p_date::timestamp + (s.blk * interval '5 minutes'), 'YYYY-MM-DD"T"HH24:MI:SS') || '+07:00',
           'available', ((p_date::timestamp + (s.blk * interval '5 minutes')) at time zone 'Asia/Bangkok') >= now() + c_min_lead
                        and exists (select 1 from public.booking_api_free_rooms_v1(p_branch_id, v_proc, p_date, s.blk, v_dur))
         ) order by s.blk), '[]'::jsonb)
    into v_slots
    from public.booking_api_day_range_v1(p_branch_id, v_proc, p_date) rg,
         generate_series(((rg.lo + 5) / 6) * 6, rg.hi - v_dur, 6) as s(blk);

  return jsonb_build_object('date', p_date, 'slots', v_slots);
end;
$$;

-- จองคิว
-- ข้อมูลเข้าผิด: raise INVALID_BRANCH / INVALID_SERVICE / INVALID_TIME / INVALID_CUSTOMER / INVALID_REFERENCE /
--   REFERENCE_ID_REUSED / NOT_CONFIGURED
-- ผลทางธุรกิจ (คืน jsonb): {success:true, booking_ref, date, time, branch, service}
--   หรือ {success:false, error_code} — SLOT_UNAVAILABLE, OUTSIDE_BOOKING_WINDOW, BRANCH_NOT_ACCEPTING, TOO_MANY_BOOKINGS
-- reference_id (หน้าเว็บสุ่มให้ต่อหนึ่งการกดยืนยัน): ส่งซ้ำข้อมูลเดิม = คืนผลเดิม ไม่สร้างคิวซ้ำ (เน็ตหลุดแล้วกดใหม่)
create or replace function public.online_booking_create_v1(
  p_reference_id text, p_branch_id uuid, p_promo_id uuid, p_start timestamptz,
  p_name text, p_phone text, p_customer_type text, p_note text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_min_lead interval := interval '2 hours';
  c_max_days int := 14;
  c_max_upcoming int := 2;
  v_ref text := btrim(coalesce(p_reference_id, ''));
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '[[:cntrl:]]', '', 'g'));
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_note text := left(btrim(regexp_replace(coalesce(p_note, ''), '[[:cntrl:]]', ' ', 'g')), 300);
  v_type text := lower(btrim(coalesce(p_customer_type, '')));
  v_local timestamp := p_start at time zone 'Asia/Bangkok';
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
  v_hash text;
  v_existing public.online_booking_requests;
  v_staff uuid;
  v_active boolean; v_proc uuid; v_promo uuid; v_price numeric; v_dur int; v_promo_name text;
  v_branch_name text;
  v_date date; v_block int;
  v_room uuid := null;
  v_cand uuid;
  v_status text;
  v_queue_id uuid;
  v_request uuid;
  v_upcoming int;
  v_resp jsonb;
begin
  if v_ref !~ '^[A-Za-z0-9_-]{8,64}$' then raise exception 'INVALID_REFERENCE'; end if;
  if length(v_name) < 2 or length(v_name) > 100 or v_type not in ('new', 'old') then raise exception 'INVALID_CUSTOMER'; end if;
  if v_digits ~ '^66[0-9]{9}$' then v_digits := '0' || substr(v_digits, 3); end if;
  -- มือถือไทยเท่านั้น (06/08/09 + 8 หลัก) — ไม่รับเบอร์ที่ 8 หลักท้ายเป็นเลขเดียวกันหมด เช่น 0899999999 / 0811111111
  if v_digits !~ '^0[689][0-9]{8}$' or substr(v_digits, 3) ~ '^(.)\1+$' then raise exception 'INVALID_CUSTOMER'; end if;
  if p_start is null or extract(second from v_local) <> 0 or mod(extract(minute from v_local)::int, 5) <> 0 then
    raise exception 'INVALID_TIME';
  end if;

  v_hash := md5(concat_ws('|', p_branch_id::text, p_promo_id::text, extract(epoch from p_start)::text, v_name, v_digits, v_type, v_note));

  -- ซีเรียไลซ์คำขอที่ถือ reference_id เดียวกัน
  perform pg_advisory_xact_lock(hashtextextended('online-booking-ref:' || v_ref, 0));
  select * into v_existing from public.online_booking_requests where reference_id = v_ref;
  if found then
    if v_existing.request_hash = v_hash then return v_existing.response; end if;
    raise exception 'REFERENCE_ID_REUSED';
  end if;

  select r.branch_active, r.procedure_id, r.promo_id, r.price, r.dur, r.promo_name
    into v_active, v_proc, v_promo, v_price, v_dur, v_promo_name
    from public.online_booking_resolve_v1(p_branch_id, p_promo_id) r;
  select b.name into v_branch_name from public.branches b where b.id = p_branch_id;

  if not v_active then return jsonb_build_object('success', false, 'error_code', 'BRANCH_NOT_ACCEPTING'); end if;
  v_date := v_local::date;
  v_block := (extract(hour from v_local)::int * 60 + extract(minute from v_local)::int) / 5;
  if p_start < now() + c_min_lead or v_date > v_today + c_max_days then
    return jsonb_build_object('success', false, 'error_code', 'OUTSIDE_BOOKING_WINDOW');
  end if;

  select nullif(value, '')::uuid into v_staff from public.online_booking_config where key = 'staff_id';
  if v_staff is null or not exists (select 1 from public.staff s where s.id = v_staff) then raise exception 'NOT_CONFIGURED'; end if;

  -- เบอร์เดียวจองค้างได้ไม่เกิน c_max_upcoming คิว (นับเฉพาะคิวที่ลูกค้าจองเอง ยังไม่ถึงวัน/วันนี้ และยังไม่ปิด)
  perform pg_advisory_xact_lock(hashtextextended('online-booking-phone:' || v_digits, 0));
  select count(*) into v_upcoming
    from public.queues q
   where q.recorded_by = v_staff and q.phone = v_digits and q.date >= v_today
     and q.archived_at is null
     and coalesce(q.status, 'pending') not in ('cancelled', 'no_show', 'rescheduled', 'done');
  if v_upcoming >= c_max_upcoming then
    return jsonb_build_object('success', false, 'error_code', 'TOO_MANY_BOOKINGS');
  end if;

  -- เลือกเตียงแรกที่ว่าง: ล็อกห้อง-วันด้วยกุญแจเดียวกับ create_queue_v1 แล้วตรวจซ้ำ
  for v_cand in select c.room_id from public.booking_api_candidate_rooms_v1(p_branch_id, v_proc) c
  loop
    perform pg_advisory_xact_lock(hashtextextended('queue-room-day:' || v_cand::text || ':' || v_date::text, 0));
    if public.booking_api_room_status_v1(v_cand, v_date, v_block, v_dur) = 'ok' then
      v_room := v_cand;
      exit;
    end if;
  end loop;
  if v_room is null then
    return jsonb_build_object('success', false, 'error_code', 'SLOT_UNAVAILABLE');
  end if;

  v_status := case when v_date = v_today then 'confirmed' else 'pending' end;
  v_request := md5('online-booking:' || v_ref)::uuid;

  insert into public.queues (
    name, phone, branch_id, procedure_id, promo_id, price, note, customer_type,
    date, time_block, duration_blocks, room_id, status, status_note, recorded_by,
    request_id, effective_duration_blocks, effective_price, effective_commission_rate, area_names
  ) values (
    v_name, v_digits, p_branch_id, v_proc, v_promo, v_price,
    '[จองออนไลน์]' || case when v_note <> '' then ' ' || v_note else '' end, v_type,
    v_date, v_block, v_dur, v_room, v_status, '', v_staff,
    v_request, v_dur, v_price, 0, null
  ) returning id into v_queue_id;

  insert into public.queue_audit (queue_id, operation, actor_session_id, actor_staff_id, release_id, request_id, changed_fields)
  values (v_queue_id, 'create', null, v_staff, 'online_booking', v_request,
          array['branch_id', 'procedure_id', 'promo_id', 'price', 'customer_type', 'date', 'time_block', 'duration_blocks', 'room_id', 'status', 'area_names']);

  v_resp := jsonb_build_object('success', true,
    'booking_ref', upper(left(replace(v_queue_id::text, '-', ''), 8)),
    'date', v_date, 'time', to_char(v_local, 'HH24:MI'),
    'branch', v_branch_name, 'service', v_promo_name);
  insert into public.online_booking_requests (reference_id, request_hash, queue_id, response)
  values (v_ref, v_hash, v_queue_id, v_resp);
  return v_resp;
end;
$$;

revoke all on function
  public.online_booking_resolve_v1(uuid, uuid),
  public.online_booking_branches_v1(),
  public.online_booking_catalog_v1(uuid),
  public.online_booking_slots_v1(uuid, uuid, date),
  public.online_booking_create_v1(text, uuid, uuid, timestamptz, text, text, text, text)
  from public, anon, authenticated;
grant execute on function
  public.online_booking_resolve_v1(uuid, uuid),
  public.online_booking_branches_v1(),
  public.online_booking_catalog_v1(uuid),
  public.online_booking_slots_v1(uuid, uuid, date),
  public.online_booking_create_v1(text, uuid, uuid, timestamptz, text, text, text, text)
  to service_role;
