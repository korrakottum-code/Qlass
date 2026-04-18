-- ═══════════════════════════════════════════════════════════
-- AI MEMORY: กฎ/ความรู้ที่ AI ถูกสอนผ่านแชต (share ข้าม device)
-- ═══════════════════════════════════════════════════════════

create table if not exists public.ai_memory (
  id uuid primary key default gen_random_uuid(),
  rule text not null,
  created_at timestamptz not null default now()
);

-- เปิด RLS + allow all (แอปไม่ใช้ auth)
alter table public.ai_memory enable row level security;

drop policy if exists "ai_memory_all" on public.ai_memory;
create policy "ai_memory_all" on public.ai_memory for all using (true) with check (true);

-- เปิด realtime
alter publication supabase_realtime add table public.ai_memory;
