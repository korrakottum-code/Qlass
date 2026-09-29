-- คูปอง: ออกเป็นล็อต + ตัดใช้ที่สาขา (1 ใบใช้ได้หลายครั้งตาม total_uses)
--
-- ความปลอดภัย: ตารางมีชื่อ/เบอร์ลูกค้า จึงปิดจากคีย์หน้าเว็บตั้งแต่วันแรก (RLS เปิด ไม่มี policy + ถอนสิทธิ์)
-- ทุกการอ่าน/เขียนผ่าน Edge Function staff-session (ตรวจ role ฝั่งเซิร์ฟเวอร์) ซึ่งเรียกฟังก์ชันด้านล่างด้วย service_role
-- ฟังก์ชันทั้งหมดถอนสิทธิ์จาก public/anon/authenticated ไม่ให้เรียกตรงจากเบราว์เซอร์
--
-- ย้อนกลับ: drop function public.coupon_generate_v1, coupon_lookup_v1, coupon_redeem_v1, coupon_revert_v1,
--           coupon_cancel_v1, coupon_list_v1; drop table public.coupon_redemptions, public.coupons, public.coupon_counters, public.coupon_batches;

create table if not exists public.coupons (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique check (code = upper(code) and length(code) between 4 and 40),
  name          text not null check (length(btrim(name)) between 1 and 120),
  category      text not null default '',
  price         numeric(12,2) not null default 0 check (price >= 0),
  total_uses    integer not null default 1 check (total_uses between 1 and 999),
  used_count    integer not null default 0,
  expiry_date   date not null,
  cancelled_at  timestamptz,
  customer_name  text,
  customer_phone text,
  note          text,
  batch_id      uuid,
  created_by    uuid references public.staff(id) on delete set null,
  created_at    timestamptz not null default now(),
  check (used_count between 0 and total_uses)
);

create index if not exists coupons_created_idx on public.coupons (created_at desc);
create index if not exists coupons_batch_idx   on public.coupons (batch_id);
create index if not exists coupons_phone_idx   on public.coupons (customer_phone) where customer_phone is not null;

-- ค้นหาแบบ "มีข้อความนี้อยู่ตรงไหนก็ได้" (ILIKE '%x%') ที่หลักแสนใบ: ไม่มีดัชนี = ไล่ทุกแถว ~1.5-3 วินาทีต่อครั้ง (วัดที่ 300,000 ใบ)
-- ดัชนี trigram ทำให้ค้นด้วยรหัสบางส่วน ชื่อโปร ชื่อลูกค้า เบอร์ ได้จากดัชนี
create extension if not exists pg_trgm with schema extensions;
create index if not exists coupons_code_trgm_idx  on public.coupons using gin (code extensions.gin_trgm_ops);
create index if not exists coupons_name_trgm_idx  on public.coupons using gin (name extensions.gin_trgm_ops);
create index if not exists coupons_cname_trgm_idx on public.coupons using gin (customer_name extensions.gin_trgm_ops) where customer_name is not null;
create index if not exists coupons_phone_trgm_idx on public.coupons using gin (customer_phone extensions.gin_trgm_ops) where customer_phone is not null;

create table if not exists public.coupon_redemptions (
  id            uuid primary key default gen_random_uuid(),
  coupon_id     uuid not null references public.coupons(id) on delete restrict,
  branch_id     text,
  branch_name   text not null default '',
  staff_id      uuid references public.staff(id) on delete set null,
  staff_name    text not null default '',
  note          text,
  redeemed_at   timestamptz not null default now(),
  reverted_at   timestamptz,
  reverted_by_name text
);

create index if not exists coupon_redemptions_coupon_idx on public.coupon_redemptions (coupon_id, redeemed_at desc);
create index if not exists coupon_redemptions_time_idx   on public.coupon_redemptions (redeemed_at desc);

alter table public.coupons enable row level security;
alter table public.coupon_redemptions enable row level security;
revoke all on table public.coupons, public.coupon_redemptions from anon, authenticated;

-- สถานะที่แสดง: cancelled > used_up > expired > active
create or replace function public.coupon_status(c public.coupons)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when c.cancelled_at is not null then 'cancelled'
    when c.used_count >= c.total_uses then 'used_up'
    when c.expiry_date < (now() at time zone 'Asia/Bangkok')::date then 'expired'
    else 'active'
  end;
$$;

create or replace function public.coupon_json(c public.coupons)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'id', c.id, 'code', c.code, 'name', c.name, 'category', c.category, 'price', c.price,
    'totalUses', c.total_uses, 'usedCount', c.used_count, 'remaining', c.total_uses - c.used_count,
    'expiryDate', c.expiry_date, 'status', public.coupon_status(c),
    'customerName', c.customer_name, 'customerPhone', c.customer_phone, 'note', c.note,
    'createdAt', c.created_at,
    'redemptions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'branchName', r.branch_name, 'staffName', r.staff_name, 'note', r.note,
        'redeemedAt', r.redeemed_at, 'revertedAt', r.reverted_at) order by r.redeemed_at desc)
      from public.coupon_redemptions r where r.coupon_id = c.id), '[]'::jsonb)
  );
$$;

-- ตัวนับเลขรันต่อหมวด POS (D1, T2, S2, O1 ...): ทุกคูปองในหมวดเดียวกันใช้เลขต่อกัน ไม่ว่าราคา/ชื่อโปรจะต่างกัน
-- เช่น Botox ทุกราคา = D1-0000001, D1-0000002 ... ตัวนับอัปเดตในทรานแซกชันเดียวกับการออกล็อต
create table if not exists public.coupon_counters (
  prefix  text primary key,
  last_no bigint not null default 0
);
alter table public.coupon_counters enable row level security;
revoke all on table public.coupon_counters from anon, authenticated;

-- ล็อตที่ออก: จำช่วงเลข/ราคา/ชื่อของแต่ละครั้ง (เช่น D1-0000001 ถึง D1-0000500 = 990 บาท)
-- ให้ดูรายการล็อตได้เร็วโดยไม่ต้องรวมจากคูปองหลักแสนใบ
create table if not exists public.coupon_batches (
  id           uuid primary key,
  prefix       text not null,
  first_no     bigint not null,
  last_no      bigint not null,
  name         text not null,
  category     text not null default '',
  price        numeric(12,2) not null,
  total_uses   integer not null,
  expiry_date  date not null,
  quantity     integer not null,
  note         text,
  created_by   uuid references public.staff(id) on delete set null,
  cancelled_at timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists coupon_batches_created_idx on public.coupon_batches (created_at desc);
alter table public.coupon_batches enable row level security;
revoke all on table public.coupon_batches from anon, authenticated;

-- ออกล็อต: รหัส = หมวด POS + "-" + เลขรัน 7 หลัก (รองรับหมวดละ 9,999,999 ใบ)
-- จองช่วงเลขด้วย upsert แถวเดียว (ล็อกแถวนี้ทำให้ 2 คนออกล็อตหมวดเดียวกันพร้อมกันไม่ได้เลขซ้ำ)
-- ถ้าขั้นไหนพัง ทรานแซกชันย้อนทั้งหมด ตัวนับไม่ข้ามเลข
create or replace function public.coupon_generate_v1(
  p_actor_staff_id uuid,
  p_name text, p_category text, p_price numeric, p_total_uses int,
  p_expiry_date date, p_quantity int, p_prefix text,
  p_customer_name text default null, p_customer_phone text default null, p_note text default null,
  p_start_after bigint default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text := upper(btrim(coalesce(p_prefix, '')));
  v_batch uuid := gen_random_uuid();
  v_end bigint;
  v_start bigint;
begin
  if p_quantity is null or p_quantity < 1 or p_quantity > 20000 then raise exception 'invalid_quantity'; end if;
  -- p_start_after = "เคยออกมาถึงเลขนี้แล้ว (เช่นออกไว้ก่อนใช้ระบบนี้)" ตัวนับจะข้ามไปต่อจากเลขนั้น แต่ไม่มีวันถอยหลัง
  if p_start_after is not null and (p_start_after < 0 or p_start_after > 9999999) then raise exception 'invalid_start'; end if;
  if p_total_uses is null or p_total_uses < 1 or p_total_uses > 999 then raise exception 'invalid_uses'; end if;
  -- หมวดตามคู่มือรหัส POS v6.2: T1-T4,T99 / D1-D10,D99 / S1,S2 / O1-O4,O9
  if v_prefix !~ '^(T([1-4]|99)|D([1-9]|10|99)|S[12]|O[12349])$' then raise exception 'invalid_prefix'; end if;
  if p_expiry_date is null or p_expiry_date < (now() at time zone 'Asia/Bangkok')::date then raise exception 'invalid_expiry'; end if;
  if p_price is null or p_price < 0 then raise exception 'invalid_price'; end if;
  if p_name is null or length(btrim(p_name)) = 0 then raise exception 'invalid_name'; end if;

  insert into public.coupon_counters as k (prefix, last_no) values (v_prefix, coalesce(p_start_after, 0) + p_quantity)
  on conflict (prefix) do update set last_no = greatest(k.last_no, coalesce(p_start_after, 0)) + p_quantity
  returning last_no into v_end;
  v_start := v_end - p_quantity + 1;
  if v_end > 9999999 then raise exception 'prefix_exhausted'; end if;

  insert into public.coupon_batches (id, prefix, first_no, last_no, name, category, price, total_uses,
                                     expiry_date, quantity, note, created_by)
  values (v_batch, v_prefix, v_start, v_end, btrim(p_name), coalesce(p_category, ''), p_price, p_total_uses,
          p_expiry_date, p_quantity, nullif(btrim(p_note), ''), p_actor_staff_id);

  insert into public.coupons (code, name, category, price, total_uses, expiry_date,
                              customer_name, customer_phone, note, batch_id, created_by)
  select v_prefix || '-' || lpad(n::text, 7, '0'),
         btrim(p_name), coalesce(p_category, ''), p_price, p_total_uses, p_expiry_date,
         nullif(btrim(p_customer_name), ''), nullif(btrim(p_customer_phone), ''), nullif(btrim(p_note), ''),
         v_batch, p_actor_staff_id
    from generate_series(v_start, v_end) as n;

  return jsonb_build_object('batchId', v_batch, 'count', p_quantity, 'price', p_price,
                            'firstCode', v_prefix || '-' || lpad(v_start::text, 7, '0'),
                            'lastCode', v_prefix || '-' || lpad(v_end::text, 7, '0'));
end;
$$;

-- เลขล่าสุดที่ออกไปแล้วของแต่ละหมวด (ใช้แสดงตัวอย่างช่วงรหัสก่อนกดออกล็อต)
create or replace function public.coupon_counters_v1()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(prefix, last_no), '{}'::jsonb) from public.coupon_counters;
$$;

create or replace function public.coupon_lookup_v1(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare c public.coupons;
begin
  select * into c from public.coupons where code = upper(btrim(p_code));
  if not found then return null; end if;
  return public.coupon_json(c);
end;
$$;

-- ตัดใช้ 1 ครั้ง: ล็อกแถวก่อนเช็ค กัน 2 สาขาตัดครั้งสุดท้ายพร้อมกัน
create or replace function public.coupon_redeem_v1(
  p_actor_staff_id uuid, p_code text, p_branch_id text, p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.coupons;
  v_staff_name text;
  v_branch_name text;
begin
  select * into c from public.coupons where code = upper(btrim(p_code)) for update;
  if not found then raise exception 'coupon_not_found'; end if;

  case public.coupon_status(c)
    when 'cancelled' then raise exception 'coupon_cancelled';
    when 'used_up' then raise exception 'coupon_used_up';
    when 'expired' then raise exception 'coupon_expired';
    else null;
  end case;

  select name into v_staff_name from public.staff where id = p_actor_staff_id;
  select name into v_branch_name from public.branches where id::text = p_branch_id;
  if v_branch_name is null then raise exception 'invalid_branch'; end if;

  update public.coupons set used_count = used_count + 1 where id = c.id returning * into c;
  insert into public.coupon_redemptions (coupon_id, branch_id, branch_name, staff_id, staff_name, note)
  values (c.id, p_branch_id, v_branch_name, p_actor_staff_id, coalesce(v_staff_name, ''), nullif(btrim(p_note), ''));

  return public.coupon_json(c);
end;
$$;

-- ย้อนการตัดใช้ (แอดกดผิด) คืนสิทธิ์ 1 ครั้ง เก็บประวัติเดิมไว้ ไม่ลบแถว
create or replace function public.coupon_revert_v1(p_actor_staff_id uuid, p_redemption_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.coupon_redemptions;
  c public.coupons;
  v_name text;
begin
  select * into r from public.coupon_redemptions where id = p_redemption_id for update;
  if not found then raise exception 'redemption_not_found'; end if;
  if r.reverted_at is not null then raise exception 'already_reverted'; end if;

  select * into c from public.coupons where id = r.coupon_id for update;
  select name into v_name from public.staff where id = p_actor_staff_id;

  update public.coupon_redemptions set reverted_at = now(), reverted_by_name = coalesce(v_name, '') where id = r.id;
  update public.coupons set used_count = used_count - 1 where id = c.id returning * into c;
  return public.coupon_json(c);
end;
$$;

create or replace function public.coupon_cancel_v1(p_code text, p_cancel boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare c public.coupons;
begin
  update public.coupons
     set cancelled_at = case when p_cancel then coalesce(cancelled_at, now()) else null end
   where code = upper(btrim(p_code))
   returning * into c;
  if not found then raise exception 'coupon_not_found'; end if;
  return public.coupon_json(c);
end;
$$;

-- รายการแบบแบ่งหน้า: ค้นจากรหัส/ชื่อลูกค้า/เบอร์/ชื่อโปร
-- ตัวกรองสถานะเขียนเป็นเงื่อนไขตรง ๆ (ไม่เรียก coupon_status ทีละแถว — ที่ 300,000 ใบช้า ~2.7 วินาที) ต้องตรงกับ coupon_status:
--   ยกเลิก > ใช้แล้ว > หมดอายุ > ใช้ได้
create or replace function public.coupon_list_v1(
  p_search text default null, p_status text default 'all', p_limit int default 50, p_offset int default 0
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
  v_total int;
  v_rows jsonb;
begin
  select count(*) into v_total from public.coupons c
   where (p_status = 'all'
          or (p_status = 'cancelled' and c.cancelled_at is not null)
          or (p_status = 'used_up'   and c.cancelled_at is null and c.used_count >= c.total_uses)
          or (p_status = 'expired'   and c.cancelled_at is null and c.used_count < c.total_uses and c.expiry_date < v_today)
          or (p_status = 'active'    and c.cancelled_at is null and c.used_count < c.total_uses and c.expiry_date >= v_today))
     and (v_search is null
          or c.code ilike '%' || v_search || '%' or c.name ilike '%' || v_search || '%'
          or c.customer_name ilike '%' || v_search || '%' or c.customer_phone ilike '%' || v_search || '%');

  select coalesce(jsonb_agg(public.coupon_json(x) order by x.created_at desc, x.code), '[]'::jsonb) into v_rows
    from (select * from public.coupons c
           where (p_status = 'all'
                  or (p_status = 'cancelled' and c.cancelled_at is not null)
                  or (p_status = 'used_up'   and c.cancelled_at is null and c.used_count >= c.total_uses)
                  or (p_status = 'expired'   and c.cancelled_at is null and c.used_count < c.total_uses and c.expiry_date < v_today)
                  or (p_status = 'active'    and c.cancelled_at is null and c.used_count < c.total_uses and c.expiry_date >= v_today))
             and (v_search is null
                  or c.code ilike '%' || v_search || '%' or c.name ilike '%' || v_search || '%'
                  or c.customer_name ilike '%' || v_search || '%' or c.customer_phone ilike '%' || v_search || '%')
           order by c.created_at desc, c.code
           limit v_limit offset v_offset) x;

  return jsonb_build_object('total', v_total, 'coupons', v_rows);
end;
$$;

create or replace function public.coupon_batches_v1(p_limit int default 100, p_offset int default 0)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'total', (select count(*) from public.coupon_batches),
    'batches', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'prefix', b.prefix,
        'firstCode', b.prefix || '-' || lpad(b.first_no::text, 7, '0'),
        'lastCode',  b.prefix || '-' || lpad(b.last_no::text, 7, '0'),
        'name', b.name, 'category', b.category, 'price', b.price, 'totalUses', b.total_uses, 'expiryDate', b.expiry_date,
        'quantity', b.quantity, 'note', b.note, 'cancelledAt', b.cancelled_at, 'createdAt', b.created_at) order by b.created_at desc)
      from (select * from public.coupon_batches order by created_at desc
             limit least(greatest(coalesce(p_limit, 100), 1), 200) offset greatest(coalesce(p_offset, 0), 0)) b), '[]'::jsonb));
$$;

-- ยกเลิก/กู้คืนทั้งล็อต (ออกล็อตผิด): ยกเลิกเฉพาะใบที่ยังไม่เคยถูกใช้ ใบที่ตัดไปแล้วไม่ถูกแตะ
-- ประทับเวลายกเลิกของล็อตลงบนคูปองที่ถูกยกเลิกด้วยค่าเดียวกัน ตอนกู้คืนจึงคืนเฉพาะใบที่ล็อตนี้ยกเลิกเอง
-- (ใบที่ถูกยกเลิกรายใบมาก่อนหน้าจะไม่ถูกกู้คืนตาม)
create or replace function public.coupon_cancel_batch_v1(p_batch_id uuid, p_cancel boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.coupon_batches;
  v_now timestamptz := now();
  v_changed int;
  v_used int;
begin
  select * into b from public.coupon_batches where id = p_batch_id for update;
  if not found then raise exception 'batch_not_found'; end if;

  if p_cancel then
    if b.cancelled_at is not null then raise exception 'batch_already_cancelled'; end if;
    update public.coupons set cancelled_at = v_now
     where batch_id = b.id and cancelled_at is null and used_count = 0;
    get diagnostics v_changed = row_count;
    update public.coupon_batches set cancelled_at = v_now where id = b.id;
  else
    if b.cancelled_at is null then raise exception 'batch_not_cancelled'; end if;
    update public.coupons set cancelled_at = null where batch_id = b.id and cancelled_at = b.cancelled_at;
    get diagnostics v_changed = row_count;
    update public.coupon_batches set cancelled_at = null where id = b.id;
  end if;

  select count(*) into v_used from public.coupons where batch_id = b.id and used_count > 0;
  return jsonb_build_object('changed', v_changed, 'usedKept', v_used, 'cancelled', p_cancel);
end;
$$;

-- สถิติคูปอง: รวมตัวเลขในฐานข้อมูล ส่งเฉพาะผลสรุป (ไม่ดึงคูปองหลักแสนใบลงเครื่อง)
-- สถานะจัดกลุ่มแบบเดียวกับ coupon_status: ยกเลิก > ใช้แล้ว > หมดอายุ > ใช้ได้ (ทุกใบอยู่ในกลุ่มเดียวเท่านั้น รวมแล้วเท่ากับที่ออก)
-- ส่วน "ตัดในช่วงวัน" (สาขา/รายวัน) นับจากประวัติการตัดที่ไม่ถูกย้อน ตามวันเวลาไทย
create or replace function public.coupon_stats_v1(p_from date default null, p_to date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
  v_from date := coalesce(p_from, (now() at time zone 'Asia/Bangkok')::date - 29);
  v_to date := coalesce(p_to, (now() at time zone 'Asia/Bangkok')::date);
  v_ts_from timestamptz;
  v_ts_to timestamptz;
  v_totals jsonb;
  v_products jsonb;
  v_branches jsonb;
  v_days jsonb;
  v_expiring jsonb;
begin
  if v_to < v_from or v_to - v_from > 365 then raise exception 'invalid_range'; end if;
  v_ts_from := v_from::timestamp at time zone 'Asia/Bangkok';
  v_ts_to := (v_to + 1)::timestamp at time zone 'Asia/Bangkok';

  select jsonb_build_object(
    'issued', count(*),
    'issuedValue', coalesce(sum(price), 0),
    'used', count(*) filter (where cancelled_at is null and used_count >= total_uses),
    'usedValue', coalesce(sum(price) filter (where cancelled_at is null and used_count >= total_uses), 0),
    'active', count(*) filter (where cancelled_at is null and used_count < total_uses and expiry_date >= v_today),
    'activeValue', coalesce(sum(price) filter (where cancelled_at is null and used_count < total_uses and expiry_date >= v_today), 0),
    'expired', count(*) filter (where cancelled_at is null and used_count < total_uses and expiry_date < v_today),
    'expiredValue', coalesce(sum(price) filter (where cancelled_at is null and used_count < total_uses and expiry_date < v_today), 0),
    'cancelled', count(*) filter (where cancelled_at is not null),
    'expiringSoon', count(*) filter (where cancelled_at is null and used_count < total_uses and expiry_date between v_today and v_today + 30),
    'expiringSoonValue', coalesce(sum(price) filter (where cancelled_at is null and used_count < total_uses and expiry_date between v_today and v_today + 30), 0)
  ) into v_totals from public.coupons;

  select coalesce(jsonb_agg(to_jsonb(p) order by p."issued" desc, p."name"), '[]'::jsonb) into v_products
    from (
      select split_part(code, '-', 1) as "prefix", name as "name", price as "price",
             count(*)::int as "issued",
             (count(*) filter (where cancelled_at is null and used_count >= total_uses))::int as "used",
             (count(*) filter (where cancelled_at is null and used_count < total_uses and expiry_date >= v_today))::int as "active",
             (count(*) filter (where cancelled_at is null and used_count < total_uses and expiry_date < v_today))::int as "expired",
             (count(*) filter (where cancelled_at is not null))::int as "cancelled"
        from public.coupons
       group by 1, 2, 3
       order by count(*) desc
       limit 200
    ) p;

  select coalesce(jsonb_agg(to_jsonb(b) order by b."count" desc, b."branchName"), '[]'::jsonb) into v_branches
    from (
      select r.branch_name as "branchName", count(*)::int as "count", coalesce(sum(c.price), 0) as "value"
        from public.coupon_redemptions r
        join public.coupons c on c.id = r.coupon_id
       where r.reverted_at is null and r.redeemed_at >= v_ts_from and r.redeemed_at < v_ts_to
       group by r.branch_name
    ) b;

  select coalesce(jsonb_agg(jsonb_build_object('date', d.day, 'count', coalesce(x.n, 0), 'value', coalesce(x.v, 0)) order by d.day), '[]'::jsonb)
    into v_days
    from (select g::date as day from generate_series(v_from::timestamp, v_to::timestamp, interval '1 day') g) d
    left join (
      select (r.redeemed_at at time zone 'Asia/Bangkok')::date as day, count(*)::int as n, sum(c.price) as v
        from public.coupon_redemptions r
        join public.coupons c on c.id = r.coupon_id
       where r.reverted_at is null and r.redeemed_at >= v_ts_from and r.redeemed_at < v_ts_to
       group by 1
    ) x on x.day = d.day;

  -- ใช้ได้อยู่แต่ใกล้หมดอายุ (ภายใน 30 วัน) เรียงจากใกล้สุด
  select coalesce(jsonb_agg(to_jsonb(e) order by e."expiryDate", e."name"), '[]'::jsonb) into v_expiring
    from (
      select split_part(code, '-', 1) as "prefix", name as "name", price as "price",
             expiry_date as "expiryDate", count(*)::int as "count"
        from public.coupons
       where cancelled_at is null and used_count < total_uses and expiry_date between v_today and v_today + 30
       group by 1, 2, 3, 4
       order by expiry_date, name
       limit 50
    ) e;

  return jsonb_build_object('from', v_from, 'to', v_to, 'today', v_today, 'totals', v_totals,
                            'products', v_products, 'branches', v_branches, 'days', v_days, 'expiring', v_expiring);
end;
$$;

revoke all on function public.coupon_status(public.coupons), public.coupon_json(public.coupons) from public, anon, authenticated;
revoke all on function
  public.coupon_generate_v1(uuid, text, text, numeric, int, date, int, text, text, text, text, bigint),
  public.coupon_counters_v1(),
  public.coupon_lookup_v1(text),
  public.coupon_redeem_v1(uuid, text, text, text),
  public.coupon_revert_v1(uuid, uuid),
  public.coupon_cancel_v1(text, boolean),
  public.coupon_cancel_batch_v1(uuid, boolean),
  public.coupon_stats_v1(date, date),
  public.coupon_list_v1(text, text, int, int),
  public.coupon_batches_v1(int, int)
  from public, anon, authenticated;
