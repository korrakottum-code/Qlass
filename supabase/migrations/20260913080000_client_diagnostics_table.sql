-- ตารางเก็บบันทึกเหตุการณ์ฝั่งผู้ใช้ (Goal 11D)
--
-- edge function staff-session มีโค้ดเขียนลงตารางนี้อยู่แล้ว (action client_diagnostics)
-- แต่ตารางไม่เคยถูกสร้างจริง — ตรวจพบ 13 ก.ย. 2569 ตอนนี้ยังไม่มีผลเพราะสวิตช์
-- VITE_ENABLE_SERVER_DIAGNOSTICS ปิดอยู่ แต่วันไหนเปิด การเขียนจะล้มเงียบ ๆ
-- แล้วเราจะไม่มีหลักฐานไว้สืบเวลาคิวหาย (เจอปัญหานี้จริงตอนตามคิวที่หายไป 10 ก.ย.)
--
-- คอลัมน์ตรงกับ sanitizeDiagnostic() ใน edge function เป๊ะ ๆ — เก็บแค่ชื่อเหตุการณ์
-- เวอร์ชัน ผลลัพธ์ ขั้นตอน สถานะ realtime และเวลาที่ใช้ ไม่มีข้อมูลลูกค้าเลยสักอย่าง
create table if not exists public.client_diagnostics (
  id uuid primary key default gen_random_uuid(),
  release_id text not null,
  event_name text not null,
  outcome text,
  stage text,
  realtime_status text,
  duration_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists idx_client_diagnostics_created_at
  on public.client_diagnostics (created_at desc);

-- เขียนผ่าน edge function ด้วย service key เท่านั้น: เปิด RLS โดยไม่มี policy
-- แล้วถอน grant ของบัญชีสาธารณะทิ้ง (กติกาเดียวกับตาราง staff)
alter table public.client_diagnostics enable row level security;
revoke all on public.client_diagnostics from anon, authenticated;

comment on table public.client_diagnostics is
  'บันทึกเหตุการณ์ฝั่งผู้ใช้ (Goal 11D) — เขียนผ่าน edge function staff-session ด้วย service key เท่านั้น ไม่มี policy = บัญชีสาธารณะแตะไม่ได้ ไม่เก็บข้อมูลลูกค้าใด ๆ';
