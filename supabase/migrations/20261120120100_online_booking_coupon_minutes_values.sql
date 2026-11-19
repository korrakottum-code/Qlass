-- จองออนไลน์: เวลาตามจำนวนคูปอง — ขั้น 2: ใส่ค่าที่ทีมตั้ง (20 พ.ย. 2569)
-- ลง "หลัง" หน้าจองรุ่นใหม่ขึ้นแล้ว (หน้ารุ่นใหม่อ่าน coupon_minutes เพื่อโชว์ปุ่ม/เวลาให้ตรง)
-- ย้อนกลับ: update public.online_booking_promos set coupon_minutes = null;  (กลับเป็นกติกาเดิมทันที)
--
--   Botox: BTXA กราม / BTXA ริ้วรอย / nabota 50U     30 / 40          (สูงสุด 2 ใบ)
--   Filler: Bella Feel / Filler 1฿                     30 / 45 / 60
--   Hifu: 200 shot / 400 shot                          30 / 40 / 50
--   Meso: Vitaran / Blue Fat / re-gene / Meso ฝ้า     15 / 20 / 30
--   Ultraformer 200 shot                               40 / 50 / 60
--   ครั้งละ 1 สิทธิ์: Pico ทุกโปร, โปรเซ็ตทุกตัว, กำจัดขน (Diode) ทุกโปร, ดริปผิว (วิตามินผิว) ทุกโปร
--     = เวลาหัตถการเดิม 1 รอบ

set local lock_timeout = '3s';

with v(promo_name, minutes) as (values
  ('TIKTOK BTXA กราม 1490฿',            array[30, 40]),
  ('TIKTOK BTXA ริ้วรอย 1490฿',          array[30, 40]),
  ('TIKTOK nabota 50U 3690฿',           array[30, 40]),
  ('TIKTOK Bella Feel 1990฿',           array[30, 45, 60]),
  ('TIKTOK Filler 1฿',                  array[30, 45, 60]),
  ('TIKTOK hifu 200 shot 790฿',         array[30, 40, 50]),
  ('TIKTOK hifu 400 shot 1490฿',        array[30, 40, 50]),
  ('TIKTOK Vitaran 1990฿',              array[15, 20, 30]),
  ('TIKTOK Blue Fat 20cc 490฿',         array[15, 20, 30]),
  ('TIKTOK re-gene 1890฿',              array[15, 20, 30]),
  ('TIKTOK Meoso ฝ้า 999฿',              array[15, 20, 30]),
  ('TIKTOK Ultraformer 200 shot 2990฿', array[40, 50, 60])
)
update public.online_booking_promos op
   set coupon_minutes = v.minutes
  from public.promos pr, v
 where pr.id = op.promo_id and btrim(pr.name) = v.promo_name;

-- ครั้งละ 1 สิทธิ์ = เวลาหัตถการเดิม 1 รอบ
update public.online_booking_promos op
   set coupon_minutes = array[pc.blocks * 5]
  from public.promos pr
  join public.procedures pc on pc.id = pr.procedure_id
 where pr.id = op.promo_id
   and op.coupon_minutes is null
   and pc.blocks > 0
   and (   pc.name in ('Pico', 'Diode', 'วิตามินผิว')
        or btrim(pr.name) in ('TIKTOK Set ตัว Top 2990฿', 'TIKTOK Set ต้าวหยอง 3990฿', 'TIKTOK เซ็ตหัตถการ 4990฿',
                              'TIKTOK Set เดนิส 4990', 'TIKTOK Set ทรีทเม้นท์ 4990฿'));
