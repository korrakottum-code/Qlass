-- ดัชนี queues.rescheduled_from_id — ทำให้การลบคิวไม่ต้องสแกนทั้งตาราง
-- คิวมี foreign key ชี้กลับมาหาตัวเอง (queues_rescheduled_from_id_fkey, ON DELETE RESTRICT) ทุกครั้งที่ลบคิว
-- Postgres ต้องเช็คว่ามีคิวไหนอ้าง id นั้นอยู่ไหม ไม่มีดัชนี = สแกน ~275k แถวทุกครั้ง (~50 ms ตอนว่าง, 1.3–3 วินาทีตอนคนใช้เยอะ
-- 4 พ.ย. 2569 09:01 ลบคิวโดนตัดที่ 3 วินาทีของ anon) ปัจจุบันไม่มีแถวไหนใช้คอลัมน์นี้ (0 แถว) ดัชนีแบบ partial จึงว่างและเล็กมาก
-- และไม่เสีย HOT update เพราะการแก้คิวปกติไม่แตะคอลัมน์นี้
--
-- ⚠️ บนโปรดักชันดัชนีนี้ถูกสร้างด้วยคำสั่งด้านล่างนี้ (CONCURRENTLY = ไม่ล็อกการเขียน พนักงานใช้งานต่อได้ตามปกติ):
--     CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_queues_rescheduled_from_id ON public.queues (rescheduled_from_id) WHERE rescheduled_from_id IS NOT NULL;
-- CONCURRENTLY รันในทรานแซกชันไม่ได้ ไฟล์ migration นี้จึงใช้ IF NOT EXISTS แบบปกติ: ที่โปรดักชันเป็น no-op (มีดัชนีแล้ว)
create index if not exists idx_queues_rescheduled_from_id on public.queues (rescheduled_from_id) where rescheduled_from_id is not null;
