-- ย้อน 20261128120000_deposit_campaign_list.sql
-- ลบ Edge Function deposit-campaign-list ก่อน/หลังก็ได้
-- ไม่แตะ transfer_deposits และไม่แตะ deposit_campaign_stats_v1 (ยอดรวม)

drop function if exists public.deposit_campaign_list_v1(date, date);
drop table if exists public.deposit_campaign_list_calls;
