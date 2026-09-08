-- เปิดสวิตช์ "บริเวณ" ให้หัตถการ Diode
--
-- ไฟล์นี้ไม่ใช่ migration — ตั้งใจแยกออกมา เพราะการลง migration ต้องไม่เปลี่ยนพฤติกรรม
-- อะไรเลย ส่วนไฟล์นี้คือขั้นตอน "เปิดใช้จริง" ที่ทำทีหลัง นอกเวลาทำการ (หลัง 20:00)
-- และแจ้งทีมหน้าร้านก่อน
--
-- เวลาที่ใช้ (เจ้าของยืนยัน 2026-09-08): แขน 20 / ขา 20 / hollywood 30 / หลัง 20 /
-- ที่เหลือ 15 นาที   [1 บล็อค = 5 นาที]
-- "ขาล่าง" เจ้าของยืนยันเพิ่มทีหลัง 2026-09-09 = 20 นาที เท่าขาเต็ม
--
-- แก้เวลาทีหลังได้ในหน้า "หัตถการ" ไม่ต้องแก้ไฟล์นี้แล้วรันซ้ำ
--
-- ชื่อบริเวณอ้างอิงจากชื่อโปรที่ใช้จริงในระบบ (27 โปรที่ผูกกับ Diode)
--
-- รันซ้ำได้ ไม่สร้างซ้ำ (on conflict do nothing ตาม unique index procedure_id + ชื่อ)
--
-- ปิดกลับ:
--   delete from public.procedure_areas
--   where procedure_id = (select id from public.procedures where name = 'Diode');

begin;

insert into public.procedure_areas (procedure_id, name, blocks, sort_order)
select p.id, v.name, v.blocks, v.sort_order
from public.procedures p
cross join (values
  ('รักแร้',      3, 10),
  ('หนวด',       3, 20),
  ('เครา',       3, 30),
  ('ใบหน้า',      3, 40),
  ('แขน',        4, 50),
  ('ขา',         4, 60),
  ('ขาล่าง',      4, 70),
  ('หลัง',        4, 80),
  ('Hollywood',  6, 90)
) as v(name, blocks, sort_order)
where p.name = 'Diode'
on conflict do nothing;

commit;

-- ตรวจผล — ควรได้ 9 แถว
-- select a.name, a.blocks, a.blocks * 5 as นาที
-- from public.procedure_areas a
-- join public.procedures p on p.id = a.procedure_id
-- where p.name = 'Diode' order by a.sort_order;

-- เปิด Go-Diode ทีหลัง (คิว 923 คิว) เมื่อ Diode นิ่งแล้ว — เปลี่ยน 'Diode' เป็น 'Go-Diode'
