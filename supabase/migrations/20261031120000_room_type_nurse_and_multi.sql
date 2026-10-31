-- ประเภทห้องใหม่ N (ห้องพยาบาล) + หัตถการลงได้หลายประเภทห้อง
--
-- ═══ ทำไม ═══
-- 1. เดิมมีห้องแค่ M (ห้องฉีด) กับ T (ห้องเครื่อง/ทรีตเมนต์) — เจ้าของต้องการห้องพยาบาลแยก
--    ให้หน้าคิวว่างนับแยกและชื่อเตียงเป็น N01, N02
-- 2. เดิมหัตถการหนึ่งตัวผูกกับห้องได้ประเภทเดียว แต่บางหัตถการทำได้หลายห้อง
--    ต้องสร้างหัตถการซ้ำหลายตัวชื่อเดียวกัน ซึ่งทำให้รายงานแยกยอดกัน
--
-- ═══ เปลี่ยนอะไร ═══
-- 1. rooms.type รับ 'N' เพิ่ม (แทนที่ check เดิม rooms_type_check ที่รับแค่ M/T)
-- 2. procedures.room_type เป็นตัวอักษรประเภทห้องเรียงกันตามลำดับ M, T, N เช่น 'M', 'MT', 'TN', 'MTN'
--    (= ลงได้ทุกประเภทห้องที่อยู่ในสตริง) — แทนที่ check เดิม procedures_room_type_check ที่รับแค่ M/T
--    ข้อมูลเดิมเป็น M/T ทั้งหมดอยู่แล้ว (M 20 ตัว, T 13 ตัว ณ 31 ต.ค. 2569) จึงไม่มีแถวไหนผิดกติกาใหม่
-- 3. create_queue_v1: เทียบประเภทห้องแบบ "ห้องนี้อยู่ในรายการที่หัตถการรับ" แทน "เท่ากันเป๊ะ"
--    หัตถการประเภทเดียวได้ผลเหมือนเดิมทุกกรณี (เงื่อนไขเดิมยังอยู่ แค่เพิ่มทางผ่าน)
-- 4. booking_api_candidate_rooms_v1 (Booking API ของน้องคลาส) ใช้กติกาเดียวกัน
-- 5. trigger rooms_keep_identity: ประเภทและชื่อเตียงเปลี่ยนไม่ได้หลังสร้าง (กันแท็บเก่าเขียนทับ)
--
-- ไฟล์นี้ไม่แก้ข้อมูลแถวไหนเลย (แค่ขยายกติกา + ฟังก์ชัน) จึงลงหลังเว็บเวอร์ชันใหม่ขึ้นได้อย่างปลอดภัย
-- การแก้ข้อมูล (หัตถการเป็น MN + เปลี่ยนเตียงพยาบาลเป็น N) แยกไว้ที่ 20261031120100 ต้องลง "หลัง" เว็บใหม่ขึ้นแล้วเท่านั้น
-- (หน้าเว็บเวอร์ชันเก่าเทียบประเภทแบบเท่ากันเป๊ะ เห็น 'MN' แล้วหัตถการนั้นจะหายจากเตียง M)
--
-- กฎเตียง→หัตถการ (room_procedures) ไม่แตะ — เตียงที่ตั้งค่าแล้วยังยึดตามที่ติ๊กไว้
-- queues_fill_name_snapshots เขียนป้าย '[' || type || '] ' || name อยู่แล้ว ห้อง N ได้ '[N] N01' เอง
--
-- create_queue_v1 ส่วนที่เหลือคัดลอกจาก 20260916110000 ทั้งดุ้น ซึ่งตรวจแล้วว่าตรงกับ
-- ฟังก์ชันที่รันอยู่จริงบน production (md5 ของ prosrc ที่ตัดบรรทัดว่างหัวท้าย
-- = 4e042c19a157ce79b487d7f4cdb105f4) ต่างกันแค่บรรทัดเทียบประเภทห้องบรรทัดเดียว

set local lock_timeout = '3s';

alter table public.procedures
  drop constraint if exists procedures_room_type_check;
alter table public.procedures
  add constraint procedures_room_type_check
  check (room_type is null or (room_type <> '' and room_type ~ '^M?T?N?$'));

comment on column public.procedures.room_type is
  'ห้องที่หัตถการนี้ลงได้ เรียงตามลำดับ M, T, N: M = ห้องฉีด, T = ห้องเครื่อง/ทรีตเมนต์, N = ห้องพยาบาล เช่น MT = ได้ทั้งห้องฉีดและห้องเครื่อง';

alter table public.rooms
  drop constraint if exists rooms_type_check;
alter table public.rooms
  add constraint rooms_type_check
  check (type = any (array['M'::text, 'T'::text, 'N'::text]));

comment on column public.rooms.type is
  'ประเภทห้อง: M = ห้องฉีด, T = ห้องเครื่อง/ทรีตเมนต์, N = ห้องพยาบาล';

-- ═══ กันหน้าเว็บที่เปิดค้างเขียนทับประเภท/ชื่อเตียง ═══
-- หน้าเว็บโหลดตาราง rooms ครั้งเดียวตอนเปิด (ไม่มี Realtime ของ rooms) และฟอร์มแก้ห้องส่ง name + type
-- กลับไปทุกครั้งแม้ล็อกไว้ไม่ให้แก้ ถ้าแท็บที่เปิดไว้ก่อนเปลี่ยนเตียงพยาบาลเป็น N01 กดแก้เวลา/หมายเหตุของเตียงนั้น
-- จะเขียนกลับเป็น M / M03 เงียบ ๆ
-- กติกาของแอปอยู่แล้ว: ประเภทและชื่อเตียงเปลี่ยนไม่ได้หลังสร้าง → บังคับที่ฐานข้อมูลด้วย โดย "คงค่าเดิมไว้"
-- (ไม่ raise เพื่อให้การแก้เวลา/หมายเหตุจากแท็บเก่ายังบันทึกได้ และหน้าเว็บได้ค่าจริงกลับไปจาก .select())
-- ทางเดียวที่เปลี่ยนได้: ตั้ง qlass.allow_room_identity_change = 'on' ใน transaction เดียวกัน (ใช้ใน migration)
create or replace function public.rooms_keep_identity()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  if coalesce(current_setting('qlass.allow_room_identity_change', true), '') <> 'on' then
    new.type := old.type;
    new.name := old.name;
  end if;
  return new;
end
$fn$;

revoke all on function public.rooms_keep_identity() from public, anon, authenticated;

drop trigger if exists rooms_keep_identity on public.rooms;
create trigger rooms_keep_identity
  before update on public.rooms
  for each row execute function public.rooms_keep_identity();

create or replace function public.create_queue_v1(
  p_actor_staff_id uuid,
  p_actor_session_id uuid,
  p_request_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.staff%rowtype;
  v_session public.app_sessions%rowtype;
  v_existing public.queues%rowtype;
  v_queue public.queues%rowtype;
  v_room public.rooms%rowtype;
  v_procedure public.procedures%rowtype;
  v_promo public.promos%rowtype;
  v_branch_id uuid;
  v_room_id uuid;
  v_procedure_id uuid;
  v_promo_id uuid;
  v_date date;
  v_time_block integer;
  v_duration integer;
  v_price numeric(10, 2);
  v_customer_type text;
  v_status text;
  v_name text;
  v_phone text;
  v_note text;
  v_area_names text;
  v_block integer;
  v_effective_commission numeric(10, 4);
begin
  if p_request_id is null or p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception using errcode = 'P0001', message = 'invalid_queue_payload';
  end if;

  -- Serialize retries of the same logical user action before checking the
  -- unique index.  The per-room/day lock below separately serializes slots.
  perform pg_advisory_xact_lock(hashtextextended('queue-request:' || p_request_id::text, 0));

  select * into v_existing
  from public.queues
  where request_id = p_request_id;

  if found then
    if v_existing.recorded_by is distinct from p_actor_staff_id then
      raise exception using errcode = 'P0001', message = 'request_id_forbidden';
    end if;

    -- ส่งใบเดิมกลับได้เฉพาะตอนข้อมูลเหมือนเดิมจริง ๆ = กดซ้ำเพราะเน็ตกระตุก (เจตนาเดิมของกลไกนี้)
    -- ถ้าแอดมินแก้ฟอร์มแล้วกดใหม่ด้วยรหัสอ้างอิงเดิม ของเดิมจะส่งใบเก่ากลับพร้อมบอกว่าสำเร็จ
    -- ทั้งที่สิ่งที่แก้ไม่ได้ลงเลย คิวจึงอยู่ผิดเวลา/ผิดห้องโดยไม่มีใครรู้ตัว
    -- ใช้รหัส invalid_queue_payload เพราะฝั่งหน้าจอกับ edge function รู้จักอยู่แล้ว — รหัสใหม่
    -- ที่สองฝั่งไม่รู้จักจะถูกตีเป็นเน็ตล่ม แล้วรหัสอ้างอิงเดิมจะถูกเก็บไว้ กดใหม่ก็วนเจอเดิมไม่จบ
    if not public.queue_payload_unchanged(v_existing, p_payload) then
      raise exception using errcode = 'P0001', message = 'request_id_stale';
    end if;

    return to_jsonb(v_existing);
  end if;

  select * into v_session
  from public.app_sessions
  where id = p_actor_session_id
    and staff_id = p_actor_staff_id
    and revoked_at is null
    and expires_at > now();

  if not found then
    raise exception using errcode = 'P0001', message = 'invalid_session';
  end if;

  select * into v_actor
  from public.staff
  where id = p_actor_staff_id
    and active = true;

  if not found or v_actor.role not in ('ceo', 'superadmin', 'head_admin', 'admin', 'branch_manager', 'cashier') then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;

  v_name := btrim(coalesce(p_payload->>'name', ''));
  v_phone := btrim(coalesce(p_payload->>'phone', ''));
  v_note := coalesce(p_payload->>'note', '');
  v_area_names := nullif(btrim(coalesce(p_payload->>'area_names', '')), '');
  v_branch_id := nullif(p_payload->>'branch_id', '')::uuid;
  v_room_id := nullif(p_payload->>'room_id', '')::uuid;
  v_procedure_id := nullif(p_payload->>'procedure_id', '')::uuid;
  v_promo_id := nullif(p_payload->>'promo_id', '')::uuid;
  v_date := nullif(p_payload->>'date', '')::date;
  v_time_block := nullif(p_payload->>'time_block', '')::integer;
  v_price := nullif(p_payload->>'price', '')::numeric(10, 2);
  -- ไม่เติม 'new' ให้เองอีกต่อไป — ค่าที่เซิร์ฟเวอร์เดาให้คือรูรั่วเดียวกับที่ฝั่งหน้าจอเพิ่งปิดไป
  v_customer_type := nullif(p_payload->>'customer_type', '');
  v_status := coalesce(nullif(p_payload->>'status', ''), 'pending');

  if v_name = '' or v_phone = '' or v_branch_id is null or v_date is null then
    raise exception using errcode = 'P0001', message = 'invalid_queue_payload';
  end if;

  if v_date < (now() at time zone 'Asia/Bangkok')::date then
    raise exception using errcode = 'P0001', message = 'past_date_not_allowed';
  end if;

  -- ต้องเช็ค is null แยก: NULL not in (...) ให้ผลเป็น NULL ไม่ใช่ true — if จะไม่ทำงาน
  -- แล้วคิวที่ไม่มีประเภทจะหลุดลงตารางไปเงียบ ๆ
  if v_customer_type is null or v_customer_type not in ('new', 'old', 'course') or coalesce(v_price, 0) < 0 then
    raise exception using errcode = 'P0001', message = 'invalid_queue_payload';
  end if;

  -- A new queue may only start 'pending' (the default) or 'confirmed' — and
  -- 'confirmed' is only accepted when it matches the client's own same-day
  -- rule. v_date is already known to be >= today from the past-date check
  -- above, so "not today" here means "in the future".
  if v_status = 'confirmed' then
    if v_date <> (now() at time zone 'Asia/Bangkok')::date then
      raise exception using errcode = 'P0001', message = 'invalid_queue_payload';
    end if;
  elsif v_status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'invalid_queue_payload';
  end if;

  if not exists (select 1 from public.branches where id = v_branch_id) then
    raise exception using errcode = 'P0001', message = 'invalid_branch';
  end if;

  if v_actor.role in ('branch_manager', 'cashier') and v_actor.branch_id is distinct from v_branch_id then
    raise exception using errcode = 'P0001', message = 'branch_forbidden';
  end if;

  if v_room_id is not null then
    select * into v_room from public.rooms where id = v_room_id;
    if not found or v_room.branch_id is distinct from v_branch_id then
      raise exception using errcode = 'P0001', message = 'invalid_room';
    end if;
  elsif v_time_block is not null then
    raise exception using errcode = 'P0001', message = 'room_required';
  end if;

  if v_procedure_id is not null then
    select * into v_procedure from public.procedures where id = v_procedure_id;
    -- room_type เป็นตัวอักษรประเภทห้องเรียงกัน (เช่น M, MT, MTN) — ผ่านเมื่อประเภทห้องนี้อยู่ในรายการ
    if not found or (
      v_room_id is not null
      and v_procedure.room_type is distinct from v_room.type
      and coalesce(strpos(v_procedure.room_type, v_room.type), 0) = 0
    ) then
      raise exception using errcode = 'P0001', message = 'invalid_procedure';
    end if;

    -- กฎเตียง→หัตถการ (ส่วนที่เพิ่มใหม่ในไฟล์นี้)
    -- เตียงที่ยังไม่มีแถวใน room_procedures เลย ให้ผ่านด้วยกติกาเดิมข้างบน — ไม่งั้น
    -- สาขาที่ยังไม่ได้ตั้งค่าจะลงคิวไม่ได้ทั้งสาขาทันทีที่ migration นี้ลง
    if v_room_id is not null
       and exists (select 1 from public.room_procedures rp where rp.room_id = v_room_id)
       and not exists (
         select 1 from public.room_procedures rp
         where rp.room_id = v_room_id and rp.procedure_id = v_procedure_id
       )
    then
      raise exception using errcode = 'P0001', message = 'invalid_procedure';
    end if;

    v_duration := coalesce(nullif(p_payload->>'duration_blocks', '')::integer, v_procedure.blocks);
    if coalesce(v_duration, 0) < 1 then
      raise exception using errcode = 'P0001', message = 'invalid_duration';
    end if;
  elsif v_promo_id is not null or v_time_block is not null or nullif(p_payload->>'duration_blocks', '') is not null then
    raise exception using errcode = 'P0001', message = 'procedure_required';
  else
    v_duration := null;
  end if;

  if v_promo_id is not null then
    select * into v_promo from public.promos where id = v_promo_id and active = true;
    if not found or v_promo.procedure_id is distinct from v_procedure_id then
      raise exception using errcode = 'P0001', message = 'invalid_promo';
    end if;
  end if;

  if v_time_block is not null then
    if v_time_block < 96 or v_time_block + v_duration > 288 then
      raise exception using errcode = 'P0001', message = 'invalid_time';
    end if;

    perform pg_advisory_xact_lock(hashtextextended('queue-room-day:' || v_room_id::text || ':' || v_date::text, 0));

    if exists (
      select 1
      from public.room_schedules s
      where s.room_id = v_room_id
        and (s.date = v_date or s.date is null)
        and s.available = false
        and s.start_block is null
        and s.end_block is null
    ) then
      raise exception using errcode = 'P0001', message = 'room_closed';
    end if;

    for v_block in select generate_series(v_time_block, v_time_block + v_duration - 1)
    loop
      if not (
        (v_block >= v_room.open_block and v_block < v_room.close_block)
        or exists (
          select 1
          from public.room_schedules s
          where s.room_id = v_room_id
            and (s.date = v_date or s.date is null)
            and s.available = true
            and s.start_block is not null
            and s.end_block is not null
            and v_block >= s.start_block
            and v_block < s.end_block
        )
      ) then
        raise exception using errcode = 'P0001', message = 'room_closed';
      end if;

      if exists (
        select 1
        from public.room_schedules s
        where s.room_id = v_room_id
          and (s.date = v_date or s.date is null)
          and s.available = false
          and s.start_block is not null
          and s.end_block is not null
          and v_block >= s.start_block
          and v_block < s.end_block
      ) then
        raise exception using errcode = 'P0001', message = 'room_closed';
      end if;
    end loop;

    if exists (
      select 1
      from public.queues q
      left join public.procedures q_procedure on q_procedure.id = q.procedure_id
      where q.room_id = v_room_id
        and q.date = v_date
        and q.time_block is not null
        -- 'rescheduled' (เลื่อนออก) ต้องไม่กินช่องเวลา — ฝั่งแอปเปลี่ยนกติกานี้ไปตั้งแต่
        -- 6 ส.ค. 2569 (คอมมิต "Free up the original slot when a queue is rescheduled or
        -- cancelled") แต่ฟังก์ชันนี้เขียนไว้ 2 ส.ค. จึงค้างกติกาเก่า ผลคือแอดมินเห็นช่องว่าง
        -- ในตาราง กดลงคิว แล้วโดนเด้งว่าเวลาชน ทั้งที่มองไม่เห็นว่าชนกับใคร
        -- ('rescheduled_in' คือใบใหม่ที่ปลายทาง เป็นคิวจริง ยังต้องกินช่องเวลาตามเดิม)
        and q.status not in ('cancelled', 'no_show', 'rescheduled')
        and v_time_block < q.time_block + coalesce(q.duration_blocks, q_procedure.blocks, 1)
        and q.time_block < v_time_block + v_duration
    ) then
      raise exception using errcode = 'P0001', message = 'room_conflict';
    end if;
  end if;

  v_effective_commission := case v_customer_type
    when 'new' then coalesce(v_actor.commission_rate_new, 0)
    when 'old' then coalesce(v_actor.commission_rate_old, 0)
    else coalesce(v_actor.commission_rate_course, 0)
  end;

  insert into public.queues (
    name, phone, branch_id, procedure_id, promo_id, price, note, customer_type,
    date, time_block, duration_blocks, room_id, status, status_note, recorded_by,
    request_id, effective_duration_blocks, effective_price, effective_commission_rate, area_names
  ) values (
    v_name, v_phone, v_branch_id, v_procedure_id, v_promo_id, v_price, v_note, v_customer_type,
    v_date, v_time_block, v_duration, v_room_id, v_status, '', p_actor_staff_id,
    p_request_id, v_duration, v_price, v_effective_commission, v_area_names
  ) returning * into v_queue;

  insert into public.queue_audit (
    queue_id, operation, actor_session_id, actor_staff_id, release_id, request_id, changed_fields
  ) values (
    v_queue.id, 'create', p_actor_session_id, p_actor_staff_id, 'create_queue_v1', p_request_id,
    array['branch_id', 'procedure_id', 'promo_id', 'price', 'customer_type', 'date', 'time_block', 'duration_blocks', 'room_id', 'status', 'area_names']
  );

  return to_jsonb(v_queue);
exception
  when unique_violation then
    select * into v_existing from public.queues where request_id = p_request_id;
    if found and v_existing.recorded_by = p_actor_staff_id then
      -- ทางสำรองนี้เดิมคืนใบเดิมกลับโดยไม่เทียบข้อมูล = รูเดียวกับที่ปิดไว้ข้างบน
      -- เกิดเมื่อสองคำขอที่ถือรหัสอ้างอิงเดียวกันวิ่งชนกันจนหลุดล็อกแล้ว index เป็นคนจับ
      if not public.queue_payload_unchanged(v_existing, p_payload) then
        raise exception using errcode = 'P0001', message = 'request_id_stale';
      end if;
      return to_jsonb(v_existing);
    end if;
    raise;
end;
$$;

comment on function public.create_queue_v1(uuid, uuid, uuid, jsonb) is
  'Goal 13b + room-procedure lock: server-only idempotent queue creation. Rejects a procedure the target bed is not configured to take; a bed with no room_procedures rows still falls back to the room_type match (procedure room_type lists every room type it fits, e.g. M, MT, MTN; room types M/T/N). Both idempotency paths (pre-check and unique_violation fallback) compare the payload via queue_payload_unchanged (including area_names) and raise request_id_stale on a mismatch. Browser roles have no execute grant.';

revoke all on function public.create_queue_v1(uuid, uuid, uuid, jsonb) from public, anon, authenticated;

create or replace function public.booking_api_candidate_rooms_v1(p_branch_id uuid, p_procedure_id uuid)
returns table(room_id uuid)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select r.id
    from public.rooms r
    join public.procedures p on p.id = p_procedure_id
   where r.branch_id = p_branch_id
     and (r.type = p.room_type or coalesce(strpos(p.room_type, r.type), 0) > 0)
     and (not exists (select 1 from public.room_procedures rp where rp.room_id = r.id)
          or exists (select 1 from public.room_procedures rp where rp.room_id = r.id and rp.procedure_id = p_procedure_id))
   order by coalesce(r.sort_order, 0), r.name, r.id;
$function$;
