-- เก็บชื่อโปรและห้อง ณ ตอนลงคิว กันประวัติเก่าเพี้ยนเมื่อโปร/ห้องถูกลบทีหลัง
--
-- ═══ ปัญหา ═══
-- promo_id / room_id ในตาราง queues ผูกแบบ "ถ้าต้นทางถูกลบ ให้เซตเป็นว่าง"
-- (ON DELETE SET NULL) เจ้าของงานสังเกตเห็นว่าหน้าสรุปประจำวัน กราฟ "โปร"/"ห้อง"
-- มีคิวจำนวนมากขึ้นเรื่อยๆ ที่ตกไปกอง "ไม่ระบุโปร"/"ไม่ระบุห้อง" — ตรวจข้อมูลจริงพบว่า
-- มีคิวสถานะ "เสร็จแล้ว"/"ไม่มาตามนัด" ปะปนอยู่ด้วย (ส.ค. 2569 เดือนเดียว 256 คิว)
-- ซึ่งเป็นไปไม่ได้ที่จะไม่เคยมีห้องจริง — สรุปว่าห้อง/โปรที่เคยผูกไว้ถูกลบไปทีหลัง
-- ลบเงียบ ไม่มีเตือน ไม่มีบันทึก และ "ลบย้อนหลัง" คิวเก่าที่เสร็จไปแล้วด้วย
--
-- ═══ ทำไมใช้ trigger ไม่ใช่แก้ที่ JS ═══
-- ระบบมีทางเขียนคิวหลายทาง (บันทึกคิวตรง, Timeline, ทางเซิร์ฟเวอร์ของกลุ่มทดลอง)
-- ถ้าแก้ที่ JS ต้องแก้ครบทุกทาง เสี่ยงตกหล่น (บทเรียนจาก area_names ที่เพิ่งทำไป)
-- ใช้ trigger ตัดปัญหานี้ทิ้งไปเลย ทุกทางเขียนผ่าน trigger เดียวกันเสมอ ไม่มีทางหลุด
-- (ตัวอย่างเดียวกับ queues_fill_duration_blocks ที่มีอยู่แล้วในระบบ)
--
-- ═══ กติกาสำคัญที่สุด ═══
-- snapshot ตั้งค่าได้อย่างเดียว ไม่เคยถูกล้างเป็นค่าว่างโดยอัตโนมัติ แม้ promo_id/room_id
-- จะถูกเซตเป็น NULL ทีหลัง (ไม่ว่าจากการลบต้นทาง หรือแอดมินเคลียร์ช่องเอง) — เพราะ
-- ประเด็นทั้งหมดของฟีเจอร์นี้คือ "อย่าให้ประวัติเก่าเพี้ยนเมื่อของถูกลบ" ถ้า trigger
-- ล้าง snapshot ตามไปด้วยตอนถูกลบ ก็จะกลับไปเป็นปัญหาเดิมทุกอย่าง
--
-- snapshot ไม่ตามรีเนม — ถ้าคิวเลือกโปรไว้แล้วโปรถูกเปลี่ยนชื่อทีหลัง (ไม่ได้ลบ)
-- snapshot จะยังโชว์ชื่อเดิมตอนเลือก จนกว่าจะมีการเปลี่ยน promo_id/room_id ของคิวนั้น
-- อีกครั้ง — เป็น snapshot ณ เวลาที่เลือกจริง ๆ ไม่ใช่ค่าที่ sync สดตลอดเวลา
-- (กติกาเดียวกับ area_names ที่เพิ่งทำไปใน PR #201)
--
-- ═══ ผลกระทบ ═══
-- เพิ่มคอลัมน์ nullable 2 ตัว ไม่มี default ไม่แตะแถวเดิมสักแถว คิวเก่า 180,000+ แถว
-- จะมี snapshot เป็น NULL = ตกไปที่ป้าย "ไม่ระบุ..." เหมือนเดิมทุกอย่าง (กู้ข้อมูลเก่า
-- ไม่ได้ ไม่เคยถูกเก็บไว้) — เจ้าของงานยืนยันแล้วว่าเอาแค่จากนี้ไปพอ ไม่ต้องแก้ย้อนหลัง

set local lock_timeout = '3s';

alter table public.queues add column promo_name_snapshot text;
alter table public.queues add column room_label_snapshot text;

comment on column public.queues.promo_name_snapshot is
  'Snapshot of the promo name at the time promo_id was last set on this row. Never cleared automatically (survives the promo later being renamed or deleted). Display-only fallback for when promo_id no longer resolves — never used for pricing logic.';
comment on column public.queues.room_label_snapshot is
  'Snapshot of "[type] name" for the room at the time room_id was last set on this row. Never cleared automatically (survives the room later being renamed or deleted). Display-only fallback for when room_id no longer resolves.';

create or replace function public.queues_fill_name_snapshots()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- ตั้งค่าได้อย่างเดียว: เขียนทับเฉพาะตอน promo_id/room_id ถูกเซตเป็นค่าที่ไม่ใช่ NULL
  -- และเป็นค่าใหม่จริง ๆ (INSERT นับเป็น "ใหม่" เสมอ) ห้ามล้างเป็นว่างไม่ว่ากรณีใด —
  -- นี่คือกติกาข้อเดียวที่ทำให้ฟีเจอร์นี้มีความหมาย ดู comment หัวไฟล์ migration
  if new.promo_id is not null
     and (tg_op = 'INSERT' or new.promo_id is distinct from old.promo_id)
  then
    select p.name into new.promo_name_snapshot
    from public.promos p
    where p.id = new.promo_id;
  end if;

  if new.room_id is not null
     and (tg_op = 'INSERT' or new.room_id is distinct from old.room_id)
  then
    select '[' || r.type || '] ' || r.name into new.room_label_snapshot
    from public.rooms r
    where r.id = new.room_id;
  end if;

  return new;
end
$$;

comment on function public.queues_fill_name_snapshots() is
  'Populates promo_name_snapshot/room_label_snapshot when promo_id/room_id is set to a non-null value (insert or explicit change). Never clears an existing snapshot — including when the FK ON DELETE SET NULL action fires. See migration 20260916120000.';

drop trigger if exists queues_fill_name_snapshots on public.queues;
create trigger queues_fill_name_snapshots
  before insert or update of promo_id, room_id on public.queues
  for each row execute function public.queues_fill_name_snapshots();
