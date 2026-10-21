-- ค่าโฆษณารายวัน: เก็บสำเนาไว้ใน Qlass เอง การ์ดในหน้าสรุปอ่านจากตารางนี้ (เร็ว) ไม่ต้องรอ Meta/Korrakot-DB ทุกครั้ง
--
-- ทำไม: ฟังก์ชัน ads-spend เดิมยิงไป Korrakot-DB (ซึ่งต้องไปดึง Meta ทุกบัญชี) ทุกครั้งที่เปิดการ์ด ช้า 3-25 วินาที
-- และล้ม (504) ได้เมื่อคำขอแรกหลังเงียบนาน ตัวเลขรายวันเก่าแทบไม่เปลี่ยน จึงดึงมาเก็บไว้แล้วดึงใหม่เฉพาะ 7 วันล่าสุดวันละหลายรอบ
--
-- ความปลอดภัย: ไม่มีข้อมูลลูกค้า แต่เป็นตัวเลขงบโฆษณาทั้งเครือ จึงปิดจากคีย์หน้าเว็บตั้งแต่วันแรก
-- (RLS เปิด ไม่มี policy + ถอนสิทธิ์) อ่าน/เขียนผ่าน Edge Function ads-spend-cache ด้วย service_role เท่านั้น
-- ฟังก์ชันทั้งหมดถอนสิทธิ์จาก public/anon/authenticated ไม่ให้เรียกตรงจากเบราว์เซอร์
--
-- ไม่แตะตารางเดิมใดเลย ย้อนกลับได้ด้วยการลบของใหม่ทั้งหมด:
--   drop function public.ad_spend_lease_v1(integer), public.ad_spend_save_v1(jsonb, date), public.ad_spend_fail_v1(text);
--   drop table public.ad_spend_daily, public.ad_spend_sync_state;

create table if not exists public.ad_spend_daily (
  day        date primary key,
  spend      numeric(14,2) not null check (spend >= 0),
  updated_at timestamptz not null default now()
);

-- แถวเดียว (id = global): ดึงสำเร็จล่าสุดเมื่อไร / ลองล่าสุดเมื่อไร / ข้อมูลครอบคลุมตั้งแต่วันไหน
create table if not exists public.ad_spend_sync_state (
  id              text primary key default 'global' check (id = 'global'),
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error      text,
  backfilled_from date
);

insert into public.ad_spend_sync_state (id) values ('global') on conflict (id) do nothing;

alter table public.ad_spend_daily enable row level security;
alter table public.ad_spend_sync_state enable row level security;
revoke all on table public.ad_spend_daily, public.ad_spend_sync_state from anon, authenticated;
grant all on table public.ad_spend_daily, public.ad_spend_sync_state to service_role;

-- ขอสิทธิ์ดึงข้อมูล: ได้ได้ก็ต่อเมื่อรอบก่อนหน้าผ่านมานานกว่า p_ttl_seconds กันหลายเครื่องยิง Korrakot-DB พร้อมกัน
-- และกันยิงซ้ำรัว ๆ เมื่อดึงล้มเหลว
create or replace function public.ad_spend_lease_v1(p_ttl_seconds integer)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_n integer;
begin
  if p_ttl_seconds is null or p_ttl_seconds < 10 or p_ttl_seconds > 3600 then
    raise exception using errcode = 'P0001', message = 'invalid_ttl';
  end if;

  update public.ad_spend_sync_state
     set last_attempt_at = now()
   where id = 'global'
     and (last_attempt_at is null or last_attempt_at < now() - make_interval(secs => p_ttl_seconds));
  get diagnostics v_n = row_count;
  return v_n > 0;
end
$$;

-- บันทึกยอดรายวันที่ดึงมา (เขียนทับวันเดิม) แล้วอัปเดตสถานะ
-- กันศูนย์ทับข้อมูลดี: วันที่เคยมียอดมากกว่า 0 แล้วรอบใหม่ตอบ 0 ไม่เขียนทับ (Meta เคยตอบ ~0 ผิดปกติ ดู Korrakot-DB #68)
-- p_backfilled_from = วันแรกของช่วงที่ดึงครบแล้วเท่านั้น (ใส่เฉพาะตอนดึงย้อนหลัง) เก็บค่าที่เก่าที่สุดไว้
create or replace function public.ad_spend_save_v1(p_rows jsonb, p_backfilled_from date)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_n integer;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 400 then
    raise exception using errcode = 'P0001', message = 'invalid_rows';
  end if;

  insert into public.ad_spend_daily as t (day, spend, updated_at)
  select distinct on (r.day) r.day, r.spend, now()
    from (
      select (e->>'day')::date as day, round((e->>'spend')::numeric, 2) as spend
        from jsonb_array_elements(p_rows) e
       where (e->>'day') ~ '^\d{4}-\d{2}-\d{2}$'
    ) r
   order by r.day
  on conflict (day) do update
     set spend = excluded.spend, updated_at = now()
   where not (excluded.spend = 0 and t.spend > 0);
  get diagnostics v_n = row_count;

  update public.ad_spend_sync_state
     set last_success_at = now(),
         last_error = null,
         backfilled_from = case
           when p_backfilled_from is null then backfilled_from
           when backfilled_from is null then p_backfilled_from
           else least(backfilled_from, p_backfilled_from)
         end
   where id = 'global';

  return v_n;
end
$$;

create or replace function public.ad_spend_fail_v1(p_error text)
returns void
language sql
set search_path = public
as $$
  update public.ad_spend_sync_state
     set last_error = left(coalesce(p_error, ''), 200)
   where id = 'global';
$$;

revoke all on function public.ad_spend_lease_v1(integer), public.ad_spend_save_v1(jsonb, date), public.ad_spend_fail_v1(text)
  from public, anon, authenticated;
grant execute on function public.ad_spend_lease_v1(integer), public.ad_spend_save_v1(jsonb, date), public.ad_spend_fail_v1(text)
  to service_role;
