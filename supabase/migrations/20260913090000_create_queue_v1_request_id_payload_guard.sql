-- create_queue_v1: รหัสอ้างอิงเดิม + ข้อมูลเปลี่ยน = ต้องปฏิเสธ ไม่ใช่ส่งใบเก่ากลับ
--
-- ═══ ทำไม ═══
-- กลไกรหัสอ้างอิง (request_id) มีไว้กันคิวซ้ำตอนเน็ตกระตุกแล้วเบราว์เซอร์ยิงซ้ำ
-- แต่ของเดิมดูแค่ "เคยเห็นรหัสนี้ไหม" ไม่ได้ดูว่าข้อมูลที่ส่งมารอบนี้ยังเหมือนเดิมหรือเปล่า
--
-- ลำดับที่ทำให้ข้อมูลผิดโดยไม่มีใครรู้:
--   1. กดบันทึก เน็ตกระตุก แถวลงฐานข้อมูลไปแล้วแต่คำตอบหายกลางทาง หน้าจอขึ้นว่าไม่สำเร็จ
--      (ฝั่งแอปจงใจเก็บรหัสอ้างอิงไว้ เพื่อให้กดซ้ำแล้วไม่เกิดคิวซ้ำ — ดู App.jsx)
--   2. แอดมินแก้ฟอร์ม เช่น เปลี่ยนเวลา เปลี่ยนห้อง หรือแก้ราคา แล้วกดบันทึกอีกครั้ง
--   3. เซิร์ฟเวอร์เห็นรหัสอ้างอิงเดิม จึงส่งคิวใบเก่ากลับโดยไม่บันทึกอะไรใหม่
--   4. หน้าจอขึ้นว่า "บันทึกคิวเรียบร้อย" แต่สิ่งที่อยู่ในระบบคือข้อมูลชุดแรก
--
-- ผลคือลูกค้าถูกลงคิวผิดเวลา/ผิดห้อง/ผิดราคา โดยหน้าร้านเชื่อว่าบันทึกสิ่งที่แก้ไปแล้ว
--
-- เรื่องนี้สำคัญขึ้นอีกเพราะทางนี้กำลังจะขยายจากกลุ่มทดลอง 3 บัญชี (ทีมกทม. นครพนม QA)
-- ไปใช้ทั้งระบบ — ถ้าขยายทั้งที่ยังมีรูนี้ อาการจะกระจายไปทุกสาขา
--
-- ═══ เปลี่ยนอะไร (แค่บล็อกเดียว ที่เหลือคัดลอกมาทั้งดุ้นจาก 20260909020000) ═══
-- ในบล็อก "เจอรหัสอ้างอิงเดิม" เพิ่มการเทียบข้อมูลสำคัญของใบเดิมกับที่ส่งมาใหม่
-- เหมือนกันหมด -> ส่งใบเดิมกลับเหมือนเดิม (กันคิวซ้ำยังทำงานครบ)
-- ต่างแม้จุดเดียว -> ปฏิเสธ
--
-- ไม่เทียบ status เพราะฝั่งแอปเลื่อน pending -> confirmed เองตามกฎ "จองวันนี้" ซึ่งอาจ
-- เปลี่ยนได้ระหว่างสองครั้งที่กดถ้าข้ามเที่ยงคืน จะกลายเป็นปฏิเสธผิด ๆ
-- ไม่เทียบ duration_blocks ตอนที่ฝั่งแอปไม่ได้ส่งค่ามา เพราะเซิร์ฟเวอร์เติมจากหัตถการให้เอง
--
-- ใช้ error code 'invalid_queue_payload' ซึ่ง Edge Function กับฝั่งแอปรู้จักอยู่แล้ว
-- (เหตุผลเดียวกับ 20260909020000) — ถ้าใช้รหัสใหม่ที่สองฝั่งไม่รู้จัก ระบบจะตีเป็น
-- เน็ตล่ม แล้ว "เก็บรหัสอ้างอิงเดิมไว้" กดใหม่ก็วนเจอเดิมไม่จบ ลงคิวไม่ได้เลย
-- พอเป็นรหัสที่รู้จัก ฝั่งแอปจะล้างรหัสอ้างอิงทิ้งเอง กดบันทึกอีกครั้งแล้วลงได้ถูกต้อง
--
-- ═══ ลงโปรดักชันแล้ว 13 ก.ย. 2569 (หน้าร้านเปิดอยู่ 31 คนออนไลน์) ═══
-- ไม่ได้พิมพ์ฟังก์ชันใหม่เอง แต่ให้ฐานข้อมูลดึงของจริงมาแล้วแทนที่เฉพาะบล็อกนี้
-- ตรวจแล้ว: ถอดบล็อกใหม่ออกได้ checksum เดิมเป๊ะ = ส่วนอื่นไม่เปลี่ยนแม้แต่ตัวอักษรเดียว
-- ทดสอบเรียกฟังก์ชันจริง 3 กรณีในทรานแซกชันแล้ว rollback: สร้างใหม่ได้ / กดซ้ำข้อมูลเดิม
-- ได้ใบเดิม / เปลี่ยนเวลาแล้วถูกปฏิเสธ — ยืนยันหลัง rollback ว่าไม่มีข้อมูลทดสอบหลงเหลือ

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

    -- ส่งใบเดิมกลับได้เฉพาะตอนข้อมูลเหมือนเดิมจริง ๆ = กดซ้ำเพราะเน็ตกระตุก (เจตนาเดิมของกลไกนี้)
    -- ถ้าแอดมินแก้ฟอร์มแล้วกดใหม่ด้วยรหัสอ้างอิงเดิม ของเดิมจะส่งใบเก่ากลับพร้อมบอกว่าสำเร็จ
    -- ทั้งที่สิ่งที่แก้ไม่ได้ลงเลย คิวจึงอยู่ผิดเวลา/ผิดห้องโดยไม่มีใครรู้ตัว
    -- ใช้รหัส invalid_queue_payload เพราะฝั่งหน้าจอกับ edge function รู้จักอยู่แล้ว — รหัสใหม่
    -- ที่สองฝั่งไม่รู้จักจะถูกตีเป็นเน็ตล่ม แล้วรหัสอ้างอิงเดิมจะถูกเก็บไว้ กดใหม่ก็วนเจอเดิมไม่จบ
    if v_existing.name is distinct from btrim(coalesce(p_payload->>'name', ''))
       or v_existing.phone is distinct from btrim(coalesce(p_payload->>'phone', ''))
       or v_existing.branch_id is distinct from nullif(p_payload->>'branch_id', '')::uuid
       or v_existing.room_id is distinct from nullif(p_payload->>'room_id', '')::uuid
       or v_existing.procedure_id is distinct from nullif(p_payload->>'procedure_id', '')::uuid
       or v_existing.promo_id is distinct from nullif(p_payload->>'promo_id', '')::uuid
       or v_existing.date is distinct from nullif(p_payload->>'date', '')::date
       or v_existing.time_block is distinct from nullif(p_payload->>'time_block', '')::integer
       or v_existing.price is distinct from nullif(p_payload->>'price', '')::numeric(10, 2)
       or v_existing.customer_type is distinct from nullif(p_payload->>'customer_type', '')
       or v_existing.note is distinct from coalesce(p_payload->>'note', '')
       or (nullif(p_payload->>'duration_blocks', '') is not null
           and v_existing.duration_blocks is distinct from nullif(p_payload->>'duration_blocks', '')::integer)
    then
      raise exception using errcode = 'P0001', message = 'invalid_queue_payload';
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
