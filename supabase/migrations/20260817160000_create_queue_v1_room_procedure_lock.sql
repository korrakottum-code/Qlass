-- ให้ create_queue_v1 บังคับกฎ "เตียงไหนรับหัตถการอะไร" ด้วย
--
-- ตั้งแต่ PR #137 หน้า Timeline ลงคิวผ่านฟังก์ชันนี้เหมือนหน้าบันทึกคิวแล้ว และ PR #140
-- เปิดรับคิว same-day confirmed ด้วย แปลว่าฟังก์ชันนี้เป็นด่านจริงของทั้งสองหน้าจอ
-- ถ้ากฎอยู่แต่ฝั่งเบราว์เซอร์ ใครยิงตรงเข้ามาก็ยังลง pico ในเตียง diode ได้อยู่ดี
--
-- ฟังก์ชันนี้สร้างคิวใหม่อย่างเดียว ไม่เคยแก้ของเดิม จึงไม่ต้องมีเงื่อนไข grandfather
-- แบบฝั่งแอป (shouldEnforceOnSave) — "สร้างใหม่ = ตรวจเสมอ" ตรงกันพอดีอยู่แล้ว
--
-- กติกาต้องตรงกับ src/utils/roomProcedures.js เป๊ะ ๆ:
--   เตียงที่ไม่มีแถวใน room_procedures เลย = ยังไม่ตั้งค่า → ใช้กติกาเดิม room_type
--   เตียงที่ตั้งค่าแล้ว                      → ต้องมีแถวคู่ (room_id, procedure_id) นั้น
-- ถ้าสองฝั่งหลุดกัน จะกลายเป็นหน้าจอให้กดได้แต่เซิร์ฟเวอร์ปฏิเสธ (หรือแย่กว่าคือกลับกัน)
--
-- ใช้ error code เดิม 'invalid_procedure' ไม่สร้างโค้ดใหม่ เพราะ Edge Function
-- staff-session มี allowlist ของโค้ดที่ยอมส่งกลับถึงเบราว์เซอร์ โค้ดใหม่จะโดนกลืนเป็น
-- error ทั่วไป แล้วหน้าร้านจะเห็นข้อความกำกวมแทนที่จะรู้ว่าต้องเปลี่ยนเตียง
--
-- ที่คัดลอกทั้งฟังก์ชันมาแทนที่จะ patch เฉพาะจุด เพราะ Postgres ไม่มี "แก้บางส่วนของ
-- ฟังก์ชัน" — create or replace ต้องส่งตัวเต็ม ส่วนที่เพิ่มจริงคือบล็อกเดียวหลัง
-- การตรวจ room_type เดิม (มองหาคำว่า "กฎเตียง→หัตถการ")
--
-- Rollback: apply 20260817050038_goal13b_create_queue_v1_confirmed_status.sql ซ้ำ

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
  v_branch_id := nullif(p_payload->>'branch_id', '')::uuid;
  v_room_id := nullif(p_payload->>'room_id', '')::uuid;
  v_procedure_id := nullif(p_payload->>'procedure_id', '')::uuid;
  v_promo_id := nullif(p_payload->>'promo_id', '')::uuid;
  v_date := nullif(p_payload->>'date', '')::date;
  v_time_block := nullif(p_payload->>'time_block', '')::integer;
  v_price := nullif(p_payload->>'price', '')::numeric(10, 2);
  v_customer_type := coalesce(nullif(p_payload->>'customer_type', ''), 'new');
  v_status := coalesce(nullif(p_payload->>'status', ''), 'pending');

  if v_name = '' or v_phone = '' or v_branch_id is null or v_date is null then
    raise exception using errcode = 'P0001', message = 'invalid_queue_payload';
  end if;

  if v_date < (now() at time zone 'Asia/Bangkok')::date then
    raise exception using errcode = 'P0001', message = 'past_date_not_allowed';
  end if;

  if v_customer_type not in ('new', 'old', 'course') or coalesce(v_price, 0) < 0 then
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
    if not found or (v_room_id is not null and v_procedure.room_type is distinct from v_room.type) then
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
        and q.status not in ('cancelled', 'no_show')
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
    request_id, effective_duration_blocks, effective_price, effective_commission_rate
  ) values (
    v_name, v_phone, v_branch_id, v_procedure_id, v_promo_id, v_price, v_note, v_customer_type,
    v_date, v_time_block, v_duration, v_room_id, v_status, '', p_actor_staff_id,
    p_request_id, v_duration, v_price, v_effective_commission
  ) returning * into v_queue;

  insert into public.queue_audit (
    queue_id, operation, actor_session_id, actor_staff_id, release_id, request_id, changed_fields
  ) values (
    v_queue.id, 'create', p_actor_session_id, p_actor_staff_id, 'create_queue_v1', p_request_id,
    array['branch_id', 'procedure_id', 'promo_id', 'price', 'customer_type', 'date', 'time_block', 'duration_blocks', 'room_id', 'status']
  );

  return to_jsonb(v_queue);
exception
  when unique_violation then
    select * into v_existing from public.queues where request_id = p_request_id;
    if found and v_existing.recorded_by = p_actor_staff_id then
      return to_jsonb(v_existing);
    end if;
    raise;
end;
$$;

comment on function public.create_queue_v1(uuid, uuid, uuid, jsonb) is
  'Goal 13b + room-procedure lock: server-only idempotent queue creation. Rejects a procedure the target bed is not configured to take; a bed with no room_procedures rows still falls back to the room_type match. Browser roles have no execute grant.';

revoke all on function public.create_queue_v1(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
