-- จองออนไลน์: ลูกค้าเลือกจำนวนคูปอง 1–3 ใบ ระบบล็อกเวลาตามจำนวนใบจริง (เจ้าของสั่ง 14 พ.ย. 2569)
--
-- ปัญหา: ระบบล็อกเวลาให้ 1 ใบ แต่ลูกค้าเขียนในหมายเหตุว่าใช้หลายใบ (Filler 35%, Hifu 52% ของคิวออนไลน์)
-- หน้าร้านเจอลูกค้าถือคูปอง 6 ใบมาในช่อง 30 นาที คิวหน้าร้านล้น
-- กติกา: 1 ใบ = เวลาเต็มของหัตถการ 1 รอบ (Filler 30 นาที × 3 ใบ = 90 นาที); ทุกหัตถการสูงสุด 3 ใบ เกินนั้นทักแอดมิน
--
-- ปลอดภัยต่อระบบที่ใช้อยู่: เพิ่มฟังก์ชัน v2 ใหม่เท่านั้น ไม่แก้ v1 — หน้าจองเวอร์ชันเก่าที่ค้างในมือถือลูกค้ายังเรียก v1 (1 ใบ) ได้เหมือนเดิม
-- v2 = v1 ทุกบรรทัด ต่างแค่ ความยาว = เวลาหัตถการ × จำนวนใบ, หมายเหตุขึ้นต้นด้วยจำนวนใบ, hash กันกดซ้ำรวมจำนวนใบ
-- ราคาในคิว (price) ยังเป็นราคาโปร 1 ใบเหมือนคิวออนไลน์เดิม — ไม่เปลี่ยนตัวเลขรายงานรายได้/คอมมิชชั่น
-- กันคนเดียวกันจองเวลาทับกันเอง (เช่น Diode 13:00 + Pico 13:00 คนละเตียง): เบอร์นี้มีคิววันเดียวกันที่เวลาทับ
-- (ทุกคิว ทั้งจองเองและหน้าร้านลง ที่ยังไม่ยกเลิก/ไม่มา/เลื่อน) = ไม่ให้จอง ตอบ CUSTOMER_TIME_CONFLICT พร้อมคิวที่ชน
--
-- ย้อนกลับ: drop function online_booking_slots_v2 / online_booking_create_v2 (หน้าจองต้องย้อนก่อน)

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
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
  v_slots jsonb;
begin
  if p_count is null or p_count < 1 or p_count > c_max_count then raise exception 'INVALID_COUNT'; end if;
  select r.branch_active, r.procedure_id, r.dur * p_count into v_active, v_proc, v_dur
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
  c_max_upcoming int := 2;
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
  v_upcoming int;
  v_clash record;
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

  select r.branch_active, r.procedure_id, r.promo_id, r.price, r.dur * p_count, r.promo_name
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

  perform pg_advisory_xact_lock(hashtextextended('online-booking-phone:' || v_digits, 0));
  select count(*) into v_upcoming
    from public.queues q
   where q.recorded_by = v_staff and q.phone = v_digits and q.date >= v_today
     and q.archived_at is null
     and coalesce(q.status, 'pending') not in ('cancelled', 'no_show', 'rescheduled', 'done');
  if v_upcoming >= c_max_upcoming then
    return jsonb_build_object('success', false, 'error_code', 'TOO_MANY_BOOKINGS');
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
    '[จองออนไลน์]' || case when p_count > 1 then ' คูปอง ' || p_count || ' ใบ' else '' end
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
    'branch', v_branch_name, 'service', v_promo_name, 'count', p_count,
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
