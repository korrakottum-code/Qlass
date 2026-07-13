// Read-only timing probe — measures how long each Supabase query takes.
// Run: VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... node scripts/perf_probe.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY");
}

const supabase = createClient(url, key);

async function time(label, fn) {
  const t0 = Date.now();
  try {
    const r = await fn();
    const ms = Date.now() - t0;
    console.log(`✅ ${label.padEnd(34)} ${String(ms).padStart(6)} ms  ${r ?? ""}`);
    return ms;
  } catch (e) {
    const ms = Date.now() - t0;
    console.log(`❌ ${label.padEnd(34)} ${String(ms).padStart(6)} ms  ERROR: ${e.message}`);
  }
}

const since = new Date();
since.setDate(since.getDate() - 30);
const sinceDate = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, "0")}-${String(since.getDate()).padStart(2, "0")}`;

console.log("\n=== Qlass Supabase performance probe ===\n");

await time("staff (all)", async () => {
  const { data, error } = await supabase.from("staff").select("*");
  if (error) throw error;
  return `${data.length} rows`;
});

await time("queues COUNT (all)", async () => {
  const { count, error } = await supabase.from("queues").select("*", { count: "exact", head: true });
  if (error) throw error;
  return `${count} rows`;
});

await time("queues COUNT (>=30d)", async () => {
  const { count, error } = await supabase.from("queues").select("*", { count: "exact", head: true }).gte("date", sinceDate);
  if (error) throw error;
  return `${count} rows (since ${sinceDate})`;
});

await time("queues page1 ORDER date (all)", async () => {
  const { data, error } = await supabase.from("queues").select("*").order("date", { ascending: false }).order("time_block", { ascending: true }).range(0, 999);
  if (error) throw error;
  return `${data.length} rows`;
});

await time("queues page1 ORDER date (>=30d)", async () => {
  const { data, error } = await supabase.from("queues").select("*").gte("date", sinceDate).order("date", { ascending: false }).order("time_block", { ascending: true }).range(0, 999);
  if (error) throw error;
  return `${data.length} rows`;
});

await time("room_schedules COUNT", async () => {
  const { count, error } = await supabase.from("room_schedules").select("*", { count: "exact", head: true });
  if (error) throw error;
  return `${count} rows`;
});

await time("room_schedules page1", async () => {
  const { data, error } = await supabase.from("room_schedules").select("*").order("created_at", { ascending: true }).range(0, 999);
  if (error) throw error;
  return `${data.length} rows`;
});

console.log("\n=== done ===\n");
