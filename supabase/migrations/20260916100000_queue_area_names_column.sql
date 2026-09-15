-- เก็บว่า "บริเวณ" ไหนถูกเลือกไว้ในคิวนี้ (เช่น Diode: รักแร้, ขา)
--
-- ═══ ทำไม ═══
-- ฟีเจอร์บริเวณ (20260908093000) ตั้งใจเอาแค่ "เวลารวม" ไปเขียนลง duration_blocks
-- เท่านั้น ไม่เก็บว่าเลือกบริเวณไหนบ้าง — ตั้งใจแบบนั้นตอนเปิดใช้ครั้งแรกเพื่อไม่ต้อง
-- เพิ่มคอลัมน์ใหม่ในตาราง queues (ดู comment หัวไฟล์ src/utils/procedureAreas.js เดิม)
--
-- ผลคือหลังบันทึกคิวแล้ว ไม่มีที่ไหนบอกได้เลยว่าคิวนี้เลือกบริเวณไหน มีแต่ตัวเลขเวลา
-- ที่บวกไว้แล้ว แม้แต่ตอนเปิด "แก้ไข" คิวเก่าที่เคยติ๊ก 2 บริเวณ ปุ่มก็ไม่ติ๊กให้เห็น
-- เจ้าของงานเจอปัญหานี้เอง (16 ก.ย. 2569) ขอให้แก้ไปข้างหน้า ไม่ต้องย้อนกู้ข้อมูลเก่า
--
-- ═══ ทำไมเป็น text ไม่ใช่ array ของ id ═══
-- เก็บเป็น snapshot ข้อความ (เช่น "รักแร้, ขา") ไม่ใช่ id ของ procedure_areas — กันไม่ให้
-- ประวัติพัง ถ้าบริเวณถูกเปลี่ยนชื่อหรือปิดใช้ทีหลัง (ตัดสินใจเดียวกับ recorded_note /
-- status_note ที่เป็นข้อความอิสระเหมือนกัน)
--
-- ═══ ผลกระทบ ═══
-- เพิ่มคอลัมน์ nullable ธรรมดา ไม่มี default ไม่มี not null ไม่แตะแถวเดิมสักแถว
-- คิวเก่าทั้งหมด (183,000+ แถว) จะมีค่า NULL = ไม่มีอะไรโผล่ตอนแสดงผล เหมือนเดิมทุกอย่าง
-- ADD COLUMN แบบ nullable ไม่มี default ใน Postgres ไม่ rewrite ตาราง (เร็ว ไม่ล็อกนาน)

set local lock_timeout = '3s';

alter table public.queues add column area_names text;

comment on column public.queues.area_names is
  'Snapshot text of procedure-area names picked at booking time (e.g. "รักแร้, ขา"), comma-joined in the areas'' configured sort order. Null = no areas configured for this procedure, or none picked. Display-only; duration_blocks remains the source of truth for scheduling. See src/utils/procedureAreas.js and PR that added this column.';
