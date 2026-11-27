-- ย้อน 20261127120000_deposit_campaign_stats.sql
-- ลบ Edge Function deposit-campaign-stats (หรือลบ secret QLASS_DEPOSIT_STATS_API_KEY ให้ปิดเอง) ก่อน/หลังก็ได้
-- ไม่แตะ transfer_deposits

drop function if exists public.deposit_campaign_stats_v1(date, date);
drop table if exists public.deposit_campaign_stats_calls;
