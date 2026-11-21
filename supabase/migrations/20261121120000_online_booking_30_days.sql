-- จองออนไลน์: ขยายวันล่วงหน้าจาก 14 เป็น 30 วัน — เจ้าของสั่ง 21 พ.ย. 2569
--
-- กติกาอื่นไม่เปลี่ยน: ห้ามย้อนหลัง, ก่อนนัดอย่างน้อย 2 ชั่วโมง,
-- เบอร์ละไม่เกิน 2 วันที่มีคิวค้าง วันละไม่เกิน 3 คิว
--
-- แก้เฉพาะค่าคงที่ c_max_days ในฟังก์ชันที่รันอยู่ ไม่คัดลอกฟังก์ชันทั้งตัวมาวางใหม่
-- (แต่ละตัวผ่านหลาย migration: ลำดับหัตถการ คูปอง เตียง TikTok — คัดลอกซ้ำเสี่ยงทับกติกาอื่น)
-- ถ้าไม่พบค่าคงที่ 14 หรือ 30 ในฟังก์ชันใด ให้ล้มทั้งชุดแทนการแก้ไม่ครบ
-- รันซ้ำได้ (ถ้าเป็น 30 อยู่แล้วข้าม)
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

      if v_def like '%c_max_days int := 30;%' then
        continue;
      end if;

      v_new := replace(v_def, 'c_max_days int := 14;', 'c_max_days int := 30;');

      if v_new = v_def or v_new not like '%c_max_days int := 30;%' then
        raise exception 'online_booking_30_days: ไม่พบ c_max_days int := 14 ใน %', v_name;
      end if;

      execute v_new;
    end loop;
  end loop;
end
$$;
