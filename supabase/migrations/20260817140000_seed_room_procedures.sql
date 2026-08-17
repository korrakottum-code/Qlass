-- ตั้งค่าผังเครื่องต่อเตียงครบทั้ง 29 สาขา (เจ้าของยืนยันทางโทรศัพท์ 2026-08-17)
--
-- ที่มา: อ่านผังจากโน้ตในหน้า "ตารางห้อง/เครื่อง" ที่หน้าร้านพิมพ์ไว้เอง แล้วให้เจ้าของ
-- ยืนยันรายสาขาผ่านฟอร์ม 13 ข้อ + โทรเคลียร์อีกรอบสำหรับสาขาที่ข้อมูลกับโน้ตไม่ตรงกัน
--
-- ═══ กติกาที่ผังนี้ยึด ═══
-- ล็อกสองทาง: เตียง D/T ไม่รับ Hifu/Pico และเตียง Hifu/Pico ก็ไม่รับงาน D/T ล้น
-- ยกเว้นหัตถการกลางที่ไม่ผูกกับเครื่อง ใส่ให้ทุกเตียง — ปิดคิว / โปรประจำเดือน (T) /
-- Influencer  ("ปิดคิว" คือตัวปิดช่องเวลา ไม่ใช่หัตถการ ถ้าไม่ใส่หน้าร้านจะปิดช่องไม่ได้)
--
-- ข้อมูลเดือน ส.ค. มีคิว Hifu/Pico ที่ยังลงเตียง D/T อยู่ราว 8% ของทั้งเครือ — นั่นคือ
-- พฤติกรรมช่วงเปลี่ยนผ่านที่ตั้งใจจะเลิก ไม่ใช่ข้อยกเว้นที่ต้องรองรับ คิวเก่าไม่ถูกแตะ
-- เพราะฝั่งแอปสกรีนเฉพาะการวางคิวใหม่ (ดู shouldEnforceOnSave ใน roomProcedures.js)
--
-- ═══ สาขาที่ตัดสินใจต่างจากที่โน้ตเขียน ═══
--   นครพนม   T02 = Hifu ตามโน้ต แม้ข้อมูลจะมี Diode ลง T02 หนัก (ความเคยชินเดิม ให้เลิก)
--            หมายเหตุความจุ: งาน D/T ที่เคยลง T02 ~470 คิว/12 วัน ต้องไปกอง T01 ที่เดียว
--            ซึ่งเกือบเต็มเวลาเปิดเตียง ถ้าหน้าร้านบ่นเรื่องคิวไม่พอ ให้ดูจุดนี้ก่อน
--   สกลนคร   เคสเดียวกับนครพนม
--   Class Go ทั้ง 3 สาขายังไม่ได้แยกเครื่องจริงหน้าร้าน (T03/T04 กังสดาลแทบไม่มีคิว)
--            เจ้าของสั่งให้ตั้งค่าไว้เลยตามผังที่ควรจะเป็น
--
-- Rollback:  delete from public.room_procedures;

begin;

with layout(branch_name, room_name, role) as (values
  ('Class กาฬสินธุ์','T01','DT'),('Class กาฬสินธุ์','T02','DT'),('Class กาฬสินธุ์','T03','HIFU'),('Class กาฬสินธุ์','T04','PICO'),
  ('Class โคราช','T01','DT'),('Class โคราช','T02','DT'),('Class โคราช','T03','DT'),('Class โคราช','T04','HIFU'),('Class โคราช','T05','PICO'),
  ('Class จันทบุรี','T01','DT'),('Class จันทบุรี','T02','HIFU'),('Class จันทบุรี','T03','PICO'),
  ('Class ฉะเชิงเทรา','T01','DT'),('Class ฉะเชิงเทรา','T02','DT'),('Class ฉะเชิงเทรา','T03','HIFU'),('Class ฉะเชิงเทรา','T04','PICO'),
  ('Class ชัยภูมิ','T01','DT'),('Class ชัยภูมิ','T02','HIFUPICO'),
  ('Class เชียงราย','T01','DT'),('Class เชียงราย','T02','DT'),('Class เชียงราย','T03','HIFU'),('Class เชียงราย','T04','PICO'),
  ('Class นครพนม','T01','DT'),('Class นครพนม','T02','HIFU'),('Class นครพนม','T03','PICO'),
  ('Class บ่อวิน','T01','DT'),('Class บ่อวิน','T02','DT'),('Class บ่อวิน','T03','HIFU'),('Class บ่อวิน','T04','PICO'),
  ('Class บางแสน','T01','DT'),('Class บางแสน','T02','DT'),('Class บางแสน','T03','DT'),('Class บางแสน','T04','HIFU'),('Class บางแสน','T05','PICO'),
  ('Class บุรีรัมย์','T01','DT'),('Class บุรีรัมย์','T02','DT'),('Class บุรีรัมย์','T03','HIFU'),('Class บุรีรัมย์','T04','PICO'),
  ('Class ฟิวเจอร์พาร์ครังสิต','T01','DT'),('Class ฟิวเจอร์พาร์ครังสิต','T02','DT'),('Class ฟิวเจอร์พาร์ครังสิต','T03','DT'),('Class ฟิวเจอร์พาร์ครังสิต','T04','DT'),('Class ฟิวเจอร์พาร์ครังสิต','T05','HIFU'),('Class ฟิวเจอร์พาร์ครังสิต','T06','PICO'),
  ('Class ยูเนี่ยนมอลล์ลาดพร้าว','T01','DT'),('Class ยูเนี่ยนมอลล์ลาดพร้าว','T02','DT'),('Class ยูเนี่ยนมอลล์ลาดพร้าว','T03','DT'),('Class ยูเนี่ยนมอลล์ลาดพร้าว','T04','HIFU'),('Class ยูเนี่ยนมอลล์ลาดพร้าว','T05','PICO'),
  ('Class ร้อยเอ็ด','T01','DT'),('Class ร้อยเอ็ด','T02','DT'),('Class ร้อยเอ็ด','T03','HIFU'),('Class ร้อยเอ็ด','T04','PICO'),
  ('Class ระยอง','T01','DT'),('Class ระยอง','T02','DT'),('Class ระยอง','T03','HIFU'),('Class ระยอง','T04','PICO'),
  ('Class ลาดกระบัง','T01','DT'),('Class ลาดกระบัง','T02','HIFU'),('Class ลาดกระบัง','T03','PICO'),
  ('Class เลย','T01','DT'),('Class เลย','T02','HIFUPICO'),
  ('Class ศรีสะเกษ','T01','DT'),('Class ศรีสะเกษ','T02','HIFUPICO'),
  ('Class สกลนคร','T01','DT'),('Class สกลนคร','T02','HIFU'),('Class สกลนคร','T03','PICO'),
  ('Class สหพัฒน์','T01','DT'),('Class สหพัฒน์','T02','DT'),('Class สหพัฒน์','T03','HIFU'),('Class สหพัฒน์','T04','PICO'),
  ('Class สารคาม','T01','DT'),('Class สารคาม','T02','HIFU'),('Class สารคาม','T03','PICO'),
  ('Class สุรินทร์','T01','DT'),('Class สุรินทร์','T02','HIFU'),('Class สุรินทร์','T03','PICO'),
  ('Class หนองคาย','T01','DT'),('Class หนองคาย','T02','DT'),('Class หนองคาย','T03','HIFU'),('Class หนองคาย','T04','PICO'),
  ('Class หอกาญ','T01','DT'),('Class หอกาญ','T02','DT'),('Class หอกาญ','T03','HIFU'),('Class หอกาญ','T04','PICO'),
  ('Class อมตะ','T01','DT'),('Class อมตะ','T02','DT'),('Class อมตะ','T03','DT'),('Class อมตะ','T04','HIFU'),('Class อมตะ','T05','PICO'),
  ('Class อุดร','T01','DT'),('Class อุดร','T02','DT'),('Class อุดร','T03','DT'),('Class อุดร','T04','HIFU'),('Class อุดร','T05','PICO'),
  ('Class อุบล','T01','DT'),('Class อุบล','T02','DT'),('Class อุบล','T03','HIFU'),('Class อุบล','T04','PICO'),
  ('Class Go กังสดาล','T01','DT'),('Class Go กังสดาล','T02','DT'),('Class Go กังสดาล','T03','HIFU'),('Class Go กังสดาล','T04','PICO'),
  ('Class Go ชุมแพ','T01','DT'),('Class Go ชุมแพ','T02','HIFUPICO'),
  ('Class Go บางพลี','T01','DT'),('Class Go บางพลี','T02','HIFUPICO')
),
-- แบ่งหัตถการฝั่ง T เป็น 4 กลุ่ม. ANY ใส่ให้ทุกเตียง ส่วนที่เหลือใส่ตามบทบาทของเตียง
-- (จับด้วยชื่อ + room_type='T' เพราะ "ปิดคิว" กับ "Influencer" มีทั้งเวอร์ชัน M และ T)
proc_group as (
  select p.id, p.name,
    case
      when p.name in ('ปิดคิว','โปรประจำเดือน (T)','Influencer') then 'ANY'
      when p.name in ('Hifu','Go-Hifu')                          then 'HIFU'
      when p.name = 'Pico'                                       then 'PICO'
      else 'DT'
    end as grp
  from public.procedures p
  where p.room_type = 'T'
),
resolved as (
  select r.id as room_id, pg.id as procedure_id
  from layout l
  join public.branches b on b.name = l.branch_name
  join public.rooms r    on r.branch_id = b.id and r.name = l.room_name and r.type = 'T'
  join proc_group pg on
        pg.grp = 'ANY'
    or (l.role = 'DT'       and pg.grp = 'DT')
    or (l.role = 'HIFU'     and pg.grp = 'HIFU')
    or (l.role = 'PICO'     and pg.grp = 'PICO')
    or (l.role = 'HIFUPICO' and pg.grp in ('HIFU','PICO'))
)
insert into public.room_procedures (room_id, procedure_id)
select room_id, procedure_id from resolved
on conflict (room_id, procedure_id) do nothing;

-- กันพลาดเงียบ: ถ้าชื่อสาขา/ห้องในผังข้างบนไม่ตรงกับของจริงแม้แต่แถวเดียว ให้ล้มทั้ง
-- migration ดีกว่าปล่อยให้บางเตียงไม่ถูกตั้งค่าแล้วไปเงียบ ๆ วิ่งกติกาเดิมอยู่สาขาเดียว
do $$
declare missing text;
begin
  select string_agg(t.branch_name || ' ' || t.room_name, ', ')
  into missing
  from (values
    ('Class กาฬสินธุ์','T04'),('Class โคราช','T05'),('Class จันทบุรี','T03'),
    ('Class ฉะเชิงเทรา','T04'),('Class ชัยภูมิ','T02'),('Class เชียงราย','T04'),
    ('Class นครพนม','T03'),('Class บ่อวิน','T04'),('Class บางแสน','T05'),
    ('Class บุรีรัมย์','T04'),('Class ฟิวเจอร์พาร์ครังสิต','T06'),
    ('Class ยูเนี่ยนมอลล์ลาดพร้าว','T05'),('Class ร้อยเอ็ด','T04'),('Class ระยอง','T04'),
    ('Class ลาดกระบัง','T03'),('Class เลย','T02'),('Class ศรีสะเกษ','T02'),
    ('Class สกลนคร','T03'),('Class สหพัฒน์','T04'),('Class สารคาม','T03'),
    ('Class สุรินทร์','T03'),('Class หนองคาย','T04'),('Class หอกาญ','T04'),
    ('Class อมตะ','T05'),('Class อุดร','T05'),('Class อุบล','T04'),
    ('Class Go กังสดาล','T04'),('Class Go ชุมแพ','T02'),('Class Go บางพลี','T02')
  ) as t(branch_name, room_name)
  where not exists (
    select 1 from public.room_procedures rp
    join public.rooms r on r.id = rp.room_id
    join public.branches b on b.id = r.branch_id
    where b.name = t.branch_name and r.name = t.room_name
  );

  if missing is not null then
    raise exception 'ตั้งค่าไม่ครบ — เตียงเหล่านี้ไม่มีแถวใน room_procedures: %', missing;
  end if;
end $$;

commit;
