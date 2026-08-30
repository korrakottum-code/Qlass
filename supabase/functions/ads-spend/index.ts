import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Proxy ไปยัง Korrakot-DB (Meta Ads Dashboard) — token ต้องอยู่ฝั่ง server เท่านั้น
// Qlass เป็น Vite SPA: ตัวแปร VITE_* ทุกตัวถูกฝังใน bundle ที่ผู้ใช้ทุกคนอ่านได้
// จึงห้ามให้เบราว์เซอร์ถือ Bearer ของ ads API เด็ดขาด
const ADS_API = Deno.env.get("QLASS_ADS_SPEND_URL") ?? "https://korrakot-db.vercel.app/api/external/ads-spend";
const adsToken = Deno.env.get("QLASS_ADS_SPEND_TOKEN") ?? "";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("QLASS_SUPABASE_SECRET_KEY")
  ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Exact-match origin allowlist เหมือน search-hn — ไม่มี wildcard, union ว่าง = ปิดหมด
const allowedOrigins = [Deno.env.get("QLASS_ALLOWED_ORIGIN") ?? "", ...(Deno.env.get("QLASS_ALLOWED_ORIGINS") ?? "").split(",")]
  .map((value) => value.trim()).filter(Boolean);
function isAllowedOrigin(origin: string | null): origin is string {
  return typeof origin === "string" && allowedOrigins.includes(origin);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// role ที่ดูค่าโฆษณาได้ — ตรงกับการ์ดในหน้าสรุปที่โชว์เฉพาะ superadmin
const ALLOWED_ROLES = ["superadmin"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 370; // ข้อจำกัดของ ads API ปลายทาง
const DAY_MS = 86400000;

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

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
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
    if (!adsToken) return response({ error: "ads_token_missing" }, 503, origin);

    const body = await req.json().catch(() => ({}));
    const since = typeof body?.since === "string" ? body.since : "";
    const until = typeof body?.until === "string" ? body.until : "";
    if (!DATE_RE.test(since) || !DATE_RE.test(until)) return response({ error: "invalid_range" }, 400, origin);
    const span = daysBetween(since, until);
    if (span < 0 || span > MAX_RANGE_DAYS) return response({ error: "invalid_range" }, 400, origin);

    const url = new URL(ADS_API);
    url.searchParams.set("since", since);
    url.searchParams.set("until", until);
    url.searchParams.set("groupBy", "day");

    const upstream = await fetch(url, {
      headers: { "Authorization": `Bearer ${adsToken}`, "Accept": "application/json" },
    });
    if (!upstream.ok) {
      // ไม่ส่งรายละเอียด/สถานะภายในของปลายทางกลับไปฝั่ง client มากกว่าที่จำเป็น
      console.error("ads-spend upstream error", upstream.status);
      const error = upstream.status === 429 ? "rate_limited" : "upstream_error";
      return response({ error, upstreamStatus: upstream.status }, 502, origin);
    }
    const json = await upstream.json();

    const daily = Array.isArray(json?.daily)
      ? json.daily
        .filter((row: Record<string, unknown>) => DATE_RE.test(String(row?.day ?? "")))
        .map((row: Record<string, unknown>) => ({ day: String(row.day), spend: Number(row.spend) || 0 }))
      : null;

    return response({
      since,
      until,
      spend: Number(json?.spend) || 0,
      currency: typeof json?.currency === "string" ? json.currency : "THB",
      asOf: typeof json?.asOf === "string" ? json.asOf : new Date().toISOString(),
      daily, // null = ปลายทางยังไม่รองรับ groupBy=day (การ์ดจะซ่อนกราฟรายวันแทนที่จะโชว์ 0)
    }, 200, origin);
  } catch (error) {
    console.error("ads-spend error", error);
    return response({ error: "service_unavailable" }, 500, origin);
  }
});
