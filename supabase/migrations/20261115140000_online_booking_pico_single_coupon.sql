-- จองออนไลน์: Pico ใช้คูปองใบเดียวพอ (เจ้าของสั่ง 15 พ.ย. 2569 — Pico ไม่จำกัดช็อต)
--
-- เดิม: ทุกหัตถการเลือก 1–3 ใบ เวลา = เวลาหัตถการ × จำนวนใบ — Pico 3 ใบล็อกเตียง 90 นาทีทั้งที่ทำ 30 นาที
-- ใหม่: Pico นับเป็น 1 ใบเสมอ (เวลา 1 รอบ หมายเหตุไม่ขึ้น "คูปอง N ใบ" ผลตอบกลับ count = 1)
--   หน้าจองใหม่ไม่ถาม Pico กี่ใบอยู่แล้ว; บรรทัดนี้กันหน้าจองรุ่นเก่าที่ยังค้างในมือถือลูกค้า (จองได้ปกติ ไม่ขึ้นข้อผิดพลาด)
--   หัตถการอื่นเหมือนเดิม; คิวที่จองไปแล้วไม่แตะ (เจ้าของสั่ง)
--   hash กันกดซ้ำยังใช้ p_count ที่ส่งมา = กดซ้ำด้วยข้อมูลเดิมได้ผลเดิม
--
-- slots_v2 = 20261114120000 ต่างแค่ Pico หาเวลา 1 รอบ
-- create_v2 = 20261115130000 ต่างแค่ v_count (ย้ายบรรทัดหาชื่อหัตถการขึ้นมาก่อนคำนวณเวลา ใช้ตัวเดิมต่อในกติกาลำดับหัตถการ)
--
-- ย้อนกลับ: รัน slots_v2 จาก 20261114120000 และ create_v2 จาก 20261115130000 อีกครั้ง

create or replace function public.online_booking_slots_v2(p_branch_id uuid, p_promo_id uuid, p_date date, p_count int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c_min_lead interval := interval '2 hours';
  c_max_days int := 14;
  c_max_count int := 3;
  v_active boolean; v_proc uuid; v_dur int;
  v_pname text;
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
  v_slots jsonb;
begin
  if p_count is null or p_count < 1 or p_count > c_max_count then raise exception 'INVALID_COUNT'; end if;
  select r.branch_active, r.procedure_id, r.dur into v_active, v_proc, v_dur
    from public.online_booking_resolve_v1(p_branch_id, p_promo_id) r;
  -- Pico ไม่จำกัดช็อต ใช้คูปองใบเดียวพอ — ส่งมากี่ใบก็หาเวลา 1 รอบ
  select p.name into v_pname from public.procedures p where p.id = v_proc;
  v_dur := v_dur * case when v_pname = 'Pico' then 1 else p_count end;
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

create or replace function public.online_booking_create_v2(
  p_reference_id text, p_branch_id uuid, p_promo_id uuid, p_start timestamptz,
  p_name text, p_phone text, p_customer_type text, p_note text, p_count int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_min_lead interval := interval '2 hours';
  c_max_days int := 14;
  c_max_booked_days int := 2;  -- 1 เบอร์ มีคิวจองออนไลน์ค้างได้ไม่เกิน 2 วัน
  c_max_per_day int := 3;      -- และวันละไม่เกิน 3 คิว
  c_max_count int := 3;
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
  v_other_days int;
  v_same_day int;
  v_clash record;
  v_pname text;
  v_kind text;
  v_order record;
  v_count int;
  v_resp jsonb;
begin
  if v_ref !~ '^[A-Za-z0-9_-]{8,64}$' then raise exception 'INVALID_REFERENCE'; end if;
  if p_count is null or p_count < 1 or p_count > c_max_count then raise exception 'INVALID_COUNT'; end if;
  if length(v_name) < 2 or length(v_name) > 100 or v_type not in ('new', 'old') then raise exception 'INVALID_CUSTOMER'; end if;
  if v_digits ~ '^66[0-9]{9}$' then v_digits := '0' || substr(v_digits, 3); end if;
  -- มือถือไทยเท่านั้น (06/08/09 + 8 หลัก) — ไม่รับเบอร์ที่ 8 หลักท้ายเป็นเลขเดียวกันหมด เช่น 0899999999 / 0811111111
  if v_digits !~ '^0[689][0-9]{8}$' or substr(v_digits, 3) ~ '^(.)\1+$' then raise exception 'INVALID_CUSTOMER'; end if;
  if p_start is null or extract(second from v_local) <> 0 or mod(extract(minute from v_local)::int, 5) <> 0 then
    raise exception 'INVALID_TIME';
  end if;

  v_hash := md5(concat_ws('|', p_branch_id::text, p_promo_id::text, extract(epoch from p_start)::text, v_name, v_digits, v_type, v_note, 'count:' || p_count::text));

  perform pg_advisory_xact_lock(hashtextextended('online-booking-ref:' || v_ref, 0));
  select * into v_existing from public.online_booking_requests where reference_id = v_ref;
  if found then
    if v_existing.request_hash = v_hash then return v_existing.response; end if;
    raise exception 'REFERENCE_ID_REUSED';
  end if;

  select r.branch_active, r.procedure_id, r.promo_id, r.price, r.dur, r.promo_name
    into v_active, v_proc, v_promo, v_price, v_dur, v_promo_name
    from public.online_booking_resolve_v1(p_branch_id, p_promo_id) r;
  -- Pico ไม่จำกัดช็อต ใช้คูปองใบเดียวพอ (เจ้าของสั่ง 15 พ.ย. 2569) — หน้าจองรุ่นเก่าที่ส่งหลายใบมา จองให้ 1 ใบ ไม่ขึ้นข้อผิดพลาด
  select p.name into v_pname from public.procedures p where p.id = v_proc;
  v_count := case when v_pname = 'Pico' then 1 else p_count end;
  v_dur := v_dur * v_count;
  select b.name into v_branch_name from public.branches b where b.id = p_branch_id;

  if not v_active then return jsonb_build_object('success', false, 'error_code', 'BRANCH_NOT_ACCEPTING'); end if;
  v_date := v_local::date;
  v_block := (extract(hour from v_local)::int * 60 + extract(minute from v_local)::int) / 5;
  if p_start < now() + c_min_lead or v_date > v_today + c_max_days then
    return jsonb_build_object('success', false, 'error_code', 'OUTSIDE_BOOKING_WINDOW');
  end if;

  select nullif(value, '')::uuid into v_staff from public.online_booking_config where key = 'staff_id';
  if v_staff is null or not exists (select 1 from public.staff s where s.id = v_staff) then raise exception 'NOT_CONFIGURED'; end if;

  perform pg_advisory_xact_lock(hashtextextended('online-booking-phone:' || v_digits, 0));
  -- เพดานคิวค้าง (เจ้าของสั่ง 15 พ.ย. 2569): นับเป็น "วัน" แทน "คิว" — เดิมเบอร์ละ 2 คิว จองหัตถการที่ 2 วันเดียวกันก็เต็มแล้ว
  -- นับเฉพาะคิวจองออนไลน์ที่ยังค้าง (ไม่นับยกเลิก/ไม่มา/เลื่อน/มาแล้ว) อยู่หลังล็อกเบอร์ = กดพร้อมกันหลายหน้าต่างก็นับถูก
  select count(distinct q.date) filter (where q.date <> v_date), count(*) filter (where q.date = v_date)
    into v_other_days, v_same_day
    from public.queues q
   where q.recorded_by = v_staff and q.phone = v_digits and q.date >= v_today
     and q.archived_at is null
     and coalesce(q.status, 'pending') not in ('cancelled', 'no_show', 'rescheduled', 'done');
  if v_same_day >= c_max_per_day then
    return jsonb_build_object('success', false, 'error_code', 'TOO_MANY_SAME_DAY');
  end if;
  if v_same_day = 0 and v_other_days >= c_max_booked_days then
    return jsonb_build_object('success', false, 'error_code', 'TOO_MANY_DAYS');
  end if;

  -- คนเดียวกันอยู่ 2 เตียงพร้อมกันไม่ได้ (อยู่หลังล็อกเบอร์ = กดจอง 2 หน้าต่างพร้อมกันก็กันได้)
  select q.time_block as tb, q.time_block + coalesce(q.duration_blocks, qp.blocks, 1) as te, coalesce(qp.name, '') as pname
    into v_clash
    from public.queues q
    left join public.procedures qp on qp.id = q.procedure_id
   where q.phone = v_digits and q.date = v_date
     and q.time_block is not null and q.archived_at is null
     and coalesce(q.status, 'pending') not in ('cancelled', 'no_show', 'rescheduled')
     and v_block < q.time_block + coalesce(q.duration_blocks, qp.blocks, 1)
     and q.time_block < v_block + v_dur
   order by q.time_block
   limit 1;
  if found then
    return jsonb_build_object('success', false, 'error_code', 'CUSTOMER_TIME_CONFLICT',
      'conflict', jsonb_build_object('service', v_clash.pname,
        'time', to_char(v_date::timestamp + v_clash.tb * interval '5 minutes', 'HH24:MI'),
        'end_time', to_char(v_date::timestamp + v_clash.te * interval '5 minutes', 'HH24:MI')));
  end if;

  -- ลำดับหัตถการ (เจ้าของสั่ง 15 พ.ย. 2569): Pico/Hifu/Ultraformer ต้องทำก่อนงานฉีด (Botox/Filler/Meso)
  -- คนเดียวกัน = เบอร์เดียวกัน + ชื่อเดียวกัน (ไม่นับช่องว่าง/ตัวพิมพ์) — เพื่อนที่ใช้เบอร์เดียวกันคนละชื่อไม่โดน
  -- นับทุกคิวของวันนั้น (จองเองและหน้าร้านลง) ที่ยังไม่ยกเลิก/ไม่มา/เลื่อน
  v_kind := case when v_pname in ('Pico', 'Hifu', 'Ultraformer', 'Go-Hifu') then 'first'
                 when v_pname in ('Botox', 'Filler', 'Meso', 'Go-Botox', 'Go-Filler') then 'inject' end;
  if v_kind is not null then
    select q.time_block as tb, q.time_block + coalesce(q.duration_blocks, qp.blocks, 1) as te, qp.name as pname
      into v_order
      from public.queues q
      join public.procedures qp on qp.id = q.procedure_id
     where q.phone = v_digits and q.date = v_date
       and q.time_block is not null and q.archived_at is null
       and coalesce(q.status, 'pending') not in ('cancelled', 'no_show', 'rescheduled')
       and lower(regexp_replace(coalesce(q.name, ''), '[[:space:]]+', '', 'g')) = lower(regexp_replace(v_name, '[[:space:]]+', '', 'g'))
       and (   (v_kind = 'first' and qp.name in ('Botox', 'Filler', 'Meso', 'Go-Botox', 'Go-Filler')
                and q.time_block < v_block + v_dur)
            or (v_kind = 'inject' and qp.name in ('Pico', 'Hifu', 'Ultraformer', 'Go-Hifu')
                and q.time_block + coalesce(q.duration_blocks, qp.blocks, 1) > v_block))
     order by case when v_kind = 'first' then q.time_block
                   else -(q.time_block + coalesce(q.duration_blocks, qp.blocks, 1)) end
     limit 1;
    if found then
      -- finish_by = ที่จองอยู่ต้องจบไม่เกินเวลาเริ่มคิวฉีด; start_from = ต้องเริ่มตั้งแต่ Pico/Hifu จบ
      return jsonb_build_object('success', false, 'error_code', 'PROCEDURE_ORDER',
        'conflict', jsonb_build_object('service', v_order.pname,
          'time', to_char(v_date::timestamp + v_order.tb * interval '5 minutes', 'HH24:MI'),
          'end_time', to_char(v_date::timestamp + v_order.te * interval '5 minutes', 'HH24:MI'),
          'need', case when v_kind = 'first' then 'finish_by' else 'start_from' end));
    end if;
  end if;

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
    '[จองออนไลน์]' || case when v_count > 1 then ' คูปอง ' || v_count || ' ใบ' else '' end
      || case when v_note <> '' then ' ' || v_note else '' end, v_type,
    v_date, v_block, v_dur, v_room, v_status, '', v_staff,
    v_request, v_dur, v_price, 0, null
  ) returning id into v_queue_id;

  insert into public.queue_audit (queue_id, operation, actor_session_id, actor_staff_id, release_id, request_id, changed_fields)
  values (v_queue_id, 'create', null, v_staff, 'online_booking', v_request,
          array['branch_id', 'procedure_id', 'promo_id', 'price', 'customer_type', 'date', 'time_block', 'duration_blocks', 'room_id', 'status', 'area_names']);

  v_resp := jsonb_build_object('success', true,
    'booking_ref', upper(left(replace(v_queue_id::text, '-', ''), 8)),
    'date', v_date, 'time', to_char(v_local, 'HH24:MI'),
    'branch', v_branch_name, 'service', v_promo_name, 'count', v_count,
    'end_time', to_char(v_local + v_dur * interval '5 minutes', 'HH24:MI'));
  insert into public.online_booking_requests (reference_id, request_hash, queue_id, response)
  values (v_ref, v_hash, v_queue_id, v_resp);
  return v_resp;
end;
$$;

revoke all on function
  public.online_booking_slots_v2(uuid, uuid, date, int),
  public.online_booking_create_v2(text, uuid, uuid, timestamptz, text, text, text, text, int)
  from public, anon, authenticated;
grant execute on function
  public.online_booking_slots_v2(uuid, uuid, date, int),
  public.online_booking_create_v2(text, uuid, uuid, timestamptz, text, text, text, text, int)
  to service_role;
