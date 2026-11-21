-- จองออนไลน์: เลิกจำกัดจำนวนวันล่วงหน้า (เดิมไม่เกิน 14 วัน) — เจ้าของสั่ง 21 พ.ย. 2569
--
-- กติกาที่ยังอยู่เหมือนเดิม: วันที่ย้อนหลังไม่ได้, ต้องก่อนเวลานัดอย่างน้อย 2 ชั่วโมง,
-- เบอร์ละไม่เกิน 2 วันที่มีคิวค้าง วันละไม่เกิน 3 คิว (ตัวนี้เป็นตัวคุมการจองข้ามเดือนจริง ๆ)
--
-- ทำไมแก้ด้วยการอ่านฟังก์ชันที่รันอยู่แล้วตัดออก แทนที่จะวางฟังก์ชันทั้งตัวซ้ำ:
-- ฟังก์ชันแต่ละตัวยาวและผ่านหลาย migration (ลำดับหัตถการ, คูปอง, เตียง TikTok) การคัดลอกมาวางใหม่
-- เสี่ยงทับกติกาอื่นที่ไม่ได้ตั้งใจแตะ ที่นี่แก้เฉพาะเงื่อนไข c_max_days แล้วใช้ฟังก์ชันเดิมต่อ
-- ถ้าหาเงื่อนไขไม่เจอ (โครงสร้างเปลี่ยนไปจากที่คาด) ให้ล้มทั้งชุดแทนที่จะแก้ไม่ครบ
--
-- ฟังก์ชันที่แก้: online_booking_slots_v1/v2 และ online_booking_create_v1/v2
-- (v1 ยังอยู่ เผื่อหน้าจองเวอร์ชันเก่าที่ลูกค้าเปิดค้างไว้)
-- สิทธิ์ (service_role เท่านั้น) ไม่เปลี่ยน เพราะใช้ create or replace

do $$
declare
  v_oid oid;
  v_def text;
  v_new text;
  v_name text;
begin
  foreach v_name in array array[
    'online_booking_slots_v1', 'online_booking_slots_v2',
    'online_booking_create_v1', 'online_booking_create_v2'
  ] loop
    for v_oid in
      select p.oid
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = v_name
    loop
      v_def := pg_get_functiondef(v_oid);
      v_new := regexp_replace(v_def, E'\n[ \t]*c_max_days int := 14;[^\n]*', '');
      v_new := replace(v_new, ' or p_date > v_today + c_max_days', '');
      v_new := replace(v_new, ' or v_date > v_today + c_max_days', '');

      if v_new = v_def or v_new like '%c_max_days%' then
        raise exception 'online_booking_no_day_limit: ไม่พบหรือแก้ไม่ครบเงื่อนไข c_max_days ใน %', v_name;
      end if;

      execute v_new;
    end loop;
  end loop;
end
$$;
