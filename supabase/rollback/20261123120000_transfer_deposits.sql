-- ย้อน 20261123120000_transfer_deposits.sql (ลบของใหม่ทั้งหมด ไม่แตะตารางเดิม)
-- ข้อควรรู้: ลบตาราง = รายการโอนที่บันทึกไว้หายทั้งหมด ให้ export ก่อนถ้ามีข้อมูลจริงแล้ว
-- ไฟล์สลิปใน bucket ต้องลบผ่าน Storage API/หน้า Dashboard ก่อน (SQL ลบ bucket ที่ยังมีไฟล์ไม่ได้)
drop function if exists public.deposit_stats_v1(date, date, uuid, uuid);
drop function if exists public.deposit_slip_path_v1(uuid, uuid);
drop function if exists public.deposit_cancel_v1(uuid, uuid, text);
drop function if exists public.deposit_link_v1(uuid, uuid, uuid, uuid);
drop function if exists public.deposit_create_v1(uuid, uuid, text, text, uuid, numeric, date, text, text);
drop function if exists public.deposit_list_v1(uuid, text, text, date, date, int, int);
drop function if exists public.deposit_json(public.transfer_deposits);
drop function if exists public.deposit_current_queue(uuid);
drop table if exists public.transfer_deposits;
delete from storage.buckets where id = 'deposit-slips';
