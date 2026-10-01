-- Booking API สำหรับบอท Saifa AI: เช็กคิวว่าง + จองคิวลง Qlass
--
-- ไม่แตะตาราง/ฟังก์ชันที่ใช้งานอยู่ (queues, create_queue_v1, room_schedules ฯลฯ) — เพิ่มอย่างเดียว
-- ทุกอย่างเรียกผ่าน edge function `booking-api` ด้วย service_role เท่านั้น
-- (RLS เปิด ไม่มี policy ถอนสิทธิ์จากคีย์หน้าเว็บ ฟังก์ชันถอนสิทธิ์จาก public/anon/authenticated)
--
-- กติกา "ห้องว่าง" ใช้ชุดเดียวกับ create_queue_v1 (ห้องประเภทตรงกับบริการ, room_procedures, เวลาเปิดห้อง,
-- room_schedules เปิด/ปิดพิเศษ, ไม่ชนคิวอื่น) และล็อกห้อง-วันด้วยกุญแจเดียวกัน ('queue-room-day:<ห้อง>:<วัน>')
-- ลง queues เป็นพนักงานบอท (role admin, booking_api_config.bot_staff_id) เหมือนแอดมินลงคิว:
-- วันนัด = วันนี้ → 'confirmed', วันอื่น → 'pending' (กติกาเดียวกับหน้าลงคิวและ create_queue_v1)
--
-- ยกเลิก (rollback):
--   drop function public.booking_api_create_v1(text, text, text, timestamptz, text, text, text, text, boolean);
--   drop function public.booking_api_slots_v1(text, text, date);
--   drop function public.booking_api_check_v1(text, text, timestamptz);
--   drop function public.booking_api_evaluate_v1(text, text, timestamptz);
--   drop function public.booking_api_resolve_v1(text, text);
--   drop function public.booking_api_branches_v1();
--   drop function public.booking_api_catalog_v1();
--   drop function public.booking_api_free_rooms_v1(uuid, uuid, date, int, int);
--   drop function public.booking_api_day_range_v1(uuid, uuid, date);
--   drop function public.booking_api_room_status_v1(uuid, date, int, int);
--   drop function public.booking_api_candidate_rooms_v1(uuid, uuid);
--   drop table public.booking_api_log, public.booking_api_requests, public.booking_api_counters,
--              public.booking_api_config, public.booking_api_sku_overrides, public.booking_api_skus, public.booking_api_branches;

set local lock_timeout = '3s';

create table if not exists public.booking_api_branches (
  code        text primary key check (code ~ '^[A-Z]{2,6}$'),
  branch_id   uuid not null unique references public.branches(id) on delete cascade,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- SKU ของ Saifa → บริการ/โปรใน Qlass: สาขา Class Go ใช้ชุดบริการ "Go-*" แยก จึงมีคอลัมน์ go_* สำหรับสาขา Class Go
-- ไม่มีค่า = บริการนี้ไม่มีที่สาขากลุ่มนั้น (SERVICE_NOT_AT_BRANCH)
create table if not exists public.booking_api_skus (
  sku              text primary key check (sku ~ '^[A-Z0-9][A-Z0-9-]{1,59}$'),
  procedure_id     uuid references public.procedures(id) on delete cascade,
  promo_id         uuid references public.promos(id) on delete set null,
  go_procedure_id  uuid references public.procedures(id) on delete cascade,
  go_promo_id      uuid references public.promos(id) on delete set null,
  price            numeric(10,2) check (price is null or price >= 0),
  duration_blocks  integer check (duration_blocks is null or duration_blocks between 1 and 96),
  active           boolean not null default true,
  note             text,
  created_at       timestamptz not null default now(),
  check (procedure_id is not null or go_procedure_id is not null)
);

create table if not exists public.booking_api_config (
  key    text primary key,
  value  text not null
);

-- SKU อัตโนมัติจากโปรใน Qlass: ทุกโปรที่เปิดอยู่และราคา > 0 เป็น SKU `PM-` + รหัสโปร 10 ตัวแรก (คงที่ตลอด ไม่ต้องจับคู่มือ)
-- โปรใหม่ที่เพิ่มในหน้าจัดการโปรจะขึ้นในแคตตาล็อกเองทันที; ตารางนี้ใช้ "ยกเว้น/เปิดเฉพาะราย" เท่านั้น:
--   enabled = false → ซ่อนโปรนี้จากบอท (ทั้งที่ราคา > 0) · enabled = true → เปิดให้บอทจองแม้ราคา 0 (เช่น โปรปรึกษาฟรี)
create table if not exists public.booking_api_sku_overrides (
  sku         text primary key check (sku ~ '^PM-[0-9A-F]{10}$'),
  enabled     boolean not null,
  note        text,
  created_at  timestamptz not null default now()
);

create table if not exists public.booking_api_counters (
  day      date primary key,
  last_no  integer not null default 0
);

create table if not exists public.booking_api_requests (
  reference_id  text primary key check (reference_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  request_hash  text not null,
  queue_id      uuid references public.queues(id) on delete set null,
  booking_id    text not null unique,
  response      jsonb not null,
  created_at    timestamptz not null default now()
);

create table if not exists public.booking_api_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  endpoint    text not null,
  key_kind    text not null,
  status      integer not null,
  ms          integer,
  branch_code text,
  sku         text,
  detail      jsonb
);
create index if not exists booking_api_log_at_idx on public.booking_api_log (at desc);
create index if not exists booking_api_log_rate_idx on public.booking_api_log (key_kind, endpoint, at desc);

alter table public.booking_api_branches enable row level security;
alter table public.booking_api_skus enable row level security;
alter table public.booking_api_config enable row level security;
alter table public.booking_api_sku_overrides enable row level security;
alter table public.booking_api_counters enable row level security;
alter table public.booking_api_requests enable row level security;
alter table public.booking_api_log enable row level security;
revoke all on table public.booking_api_branches, public.booking_api_skus, public.booking_api_config, public.booking_api_sku_overrides,
  public.booking_api_counters, public.booking_api_requests, public.booking_api_log from anon, authenticated;
grant all on table public.booking_api_branches, public.booking_api_skus, public.booking_api_config, public.booking_api_sku_overrides,
  public.booking_api_counters, public.booking_api_requests, public.booking_api_log to service_role;
grant usage, select on sequence public.booking_api_log_id_seq to service_role;

-- รหัสสาขาของคลินิก (2 ตัวอักษร) → สาขาใน Qlass จับคู่ด้วยชื่อ (สำนักงานใหญ่ HK ไม่รับคิว จึงไม่มีแถว)
-- ชื่อที่หาไม่เจอจะถูกข้ามเงียบ ๆ (ไม่ทำให้ migration ล้ม) ตรวจจำนวนหลังลงให้ได้ 31
insert into public.booking_api_branches (code, branch_id)
select v.code, b.id
  from (values
    ('SK','Class ศรีสะเกษ'), ('AC','Class อมตะ'), ('SR','Class สุรินทร์'), ('CC','Class ฉะเชิงเทรา'),
    ('NP','Class นครพนม'), ('RY','Class ระยอง'), ('SP','Class สหพัฒน์'), ('SN','Class สกลนคร'),
    ('KS','Class กาฬสินธุ์'), ('NK','Class หนองคาย'), ('KK','Class Go กังสดาล'), ('KH','Class หอกาญ'),
    ('UD','Class อุดร'), ('NM','Class โคราช'), ('UB','Class อุบล'), ('MK','Class สารคาม'),
    ('BU','Class บุรีรัมย์'), ('BS','Class บางแสน'), ('CP','Class ชัยภูมิ'), ('RI','Class ร้อยเอ็ด'),
    ('CR','Class เชียงราย'), ('BW','Class บ่อวิน'), ('LB','Class ลาดกระบัง'), ('KC','Class Go ชุมแพ'),
    ('BN','Class Go บางนา'), ('FR','Class ฟิวเจอร์พาร์ครังสิต'), ('UM','Class ยูเนี่ยนมอลล์ลาดพร้าว'),
    ('CT','Class จันทบุรี'), ('LE','Class เลย'), ('MD','Class มุกดาหาร'), ('YS','Class ยโสธร')
  ) as v(code, name)
  join public.branches b on b.name = v.name
on conflict do nothing;

-- SKU สำหรับทดสอบ (TEST-*): ผูกกับบริการจริงเพื่อให้ Saifa ลองเช็กคิว/ลองจองใน sandbox ได้ทันทีโดยไม่ต้องรอตารางจับคู่ SKU จริง
-- ใช้ได้เฉพาะ dry-run (คีย์ sandbox) — การจองจริงด้วย TEST-* ถูกปฏิเสธเป็น INVALID_SKU (ดู booking_api_create_v1)
-- ชื่อบริการที่หาไม่เจอจะถูกข้ามเงียบ ๆ (ไม่ใช้โปร/ราคา: เป็นแค่ตัวทดสอบเวลา/ห้อง) สาขา Class Go ใช้ชุดบริการ Go-*
insert into public.booking_api_skus (sku, procedure_id, go_procedure_id, note)
select v.sku, p.id, g.id, 'ตัวทดสอบ (sandbox เท่านั้น)'
  from (values
    ('TEST-HIFU', 'Hifu', 'Go-Hifu'), ('TEST-BOTOX', 'Botox', 'Go-Botox'), ('TEST-FILLER', 'Filler', 'Go-Filler'),
    ('TEST-DIODE', 'Diode', 'Go-Diode'), ('TEST-DRIP', 'วิตามินผิว', 'Go-ดริปผิว'), ('TEST-PEN', 'ปากกาลดน้ำหนัก', 'Go-ปากกา'),
    ('TEST-MESO', 'Meso', null), ('TEST-CONSULT', 'ปรึกษาทั่วไป', null)
  ) as v(sku, proc_name, go_name)
  join public.procedures p on p.name = v.proc_name
  left join public.procedures g on g.name = v.go_name
on conflict do nothing;

-- พนักงานบอท (role admin): จับคู่ด้วยชื่อที่สร้างไว้ในหน้าจัดการพนักงาน ("Ai Saifa") ไม่พบ = ไม่ตั้งค่า (จองไม่ได้ ตอบ INTERNAL_ERROR)
insert into public.booking_api_config (key, value)
select 'bot_staff_id', s.id::text from public.staff s where s.name = 'Ai Saifa' and s.role = 'admin' order by s.created_at limit 1
on conflict (key) do nothing;

-- ห้องที่เข้าเงื่อนไขของ (สาขา, บริการ): ประเภทห้องตรงกับบริการ และถ้าห้องมีรายการใน room_procedures ต้องมีบริการนี้
-- (ห้องที่ยังไม่ตั้งค่า = ผ่าน ตามกติกาเดิมของ create_queue_v1) เรียงตาม sort_order
create or replace function public.booking_api_candidate_rooms_v1(p_branch_id uuid, p_procedure_id uuid)
returns table (room_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select r.id
    from public.rooms r
    join public.procedures p on p.id = p_procedure_id
   where r.branch_id = p_branch_id
     and r.type = p.room_type
     and (not exists (select 1 from public.room_procedures rp where rp.room_id = r.id)
          or exists (select 1 from public.room_procedures rp where rp.room_id = r.id and rp.procedure_id = p_procedure_id))
   order by coalesce(r.sort_order, 0), r.name, r.id;
$$;

-- สถานะของห้องในช่วงเวลา: 'ok' | 'invalid_time' | 'room_closed' | 'room_conflict'
-- กติกาเหมือน create_queue_v1 ทุกข้อ: เริ่มไม่ก่อนบล็อก 96 จบไม่เกิน 288; วันปิดทั้งวัน/ช่วงปิดใน room_schedules;
-- ทุกบล็อกต้องอยู่ในเวลาเปิดห้องหรือช่วงเปิดพิเศษ; ไม่ชนคิวอื่น (ไม่นับ cancelled / no_show / rescheduled)
create or replace function public.booking_api_room_status_v1(p_room_id uuid, p_date date, p_start int, p_dur int)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r public.rooms;
  v_bad int;
begin
  if p_start is null or p_dur is null or p_dur < 1 or p_start < 96 or p_start + p_dur > 288 then return 'invalid_time'; end if;
  select * into r from public.rooms where id = p_room_id;
  if not found then return 'room_closed'; end if;

  if exists (
    select 1 from public.room_schedules s
     where s.room_id = p_room_id and (s.date = p_date or s.date is null)
       and s.available = false and s.start_block is null and s.end_block is null
  ) then return 'room_closed'; end if;

  select count(*) into v_bad
    from generate_series(p_start, p_start + p_dur - 1) as b
   where not (
           (b >= r.open_block and b < r.close_block)
           or exists (
             select 1 from public.room_schedules s
              where s.room_id = p_room_id and (s.date = p_date or s.date is null)
                and s.available = true and s.start_block is not null and s.end_block is not null
                and b >= s.start_block and b < s.end_block))
      or exists (
           select 1 from public.room_schedules s
            where s.room_id = p_room_id and (s.date = p_date or s.date is null)
              and s.available = false and s.start_block is not null and s.end_block is not null
              and b >= s.start_block and b < s.end_block);
  if v_bad > 0 then return 'room_closed'; end if;

  if exists (
    select 1
      from public.queues q
      left join public.procedures qp on qp.id = q.procedure_id
     where q.room_id = p_room_id
       and q.date = p_date
       and q.time_block is not null
       and q.status not in ('cancelled', 'no_show', 'rescheduled')
       and p_start < q.time_block + coalesce(q.duration_blocks, qp.blocks, 1)
       and q.time_block < p_start + p_dur
  ) then return 'room_conflict'; end if;

  return 'ok';
end;
$$;

-- ห้องว่างทั้งหมดของ (สาขา, บริการ) ในช่วงเวลา เรียงตามลำดับห้อง (การจองเลือกห้องแรก)
create or replace function public.booking_api_free_rooms_v1(p_branch_id uuid, p_procedure_id uuid, p_date date, p_start int, p_dur int)
returns table (room_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select c.room_id
    from public.booking_api_candidate_rooms_v1(p_branch_id, p_procedure_id) with ordinality as c(room_id, ord)
   where public.booking_api_room_status_v1(c.room_id, p_date, p_start, p_dur) = 'ok'
   order by c.ord;
$$;

-- ช่วงเวลา (บล็อต) ที่ห้องของบริการนี้เปิดในวันนั้น รวมช่วงเปิดพิเศษใน room_schedules — ใช้กำหนดขอบเขตตารางเวลาที่เสนอ
create or replace function public.booking_api_day_range_v1(p_branch_id uuid, p_procedure_id uuid, p_date date)
returns table (lo int, hi int)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(min(x.lo), 96), coalesce(max(x.hi), 288)
    from (
      select r.open_block as lo, r.close_block as hi
        from public.rooms r
        join public.booking_api_candidate_rooms_v1(p_branch_id, p_procedure_id) c on c.room_id = r.id
      union all
      select s.start_block, s.end_block
        from public.room_schedules s
        join public.booking_api_candidate_rooms_v1(p_branch_id, p_procedure_id) c on c.room_id = s.room_id
       where (s.date = p_date or s.date is null) and s.available = true
         and s.start_block is not null and s.end_block is not null
    ) x;
$$;

-- รายการสาขาที่เปิดให้เรียกได้ (GET /v1/branches)
create or replace function public.booking_api_branches_v1()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('code', x.code, 'name', x.name, 'active', x.active) order by x.code), '[]'::jsonb)
    from (select ba.code, b.name, ba.active
            from public.booking_api_branches ba join public.branches b on b.id = ba.branch_id) x;
$$;

-- แปลง (รหัสสาขา, SKU) เป็นสาขา/บริการ/โปร/ราคา/ความยาวคิว
-- SKU มี 2 แบบ: (1) `PM-xxxxxxxxxx` อัตโนมัติจากโปร (ราคา > 0 หรือเปิดเฉพาะราย) (2) แถวใน booking_api_skus (ตัวทดสอบ/ชื่อพิเศษ)
-- ขอบเขตสาขา: โปร/บริการของ Class Go (category = 'Class Go') ใช้ได้เฉพาะสาขา Class Go และกลับกัน — ผิดกลุ่ม = procedure_id เป็น null
-- raise INVALID_BRANCH / INVALID_SKU; procedure_id เป็น null = บริการนี้ไม่มีที่สาขานั้น (SERVICE_NOT_AT_BRANCH)
create or replace function public.booking_api_resolve_v1(p_branch_code text, p_sku text)
returns table (branch_id uuid, branch_active boolean, procedure_id uuid, promo_id uuid, price numeric, dur int)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ba public.booking_api_branches;
  v_bname text;
  v_is_go_branch boolean;
  v_code text := upper(btrim(coalesce(p_sku, '')));
  v_sku public.booking_api_skus;
  v_proc uuid;
  v_promo uuid;
  v_blocks int;
  v_promo_price numeric;
  v_n int;
  v_pr public.promos;
  v_override boolean;
  v_cat text;
begin
  select * into v_ba from public.booking_api_branches where code = upper(btrim(coalesce(p_branch_code, '')));
  if not found then raise exception 'INVALID_BRANCH'; end if;
  select b.name into v_bname from public.branches b where b.id = v_ba.branch_id;
  v_is_go_branch := v_bname like 'Class Go %';

  if v_code ~ '^PM-[0-9A-F]{10}$' then
    select count(*) into v_n from public.promos x where upper(left(replace(x.id::text, '-', ''), 10)) = substr(v_code, 4) and x.active;
    if v_n <> 1 then raise exception 'INVALID_SKU'; end if;
    select * into v_pr from public.promos x where upper(left(replace(x.id::text, '-', ''), 10)) = substr(v_code, 4) and x.active;
    select o.enabled into v_override from public.booking_api_sku_overrides o where o.sku = v_code;
    if not coalesce(v_override, coalesce(v_pr.price, 0) > 0) then raise exception 'INVALID_SKU'; end if;
    select p.category, p.blocks into v_cat, v_blocks from public.procedures p where p.id = v_pr.procedure_id;
    if not found then raise exception 'INVALID_SKU'; end if;
    if (coalesce(v_cat, '') = 'Class Go') = v_is_go_branch then
      v_proc := v_pr.procedure_id; v_promo := v_pr.id; v_promo_price := v_pr.price;
    else
      v_proc := null; v_promo := null; v_promo_price := null;
    end if;
    return query select v_ba.branch_id, v_ba.active, v_proc, v_promo, v_promo_price, v_blocks;
    return;
  end if;

  select * into v_sku from public.booking_api_skus where sku = v_code and active;
  if not found then raise exception 'INVALID_SKU'; end if;

  if v_is_go_branch then
    v_proc := v_sku.go_procedure_id; v_promo := v_sku.go_promo_id;
  else
    v_proc := v_sku.procedure_id; v_promo := v_sku.promo_id;
  end if;

  if v_proc is not null then
    select p.blocks into v_blocks from public.procedures p where p.id = v_proc;
    if not found then v_proc := null; end if;
  end if;
  if v_promo is not null then
    select pr.price into v_promo_price from public.promos pr
     where pr.id = v_promo and pr.active = true and pr.procedure_id is not distinct from v_proc;
    if not found then v_promo := null; v_promo_price := null; end if;
  end if;

  return query select v_ba.branch_id, v_ba.active, v_proc, v_promo,
                      coalesce(v_sku.price, v_promo_price), coalesce(v_sku.duration_blocks, v_blocks);
end;
$$;

-- แคตตาล็อก SKU ที่เปิดให้บอทจอง (GET /v1/catalog): โปรที่เปิดอยู่ ราคา > 0 (หรือเปิดเฉพาะราย) ซ่อนเฉพาะรายตาม overrides
-- โปรใหม่ที่เพิ่มใน Qlass ขึ้นที่นี่เองทันที; scope = class_go (ใช้ได้เฉพาะสาขา Class Go) | standard (สาขาอื่น)
create or replace function public.booking_api_catalog_v1()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with p as (
    select pr.id, pr.name, pr.price, pr.procedure_id, 'PM-' || upper(left(replace(pr.id::text, '-', ''), 10)) as sku
      from public.promos pr
     where pr.active
  ),
  uniq as (
    -- รหัสสั้นซ้ำกับโปรอื่นที่เปิดอยู่ (โอกาสน้อยมาก) = กำกวม ไม่ออกรหัส (ฟังก์ชันจองก็ปฏิเสธรหัสแบบนี้)
    select sku from p group by sku having count(*) = 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'sku', p.sku, 'name', btrim(p.name), 'price', p.price, 'service', pc.name, 'category', coalesce(pc.category, ''),
           'duration_minutes', pc.blocks * 5, 'scope', case when pc.category = 'Class Go' then 'class_go' else 'standard' end)
           order by coalesce(pc.category, ''), pc.name, p.price, btrim(p.name), p.sku), '[]'::jsonb)
    from p
    join uniq u on u.sku = p.sku
    join public.procedures pc on pc.id = p.procedure_id
    left join public.booking_api_sku_overrides o on o.sku = p.sku
   where coalesce(pc.blocks, 0) > 0
     and coalesce(o.enabled, coalesce(p.price, 0) > 0);
$$;

-- ประเมินคำขอ (ใช้ร่วมกันทั้งเช็กคิวและจองคิว): คืน available/reason/alternatives + ข้อมูลภายในที่การจองต้องใช้
-- raise INVALID_BRANCH / INVALID_SKU / INVALID_TIME
-- reason ∈ SLOT_FULL, OUTSIDE_HOURS, SERVICE_NOT_AT_BRANCH, OUTSIDE_BOOKING_WINDOW (ก่อนนัดน้อยกว่า 2 ชม. หรือไกลเกิน 60 วัน),
--   PAST_TIME, BRANCH_NOT_ACCEPTING
-- alternatives = เวลาว่างใกล้สุดในวันเดียวกัน (ตาราง 30 นาที, ไม่ก่อน now+2 ชม.) สูงสุด 3 ช่วง เรียงเวลา
create or replace function public.booking_api_evaluate_v1(p_branch_code text, p_sku text, p_start timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c_min_lead interval := interval '2 hours';
  c_max_days int := 60;
  v_branch_id uuid; v_active boolean; v_proc uuid; v_promo uuid; v_price numeric; v_dur int;
  v_local timestamp := p_start at time zone 'Asia/Bangkok';
  v_date date;
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
  v_start int;
  v_free int;
  v_conflict_rooms int;
  v_alts jsonb := '[]'::jsonb;
  v_reason text;
  v_base jsonb;
begin
  select r.branch_id, r.branch_active, r.procedure_id, r.promo_id, r.price, r.dur
    into v_branch_id, v_active, v_proc, v_promo, v_price, v_dur
    from public.booking_api_resolve_v1(p_branch_code, p_sku) r;

  if p_start is null or extract(second from v_local) <> 0 or mod(extract(minute from v_local)::int, 5) <> 0 then
    raise exception 'INVALID_TIME';
  end if;
  v_date := v_local::date;
  v_start := (extract(hour from v_local)::int * 60 + extract(minute from v_local)::int) / 5;
  v_base := jsonb_build_object('branch_id', v_branch_id, 'procedure_id', v_proc, 'promo_id', v_promo, 'price', v_price,
                               'dur', v_dur, 'date', v_date, 'block', v_start);

  if not v_active then return v_base || jsonb_build_object('available', false, 'reason', 'BRANCH_NOT_ACCEPTING', 'alternatives', '[]'::jsonb); end if;
  if p_start < now() then return v_base || jsonb_build_object('available', false, 'reason', 'PAST_TIME', 'alternatives', '[]'::jsonb); end if;
  if p_start < now() + c_min_lead or v_date > v_today + c_max_days then
    return v_base || jsonb_build_object('available', false, 'reason', 'OUTSIDE_BOOKING_WINDOW', 'alternatives', '[]'::jsonb);
  end if;
  if v_proc is null or coalesce(v_dur, 0) < 1
     or not exists (select 1 from public.booking_api_candidate_rooms_v1(v_branch_id, v_proc)) then
    return v_base || jsonb_build_object('available', false, 'reason', 'SERVICE_NOT_AT_BRANCH', 'alternatives', '[]'::jsonb);
  end if;

  select count(*) into v_free from public.booking_api_free_rooms_v1(v_branch_id, v_proc, v_date, v_start, v_dur);
  if v_free > 0 then
    return v_base || jsonb_build_object('available', true, 'alternatives', '[]'::jsonb);
  end if;

  -- ไม่ว่าง: ถ้ามีห้องที่เปิดตรงช่วงนั้นแต่ถูกคิวชน = เต็ม, ถ้าไม่มีห้องไหนเปิดเลย = นอกเวลา
  select count(*) into v_conflict_rooms
    from public.booking_api_candidate_rooms_v1(v_branch_id, v_proc) c
   where public.booking_api_room_status_v1(c.room_id, v_date, v_start, v_dur) = 'room_conflict';
  v_reason := case when v_conflict_rooms > 0 then 'SLOT_FULL' else 'OUTSIDE_HOURS' end;

  select coalesce(jsonb_agg(to_char(a.t, 'YYYY-MM-DD"T"HH24:MI:SS') || '+07:00' order by a.t), '[]'::jsonb) into v_alts
    from (
      select g.t from (
        select (v_date::timestamp + (s.blk * interval '5 minutes')) as t, s.blk
          from public.booking_api_day_range_v1(v_branch_id, v_proc, v_date) rg,
               generate_series(((rg.lo + 5) / 6) * 6, rg.hi - v_dur, 6) as s(blk)
         where ((v_date::timestamp + (s.blk * interval '5 minutes')) at time zone 'Asia/Bangkok') >= now() + c_min_lead
           and s.blk <> v_start
      ) g
      where exists (select 1 from public.booking_api_free_rooms_v1(v_branch_id, v_proc, v_date, g.blk, v_dur))
      order by abs(g.blk - v_start), g.blk
      limit 3
    ) a;

  return v_base || jsonb_build_object('available', false, 'reason', v_reason, 'alternatives', v_alts);
end;
$$;

-- เช็กคิวว่าง (POST /v1/availability/check) — คืนเฉพาะฟิลด์สาธารณะ
create or replace function public.booking_api_check_v1(p_branch_code text, p_sku text, p_start timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when (e->>'available')::boolean
              then jsonb_build_object('available', true)
              else jsonb_build_object('available', false, 'reason', e->>'reason', 'alternatives', e->'alternatives') end
    from (select public.booking_api_evaluate_v1(p_branch_code, p_sku, p_start) as e) x;
$$;

-- ทุกช่อง 30 นาทีของวัน พร้อมว่าง/ไม่ว่าง (GET /v1/availability/slots)
create or replace function public.booking_api_slots_v1(p_branch_code text, p_sku text, p_date date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c_min_lead interval := interval '2 hours';
  c_max_days int := 60;
  v_branch_id uuid; v_active boolean; v_proc uuid; v_dur int;
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
  v_slots jsonb;
begin
  select r.branch_id, r.branch_active, r.procedure_id, r.dur
    into v_branch_id, v_active, v_proc, v_dur
    from public.booking_api_resolve_v1(p_branch_code, p_sku) r;
  if p_date is null then raise exception 'INVALID_TIME'; end if;
  if v_proc is null or coalesce(v_dur, 0) < 1 then
    return jsonb_build_object('date', p_date, 'slots', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'start_time', to_char(p_date::timestamp + (s.blk * interval '5 minutes'), 'YYYY-MM-DD"T"HH24:MI:SS') || '+07:00',
           'available', v_active
                        and ((p_date::timestamp + (s.blk * interval '5 minutes')) at time zone 'Asia/Bangkok') >= now() + c_min_lead
                        and p_date <= v_today + c_max_days
                        and exists (select 1 from public.booking_api_free_rooms_v1(v_branch_id, v_proc, p_date, s.blk, v_dur))
         ) order by s.blk), '[]'::jsonb)
    into v_slots
    from public.booking_api_day_range_v1(v_branch_id, v_proc, p_date) rg,
         generate_series(((rg.lo + 5) / 6) * 6, rg.hi - v_dur, 6) as s(blk);

  return jsonb_build_object('date', p_date, 'slots', v_slots);
end;
$$;

-- จองคิว (POST /v1/bookings)
-- ข้อมูลเข้าผิด: raise INVALID_BRANCH / INVALID_SKU / INVALID_TIME / INVALID_CUSTOMER / INVALID_REFERENCE / REFERENCE_ID_REUSED / BOT_NOT_CONFIGURED
-- ผลทางธุรกิจ (คืน jsonb): {success:true, booking_id, status:'confirmed', branch_code, sku, start_time}
--   หรือ {success:false, http, error_code, alternatives?} (SLOT_UNAVAILABLE 409; OUTSIDE_BOOKING_WINDOW/PAST_TIME/... 422)
-- p_dry_run = true (คีย์ sandbox): ตรวจทุกอย่างเหมือนจริงแต่ไม่เขียนอะไรเลย คืน booking_id 'SANDBOX-…'
-- reference_id เดิม + ข้อมูลเดิม = คืนผลเดิม (ไม่สร้างซ้ำ); reference_id เดิมแต่ข้อมูลต่าง = REFERENCE_ID_REUSED
-- สถานะที่ลงใน queues เหมือนแอดมิน: วันนัดคือวันนี้ → 'confirmed' ไม่งั้น 'pending'; ตอบ Saifa เป็น 'confirmed' เสมอ (จองห้องไว้แล้ว)
create or replace function public.booking_api_create_v1(
  p_reference_id text, p_branch_code text, p_sku text, p_start timestamptz,
  p_name text, p_phone text, p_customer_type text, p_note text, p_dry_run boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref text := btrim(coalesce(p_reference_id, ''));
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '[[:cntrl:]]', '', 'g'));
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_phone text;
  v_note text := left(btrim(regexp_replace(coalesce(p_note, ''), '[[:cntrl:]]', ' ', 'g')), 500);
  v_type text := lower(btrim(coalesce(p_customer_type, '')));
  v_code text := upper(btrim(coalesce(p_branch_code, '')));
  v_skucode text := upper(btrim(coalesce(p_sku, '')));
  v_hash text;
  v_existing public.booking_api_requests;
  ev jsonb;
  v_bot uuid;
  v_bot_staff public.staff;
  v_branch_id uuid; v_proc uuid; v_promo uuid; v_price numeric; v_dur int; v_date date; v_block int;
  v_room uuid := null;
  v_cand uuid;
  v_status text;
  v_rate numeric;
  v_queue_id uuid;
  v_no int;
  v_booking_id text;
  v_local timestamp := p_start at time zone 'Asia/Bangkok';
  v_start_text text;
  v_resp jsonb;
  v_reason text;
begin
  if v_ref !~ '^[A-Za-z0-9_-]{1,64}$' then raise exception 'INVALID_REFERENCE'; end if;
  -- SKU ทดสอบ (TEST-*) ใช้ได้เฉพาะ dry-run/sandbox ห้ามสร้างคิวจริง
  if v_skucode like 'TEST-%' and not coalesce(p_dry_run, false) then raise exception 'INVALID_SKU'; end if;
  if length(v_name) < 1 or length(v_name) > 100 or v_type not in ('new', 'old') then raise exception 'INVALID_CUSTOMER'; end if;
  if v_digits ~ '^66[0-9]{9}$' then v_digits := '0' || substr(v_digits, 3); end if;
  -- เบอร์ไทย: มือถือ 06/08/09 + 8 หลัก (รวม 10) หรือเบอร์บ้าน 02-07 + 7 หลัก (รวม 9)
  if v_digits !~ '^(0[689][0-9]{8}|0[2-7][0-9]{7})$' then raise exception 'INVALID_CUSTOMER'; end if;
  v_phone := v_digits;

  v_hash := md5(concat_ws('|', v_code, v_skucode, coalesce(extract(epoch from p_start)::text, ''), v_name, v_phone, v_type, v_note));

  if not coalesce(p_dry_run, false) then
    -- ซีเรียไลซ์คำขอที่ถือ reference_id เดียวกัน (เน็ตหลุดแล้วส่งซ้ำพร้อมกัน)
    perform pg_advisory_xact_lock(hashtextextended('booking-api-ref:' || v_ref, 0));
    select * into v_existing from public.booking_api_requests where reference_id = v_ref;
    if found then
      if v_existing.request_hash = v_hash then return v_existing.response; end if;
      raise exception 'REFERENCE_ID_REUSED';
    end if;
  end if;

  ev := public.booking_api_evaluate_v1(v_code, v_skucode, p_start);
  v_branch_id := (ev->>'branch_id')::uuid; v_proc := (ev->>'procedure_id')::uuid; v_promo := (ev->>'promo_id')::uuid;
  v_price := (ev->>'price')::numeric; v_dur := (ev->>'dur')::int; v_date := (ev->>'date')::date; v_block := (ev->>'block')::int;
  v_start_text := to_char(v_local, 'YYYY-MM-DD"T"HH24:MI:SS') || '+07:00';

  if not (ev->>'available')::boolean then
    v_reason := ev->>'reason';
    return jsonb_build_object('success', false,
             'http', case when v_reason in ('SLOT_FULL', 'OUTSIDE_HOURS') then 409 else 422 end,
             'error_code', case when v_reason in ('SLOT_FULL', 'OUTSIDE_HOURS') then 'SLOT_UNAVAILABLE' else v_reason end,
             'reason', v_reason, 'alternatives', ev->'alternatives');
  end if;

  if coalesce(p_dry_run, false) then
    return jsonb_build_object('success', true, 'booking_id', 'SANDBOX-' || upper(substr(md5(v_ref || v_hash), 1, 10)),
                              'status', 'confirmed', 'branch_code', v_code, 'sku', v_skucode, 'start_time', v_start_text, 'sandbox', true);
  end if;

  select nullif(value, '')::uuid into v_bot from public.booking_api_config where key = 'bot_staff_id';
  select * into v_bot_staff from public.staff where id = v_bot;
  if v_bot is null or not found or v_bot_staff.role <> 'admin' then raise exception 'BOT_NOT_CONFIGURED'; end if;

  -- เลือกห้องแรกที่ว่าง: ล็อกห้อง-วันด้วยกุญแจเดียวกับ create_queue_v1 แล้วตรวจซ้ำ (กันชนกับพนักงานที่ลงคิวพร้อมกัน)
  for v_cand in select c.room_id from public.booking_api_candidate_rooms_v1(v_branch_id, v_proc) c
  loop
    perform pg_advisory_xact_lock(hashtextextended('queue-room-day:' || v_cand::text || ':' || v_date::text, 0));
    if public.booking_api_room_status_v1(v_cand, v_date, v_block, v_dur) = 'ok' then
      v_room := v_cand;
      exit;
    end if;
  end loop;

  if v_room is null then
    ev := public.booking_api_evaluate_v1(v_code, v_skucode, p_start);
    return jsonb_build_object('success', false, 'http', 409, 'error_code', 'SLOT_UNAVAILABLE',
                              'reason', 'SLOT_FULL', 'alternatives', ev->'alternatives');
  end if;

  v_status := case when v_date = (now() at time zone 'Asia/Bangkok')::date then 'confirmed' else 'pending' end;
  v_rate := case v_type when 'new' then coalesce(v_bot_staff.commission_rate_new, 0) else coalesce(v_bot_staff.commission_rate_old, 0) end;

  insert into public.queues (
    name, phone, branch_id, procedure_id, promo_id, price, note, customer_type,
    date, time_block, duration_blocks, room_id, status, status_note, recorded_by,
    request_id, effective_duration_blocks, effective_price, effective_commission_rate, area_names
  ) values (
    v_name, v_phone, v_branch_id, v_proc, v_promo, v_price,
    '[Saifa AI] ref ' || v_ref || case when v_note <> '' then E'\n' || v_note else '' end, v_type,
    v_date, v_block, v_dur, v_room, v_status, '', v_bot,
    md5('booking-api:' || v_ref)::uuid, v_dur, v_price, v_rate, null
  ) returning id into v_queue_id;

  insert into public.queue_audit (queue_id, operation, actor_session_id, actor_staff_id, release_id, request_id, changed_fields)
  values (v_queue_id, 'create', null, v_bot, 'booking_api', md5('booking-api:' || v_ref)::uuid,
          array['branch_id', 'procedure_id', 'promo_id', 'price', 'customer_type', 'date', 'time_block', 'duration_blocks', 'room_id', 'status', 'area_names']);

  insert into public.booking_api_counters as k (day, last_no) values (v_date, 1)
  on conflict (day) do update set last_no = k.last_no + 1
  returning last_no into v_no;
  v_booking_id := 'CC-' || to_char(v_date, 'YYYYMMDD') || '-' || lpad(v_no::text, 4, '0');

  v_resp := jsonb_build_object('success', true, 'booking_id', v_booking_id, 'status', 'confirmed',
                               'branch_code', v_code, 'sku', v_skucode, 'start_time', v_start_text);
  insert into public.booking_api_requests (reference_id, request_hash, queue_id, booking_id, response)
  values (v_ref, v_hash, v_queue_id, v_booking_id, v_resp);
  return v_resp;
end;
$$;

revoke all on function
  public.booking_api_candidate_rooms_v1(uuid, uuid),
  public.booking_api_room_status_v1(uuid, date, int, int),
  public.booking_api_free_rooms_v1(uuid, uuid, date, int, int),
  public.booking_api_day_range_v1(uuid, uuid, date),
  public.booking_api_branches_v1(),
  public.booking_api_catalog_v1(),
  public.booking_api_resolve_v1(text, text),
  public.booking_api_evaluate_v1(text, text, timestamptz),
  public.booking_api_check_v1(text, text, timestamptz),
  public.booking_api_slots_v1(text, text, date),
  public.booking_api_create_v1(text, text, text, timestamptz, text, text, text, text, boolean)
  from public, anon, authenticated;
grant execute on function
  public.booking_api_candidate_rooms_v1(uuid, uuid),
  public.booking_api_room_status_v1(uuid, date, int, int),
  public.booking_api_free_rooms_v1(uuid, uuid, date, int, int),
  public.booking_api_day_range_v1(uuid, uuid, date),
  public.booking_api_branches_v1(),
  public.booking_api_catalog_v1(),
  public.booking_api_resolve_v1(text, text),
  public.booking_api_evaluate_v1(text, text, timestamptz),
  public.booking_api_check_v1(text, text, timestamptz),
  public.booking_api_slots_v1(text, text, date),
  public.booking_api_create_v1(text, text, text, timestamptz, text, text, text, text, boolean)
  to service_role;
