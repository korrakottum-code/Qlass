import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ค่าโฆษณารายวันแบบ "ดึงมาเก็บไว้" — การ์ดในหน้าสรุปอ่านจากตาราง ad_spend_daily (เร็ว)
// แทนที่จะรอ Korrakot-DB/Meta ทุกครั้ง (ช้า 3-25 วินาที และ 504 ได้) ดู migration 20261021120000_ad_spend_cache.sql
//
// ทำงานแบบ "ดึงเมื่อเก่า": ขอสิทธิ์ดึง (lease) แล้วดึง Korrakot-DB เป็นสองส่วน
//   1) ช่วงล่าสุด (ครั้งแรก = ต้นเดือนนี้/14 วันล่าสุด, หลังจากนั้น = 7 วันล่าสุดเมื่อเก่ากว่า 1 ชม.) รอไม่เกิน WAIT_BUDGET_MS
//   2) เติมย้อนหลังทีละ BACKFILL_CHUNK_DAYS วันจนถึง BACKFILL_FROM ทำเบื้องหลังเท่านั้น ไม่ให้ผู้ใช้รอ
// ดึงช่วงล่าสุดก่อนเพราะเดือนเก่า Korrakot-DB ต้องไปดึงจาก Meta ช้าเกิน 25 วินาที (21 ต.ค. 2569 ดึง ส.ค. ทั้งเดือนล้ม 2 รอบ)
// token ของ Korrakot-DB อยู่ฝั่ง server เท่านั้น (SPA bundle ใครก็อ่านได้) ตรวจ session + เฉพาะ superadmin เหมือน ads-spend เดิม

const ADS_API = Deno.env.get("QLASS_ADS_SPEND_URL") ?? "https://korrakot-db.vercel.app/api/external/ads-spend";
const adsToken = Deno.env.get("QLASS_ADS_SPEND_TOKEN") ?? "";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("QLASS_SUPABASE_SECRET_KEY")
  ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Exact-match origin allowlist เหมือน ads-spend/search-hn — ไม่มี wildcard, union ว่าง = ปิดหมด
const allowedOrigins = [Deno.env.get("QLASS_ALLOWED_ORIGIN") ?? "", ...(Deno.env.get("QLASS_ALLOWED_ORIGINS") ?? "").split(",")]
  .map((value) => value.trim()).filter(Boolean);
function isAllowedOrigin(origin: string | null): origin is string {
  return typeof origin === "string" && allowedOrigins.includes(origin);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const ALLOWED_ROLES = ["superadmin"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 370;
const BACKFILL_FROM = "2026-08-01";
const REFRESH_MAX_AGE_MS = 60 * 60 * 1000;
const STALE_AFTER_MS = 90 * 60 * 1000;
const SETTLE_DAYS = 7;
const CHUNK_DAYS = 31;
const BACKFILL_CHUNK_DAYS = 14;
const LEASE_TTL_SECONDS = 120;
const WAIT_BUDGET_MS = 9_000;
const UPSTREAM_TIMEOUT_MS = 25_000;
const BACKFILL_TIMEOUT_MS = 60_000;
// เพดานเวลาทั้งงานเบื้องหลัง (Supabase ตัดที่ราว 150 วินาที) — เริ่มช่วงใหม่เฉพาะเมื่อยังเหลือเวลาพอทั้งช่วง
const JOB_WALL_BUDGET_MS = 130_000;

// <pure>
const DAY_MS = 86400000;

function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

function bangkokToday(nowMs: number): string {
  return new Date(nowMs + 7 * 3600000).toISOString().slice(0, 10);
}

function chunkRange(since: string, until: string, chunkDays: number): Array<{ since: string; until: string }> {
  const out: Array<{ since: string; until: string }> = [];
  let start = since;
  while (start <= until) {
    const end = addDays(start, chunkDays - 1);
    out.push({ since: start, until: end < until ? end : until });
    start = addDays(start, chunkDays);
  }
  return out;
}

interface SyncState {
  last_success_at: string | null;
  backfilled_from: string | null;
}

function minDay(a: string, b: string): string {
  return a < b ? a : b;
}

function maxDay(a: string, b: string): string {
  return a > b ? a : b;
}

interface Range {
  since: string;
  until: string;
}

interface Plan {
  // setsCoverage = ช่วงนี้ต่อเนื่องถึงวันนี้ ใช้ขยับ backfilled_from ได้
  recent: (Range & { setsCoverage: boolean }) | null;
  backfill: Range | null;
}

// recent: ครั้งแรก (ยังไม่มี backfilled_from) = ทุกอย่างที่การ์ดเปิดมาเห็น (ต้นเดือนนี้ + กราฟ 14 วัน),
//         หลังจากนั้น = settleDays วันล่าสุดเมื่อข้อมูลเก่ากว่า maxAgeMs
// backfill: ช่วงถัดไปที่เก่ากว่าที่มีอยู่ ทีละ chunkDays วัน จนถึง backfillFrom (null = ครบแล้ว)
function planRefresh(state: SyncState | null, nowMs: number, backfillFrom: string, maxAgeMs: number, settleDays: number, chunkDays: number): Plan {
  const today = bangkokToday(nowMs);
  const covered = state?.backfilled_from ?? null;
  const lastOk = state?.last_success_at ? Date.parse(state.last_success_at) : null;
  const stale = lastOk === null || nowMs - lastOk > maxAgeMs;
  let recent: Plan["recent"] = null;
  if (!covered) {
    const start = minDay(`${today.slice(0, 7)}-01`, addDays(today, -14));
    recent = { since: maxDay(start, backfillFrom), until: today, setsCoverage: true };
  } else if (stale) {
    recent = { since: maxDay(addDays(today, -settleDays), backfillFrom), until: today, setsCoverage: false };
  }
  const oldest = recent?.setsCoverage ? recent.since : covered;
  const backfill = oldest && oldest > backfillFrom
    ? { since: maxDay(addDays(oldest, -chunkDays), backfillFrom), until: addDays(oldest, -1) }
    : null;
  return { recent, backfill };
}

function sumDaily(rows: Array<{ spend: number }>): number {
  let sum = 0;
  for (const row of rows) sum += row.spend;
  return sum;
}
// </pure>

const jsonHeaders = { "Content-Type": "application/json" };

function corsHeaders(origin: string | null) {
  return {
    ...jsonHeaders,
    "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin : "null",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qlass-session",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function response(body: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(origin) });
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function findActiveStaff(token: string | null) {
  if (!token || !/^[a-f0-9]{64}$/i.test(token)) return null;
  const tokenHash = await sha256(token);
  const { data: session } = await supabase
    .from("app_sessions")
    .select("id,staff_id,expires_at,revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (!session || session.revoked_at || new Date(session.expires_at) <= new Date()) return null;

  const { data: staff } = await supabase
    .from("staff")
    .select("id,role,active")
    .eq("id", session.staff_id)
    .eq("active", true)
    .maybeSingle();
  if (!staff) return null;

  await supabase.from("app_sessions").update({ last_seen_at: new Date().toISOString() }).eq("id", session.id);
  return staff;
}

async function fetchDaily(range: Range, timeoutMs: number): Promise<Array<{ day: string; spend: number }>> {
  const url = new URL(ADS_API);
  url.searchParams.set("since", range.since);
  url.searchParams.set("until", range.until);
  url.searchParams.set("groupBy", "day");
  const res = await fetch(url, {
    headers: { "Authorization": `Bearer ${adsToken}`, "Accept": "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`upstream_${res.status}`);
  const json = await res.json();
  if (!Array.isArray(json?.daily)) throw new Error("upstream_no_daily");
  return json.daily
    .filter((row: Record<string, unknown>) => DATE_RE.test(String(row?.day ?? "")))
    .map((row: Record<string, unknown>) => ({ day: String(row.day), spend: Number(row.spend) || 0 }));
}

// ไม่ throw: ล้มเหลวแล้วบันทึกสาเหตุลง ad_spend_sync_state แล้วคืน false (ผู้เรียกยังตอบข้อมูลที่เก็บไว้ได้)
async function refreshRange(range: Range, setsCoverage: boolean, timeoutMs: number): Promise<boolean> {
  const startedAt = Date.now();
  try {
    const rows: Array<{ day: string; spend: number }> = [];
    for (const part of chunkRange(range.since, range.until, CHUNK_DAYS)) rows.push(...await fetchDaily(part, timeoutMs));
    const { error } = await supabase.rpc("ad_spend_save_v1", {
      p_rows: rows,
      p_backfilled_from: setsCoverage ? range.since : null,
    });
    if (error) throw new Error(`save_${error.code ?? "failed"}`);
    console.log("ads-spend-cache refreshed", JSON.stringify({ since: range.since, until: range.until, setsCoverage, rows: rows.length, ms: Date.now() - startedAt }));
    return true;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("ads-spend-cache refresh failed", JSON.stringify({ since: range.since, until: range.until, message, ms: Date.now() - startedAt }));
    await supabase.rpc("ad_spend_fail_v1", { p_error: `${range.since}..${range.until}: ${message}` });
    return false;
  }
}

// เติมย้อนหลังต่อเนื่องจนหมดเวลา หรือล้ม (รอบหน้าค่อยต่อจากที่ค้าง เพราะ backfilled_from ขยับทีละช่วงที่สำเร็จ)
async function backfillLoop(first: Range, jobStartedAt: number) {
  let range: Range | null = first;
  while (range && Date.now() - jobStartedAt + BACKFILL_TIMEOUT_MS < JOB_WALL_BUDGET_MS) {
    if (!await refreshRange(range, true, BACKFILL_TIMEOUT_MS)) return;
    range = planRefresh(await readState(), Date.now(), BACKFILL_FROM, REFRESH_MAX_AGE_MS, SETTLE_DAYS, BACKFILL_CHUNK_DAYS).backfill;
  }
}

// ตัวแปรสากลของ Supabase Edge Runtime — ให้งานที่เหลือทำต่อหลังตอบ response แล้ว
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

function keepAlive(job: Promise<unknown>) {
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime?.waitUntil(job);
}

async function readState(): Promise<SyncState | null> {
  const { data } = await supabase
    .from("ad_spend_sync_state")
    .select("last_success_at,backfilled_from")
    .eq("id", "global")
    .maybeSingle();
  return (data as SyncState | null) ?? null;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (!isAllowedOrigin(origin)) return response({ error: "origin_not_allowed" }, 403, origin);
  if (req.method !== "POST") return response({ error: "method_not_allowed" }, 405, origin);

  try {
    const staff = await findActiveStaff(req.headers.get("x-qlass-session"));
    if (!staff) return response({ error: "invalid_session" }, 401, origin);
    if (!ALLOWED_ROLES.includes(String(staff.role))) return response({ error: "forbidden" }, 403, origin);

    const body = await req.json().catch(() => ({}));
    const since = typeof body?.since === "string" ? body.since : "";
    const until = typeof body?.until === "string" ? body.until : "";
    if (!DATE_RE.test(since) || !DATE_RE.test(until)) return response({ error: "invalid_range" }, 400, origin);
    const span = Math.round((Date.parse(`${until}T00:00:00Z`) - Date.parse(`${since}T00:00:00Z`)) / DAY_MS);
    if (span < 0 || span > MAX_RANGE_DAYS) return response({ error: "invalid_range" }, 400, origin);

    let state = await readState();
    const plan = planRefresh(state, Date.now(), BACKFILL_FROM, REFRESH_MAX_AGE_MS, SETTLE_DAYS, BACKFILL_CHUNK_DAYS);
    let syncing = false;
    if ((plan.recent || plan.backfill) && adsToken) {
      const { data: leased } = await supabase.rpc("ad_spend_lease_v1", { p_ttl_seconds: LEASE_TTL_SECONDS });
      if (leased === true) {
        const jobStartedAt = Date.now();
        const recent = plan.recent;
        const recentJob = recent ? refreshRange(recent, recent.setsCoverage, UPSTREAM_TIMEOUT_MS) : Promise.resolve(true);
        // ย้อนหลังทำต่อเฉพาะเมื่อช่วงล่าสุดสำเร็จ (ไม่งั้น backfilled_from จะอ้างว่าต่อเนื่องถึงวันนี้ทั้งที่ไม่จริง)
        const fullJob = recentJob.then((ok) => (ok && plan.backfill ? backfillLoop(plan.backfill, jobStartedAt) : undefined));
        keepAlive(fullJob);
        if (recent) {
          const outcome = await Promise.race([
            recentJob.then(() => "done"),
            new Promise<string>((resolve) => setTimeout(() => resolve("pending"), WAIT_BUDGET_MS)),
          ]);
          if (outcome === "done") state = await readState();
          else syncing = true;
        }
      }
    }

    if (!state?.last_success_at) {
      // ยังไม่เคยดึงสำเร็จเลย: ห้ามตอบ ฿0 เงียบ ๆ
      if (!adsToken) return response({ error: "ads_token_missing" }, 503, origin);
      return response({ error: "ads_not_ready", syncing }, 503, origin);
    }

    const { data: rows, error } = await supabase
      .from("ad_spend_daily")
      .select("day,spend")
      .gte("day", since)
      .lte("day", until)
      .order("day", { ascending: true });
    if (error) throw error;

    const daily = (rows ?? []).map((row: { day: string; spend: number | string }) => ({ day: String(row.day), spend: Number(row.spend) || 0 }));
    return response({
      since,
      until,
      spend: Math.round(sumDaily(daily)),
      currency: "THB",
      asOf: state.last_success_at,
      coverageFrom: state.backfilled_from,
      stale: Date.now() - Date.parse(state.last_success_at) > STALE_AFTER_MS,
      syncing,
      daily,
    }, 200, origin);
  } catch (error) {
    console.error("ads-spend-cache error", error);
    return response({ error: "service_unavailable" }, 500, origin);
  }
});
