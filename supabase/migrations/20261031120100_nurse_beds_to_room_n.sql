-- เปลี่ยนเตียงพยาบาลเดิม (M ที่ล็อกไว้ให้ทำ Drip / ปากกาลดน้ำหนัก) เป็นห้อง N
-- และให้หัตถการที่เตียงเหล่านั้นรับ ลงห้อง N ได้
--
-- ═══ ที่มา ═══
-- เจ้าของ (31 ต.ค. 2569): ต่อไปห้อง M = ห้องแพทย์อย่างเดียว งาน Drip / ปากกาลดน้ำหนักเป็นของห้องพยาบาล N
-- กติกาที่เจ้าของให้: เตียง M ที่ล็อกไว้ให้รับ ดริปผิว (วิตามินผิว / Go-ดริปผิว) กับ ปากกาลดน้ำหนัก = ห้อง N
--
-- ข้อมูลจริง ณ 31 ต.ค. 2569 (ตรวจแล้ว):
--   - เตียง M ที่ตั้งล็อกไว้มี 33 เตียง สาขาละ 1 เตียง ทุกเตียงล็อกแค่ วิตามินผิว/Go-ดริปผิว,
--     ปากกาลดน้ำหนัก (บางเตียงไม่มี) และหัตถการกลาง (Influencer, ปรึกษาทั่วไป, โปรประจำเดือน)
--   - เตียงหมอทั้งหมดไม่ได้ล็อก จึงไม่โดนกติกานี้
--   - คิวล่วงหน้าบน 33 เตียงนี้มีแต่หัตถการในชุดข้างล่าง ไม่มีงานหมอปน
--
-- ═══ ทำไมหัตถการเป็น 'MN' ไม่ใช่ 'N' ล้วน ═══
-- วิตามินผิว / ปากกาลดน้ำหนัก ยังถูกจองบนเตียงหมอ (M01/M02) อยู่จริงหลายร้อยคิวล่วงหน้า
-- และมี 3 สาขา (ตรัง, ปลวกแดง, อยุธยา) ที่ไม่มีเตียงพยาบาลเลย ถ้าเป็น N ล้วน สาขาเหล่านั้นจะลง Drip ไม่ได้
-- และคิวบนเตียงหมอจะย้ายเตียงไม่ได้ — เอา M ออกเมื่อเจ้าของสั่ง หลังหน้าร้านย้ายงานเข้าห้อง N ครบแล้ว
--
-- ═══ ลงเมื่อไหร่ ═══
-- ต้องลงหลัง 20261031120000 และหลังจากเว็บเวอร์ชันที่รู้จักห้อง N (PR #235) ขึ้น production แล้ว
-- เหตุผล: หน้าเว็บเวอร์ชันเก่าเทียบ procedure.roomType === room.type ตรง ๆ ถ้าใครโหลดเว็บเก่า
-- หลังจากไฟล์นี้ลงไป หัตถการที่เป็น 'MN' จะหายจากเตียง M ที่ยังไม่ล็อก (78 เตียง)
-- และค้างอยู่อย่างนั้นจนกว่าจะรีเฟรช เพราะแอปไม่มีระบบรีโหลดเอง
-- (ตาราง rooms ส่ง Realtime ให้หน้าเว็บเก่าด้วย เว็บเก่าจะเห็นเตียงเป็น N แต่ระบายสีแบบ T — แค่หน้าตา)
--
-- เพิ่มเติมตามที่เจ้าของระบุเอง (31 ต.ค. 2569): Class ตรัง M03 และ Class อยุธยา M03 เป็นห้อง N ด้วย
-- (สองสาขานี้ยังไม่ได้ตั้งล็อกเตียง กติกาข้างบนจึงจับไม่ได้; คิวล่วงหน้ามีแค่วิตามินผิว ตรวจแล้ว)
-- Class ปลวกแดง เจ้าของสั่งไม่แตะ (มีเตียง M 2 เตียงที่ใช้ปนทั้งงานหมอและดริป)
--
-- ชื่อเตียง: เจ้าของให้เปลี่ยนเป็น N01 (ทุกสาขามีเตียงพยาบาลเตียงเดียว ตรวจแล้วไม่มีสาขาไหนได้ 2 เตียง
-- และยังไม่มีเตียงไหนชื่อขึ้นต้นด้วย N) — คิวเก่ายังเก็บป้าย '[M] M03' ไว้ใน room_label_snapshot ตามเดิม
-- เตียง M ที่เหลือมีเลขกระโดด (เช่น M01, M02, M04) ตัวตั้งชื่อในหน้าเว็บ (roomNaming.js) ใช้เลขสูงสุด + 1 จึงไม่ซ้ำ

set local lock_timeout = '3s';

-- 1) หัตถการที่ต้องลงห้อง N ได้: งานพยาบาล + หัตถการกลางที่อยู่ในล็อกของเตียงพยาบาล
update public.procedures
   set room_type = 'MN'
 where room_type = 'M'
   and name in (
     'วิตามินผิว', 'Go-ดริปผิว', 'ปากกาลดน้ำหนัก',
     'Influencer', 'ปรึกษาทั่วไป', 'โปรประจำเดือน'
   );

-- 2) เตียงพยาบาล: เตียง M ที่ล็อกไว้ ล็อกมีงานดริป และทุกหัตถการในล็อกอยู่ในชุดข้างบน
--    (เตียงที่มีหัตถการอื่นปนแม้ตัวเดียว ไม่แตะ)
do $$
declare
  v_nurse_set text[] := array[
    'วิตามินผิว', 'Go-ดริปผิว', 'ปากกาลดน้ำหนัก',
    'Influencer', 'ปรึกษาทั่วไป', 'โปรประจำเดือน'
  ];
  v_ids uuid[];
  -- เตียงที่เจ้าของระบุเอง: Class ตรัง M03, Class อยุธยา M03
  v_owner_named uuid[] := array[
    'c8ed446a-db7b-48b6-8e6a-53ae04867cef'::uuid,
    '3ada52d1-07c1-49eb-b1fc-c42d1d5cd906'::uuid
  ];
  v_owner_ok integer;
begin
  select coalesce(array_agg(r.id), '{}') into v_ids
  from public.rooms r
  where r.type = 'M'
    and exists (
      select 1 from public.room_procedures rp
      join public.procedures p on p.id = rp.procedure_id
      where rp.room_id = r.id and p.name in ('วิตามินผิว', 'Go-ดริปผิว')
    )
    and not exists (
      select 1 from public.room_procedures rp
      join public.procedures p on p.id = rp.procedure_id
      where rp.room_id = r.id and not (p.name = any (v_nurse_set))
    );

  -- กันพลาด: ตอนตรวจมี 33 เตียง ถ้าจำนวนไม่ตรง แปลว่าข้อมูลเปลี่ยนหลังตรวจ ให้หยุดทั้งไฟล์
  if coalesce(array_length(v_ids, 1), 0) <> 33 then
    raise exception 'nurse bed count changed: expected 33, found %', coalesce(array_length(v_ids, 1), 0);
  end if;

  -- เตียงที่เจ้าของระบุ ต้องยังเป็น M, ชื่อ M03 และอยู่สาขาตรัง/อยุธยา ตามที่ตรวจไว้ ไม่งั้นหยุดทั้งไฟล์
  select count(*) into v_owner_ok
  from public.rooms r
  join public.branches b on b.id = r.branch_id
  where r.id = any (v_owner_named)
    and r.type = 'M'
    and r.name = 'M03'
    and b.name in ('Class ตรัง', 'Class อยุธยา');
  if v_owner_ok <> 2 then
    raise exception 'owner-named nurse beds changed: expected 2, found %', v_owner_ok;
  end if;

  -- สาขาละไม่เกิน 1 เตียง ไม่งั้นชื่อ N01 จะซ้ำในสาขา
  if exists (
    select 1 from public.rooms r where r.id = any (v_ids || v_owner_named)
    group by r.branch_id having count(*) > 1
  ) then
    raise exception 'a branch has more than one nurse bed; N01 would repeat';
  end if;
  if exists (
    select 1 from public.rooms r
    where r.branch_id in (select branch_id from public.rooms where id = any (v_ids || v_owner_named))
      and upper(r.name) = 'N01'
  ) then
    raise exception 'a branch already has a bed named N01';
  end if;

  update public.rooms set type = 'N', name = 'N01' where id = any (v_ids || v_owner_named);
end
$$;
