import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * ลูกค้าจองคิวเองจากหน้าเว็บ (/#book) — ไม่ต้องล็อกอิน รอบแรกยังไม่มี OTP
 *
 * POST body { action, ... }
 *   branches                                    สาขาที่เปิดให้จองเอง
 *   catalog   { branchId }                      บริการที่จองได้ในสาขา
 *   slots     { branchId, promoId, date, count? }  ทุกช่อง 30 นาทีของวัน พร้อมว่าง/ไม่ว่าง
 *   book      { referenceId, branchId, promoId, startTime, name, phone, customerType, note, website, count? }
 *
 * count = จำนวนคูปอง 1–3 ใบ (14 พ.ย. 2569) ล็อกเวลา = เวลาหัตถการ × จำนวนใบ → online_booking_*_v2
 * ไม่ส่ง count = หน้าจองเวอร์ชันเก่าที่ค้างในเครื่องลูกค้า → v1 เหมือนเดิม (1 ใบ)
 *
 * ปลอดภัยต่อระบบที่พนักงานใช้:
 * - logic ทั้งหมดอยู่ใน SQL (online_booking_*_v1, service_role เท่านั้น) — เปิดเฉพาะสาขา/บริการที่ตั้งไว้ในเมนู "จองออนไลน์"
 * - รับเฉพาะ origin ที่อนุญาต (QLASS_ALLOWED_ORIGIN / QLASS_ALLOWED_ORIGINS ชุดเดียวกับ staff-session)
 * - จำกัดจำนวนครั้งต่อ IP (นับจาก online_booking_log ซึ่งเก็บแค่ hash ของ IP ไม่เก็บชื่อ/เบอร์)
 * - ช่อง website = กับดักบอท (คนจริงมองไม่เห็นช่องนี้) มีค่า = ตอบเหมือนจองไม่ได้ ไม่สร้างคิว
 * Deploy: supabase functions deploy public-booking --no-verify-jwt (ลูกค้าไม่มี session)
 */

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("QLASS_SUPABASE_SECRET_KEY")
  ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// ที่อยู่สำหรับลูกค้า (BOOKING_HOST ใน src/utils/publicBooking.js) — ใส่ในโค้ดตรงนี้ ไม่เพิ่มใน QLASS_ALLOWED_ORIGINS
// เพราะชุดนั้นใช้ร่วมกับ staff-session; ที่อยู่ลูกค้าต้องเรียกได้แค่ฟังก์ชันจองนี้
const BOOKING_ORIGINS = ["https://classclinic-booking.vercel.app"];
const allowedOrigins = [...BOOKING_ORIGINS, Deno.env.get("QLASS_ALLOWED_ORIGIN") ?? "", ...(Deno.env.get("QLASS_ALLOWED_ORIGINS") ?? "").split(",")]
  .map((value) => value.trim()).filter(Boolean);
function isAllowedOrigin(origin: string | null): origin is string {
  return typeof origin === "string" && allowedOrigins.includes(origin);
}

// ต่อ IP: [จำนวนครั้ง, ช่วงเวลา (นาที)]
const RATE_LIMITS: Record<string, Array<[number, number]>> = {
  branches: [[60, 1]],
  catalog: [[60, 1]],
  slots: [[120, 1]],
  book: [[5, 10], [20, 24 * 60]],
};
const MAX_BODY_BYTES = 4 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function corsHeaders(origin: string | null) {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "private, no-store",
    "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin : "null",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function respond(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(origin) });
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function clientIp(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for") ?? "";
  return forwarded.split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "unknown";
}

async function overRateLimit(ipHash: string, action: string): Promise<boolean> {
  for (const [limit, minutes] of RATE_LIMITS[action] ?? []) {
    const since = new Date(Date.now() - minutes * 60_000).toISOString();
    const { count, error } = await supabase
      .from("online_booking_log").select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash).eq("endpoint", action).gte("at", since);
    if (error) return false; // นับไม่ได้ = ไม่บล็อกลูกค้าปกติ
    if ((count ?? 0) >= limit) return true;
  }
  return false;
}

async function writeLog(entry: Record<string, unknown>) {
  try {
    const { error } = await supabase.from("online_booking_log").insert(entry);
    if (error) console.error("[public-booking] log failed:", error.message);
  } catch (err) {
    console.error("[public-booking] log failed:", err instanceof Error ? err.message : err);
  }
}

function parseDay(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? value : null;
}

const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})$/;
function parseStart(value: unknown): string | null {
  if (typeof value !== "string" || !ISO_WITH_ZONE.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

const knownErrors = new Set(["INVALID_BRANCH", "INVALID_SERVICE", "INVALID_TIME", "INVALID_CUSTOMER", "INVALID_REFERENCE", "INVALID_COUNT", "REFERENCE_ID_REUSED"]);

// จำนวนคูปอง: ไม่ส่งมา = null (ใช้ v1), ส่งมาต้องเป็นจำนวนเต็ม 1–3 ไม่งั้น "invalid"
const MAX_COUPONS = 3;
function parseCount(value: unknown): number | null | "invalid" {
  if (value === undefined || value === null) return null;
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= MAX_COUPONS ? value as number : "invalid";
}
function rpcError(error: { message?: string }, origin: string | null) {
  const code = String(error?.message ?? "");
  if (knownErrors.has(code)) return respond({ error: code }, code === "REFERENCE_ID_REUSED" ? 409 : 422, origin);
  console.error("[public-booking] rpc failed:", code);
  return respond({ error: "INTERNAL_ERROR" }, 500, origin);
}

Deno.serve(async (req) => {
  const started = Date.now();
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (!isAllowedOrigin(origin)) return respond({ error: "origin_not_allowed" }, 403, origin);
  if (req.method !== "POST") return respond({ error: "method_not_allowed" }, 405, origin);

  const text = await req.text();
  let body: Record<string, unknown> | null = null;
  if (text.length > 0 && new TextEncoder().encode(text).length <= MAX_BODY_BYTES) {
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed;
    } catch { /* ไม่ใช่ JSON */ }
  }
  const action = typeof body?.action === "string" ? body.action : "";
  if (!body || !RATE_LIMITS[action]) return respond({ error: "INVALID_REQUEST" }, 400, origin);

  const ipHash = await sha256(`qlass-public-booking:${clientIp(req)}`);
  let res: Response;
  let detail: Record<string, unknown> | null = null;

  try {
    if (await overRateLimit(ipHash, action)) {
      res = respond({ error: "RATE_LIMITED" }, 429, origin);
    } else if (action === "branches") {
      const { data, error } = await supabase.rpc("online_booking_branches_v1");
      res = error ? rpcError(error, origin) : respond({ branches: data }, 200, origin);
    } else if (action === "catalog") {
      const branchId = String(body.branchId ?? "");
      if (!UUID.test(branchId)) res = respond({ error: "INVALID_BRANCH" }, 422, origin);
      else {
        const { data, error } = await supabase.rpc("online_booking_catalog_v1", { p_branch_id: branchId });
        res = error ? rpcError(error, origin) : respond({ services: data }, 200, origin);
      }
    } else if (action === "slots") {
      const branchId = String(body.branchId ?? "");
      const promoId = String(body.promoId ?? "");
      const day = parseDay(body.date);
      const count = parseCount(body.count);
      if (!UUID.test(branchId)) res = respond({ error: "INVALID_BRANCH" }, 422, origin);
      else if (!UUID.test(promoId)) res = respond({ error: "INVALID_SERVICE" }, 422, origin);
      else if (!day) res = respond({ error: "INVALID_TIME" }, 422, origin);
      else if (count === "invalid") res = respond({ error: "INVALID_COUNT" }, 422, origin);
      else {
        const { data, error } = count === null
          ? await supabase.rpc("online_booking_slots_v1", { p_branch_id: branchId, p_promo_id: promoId, p_date: day })
          : await supabase.rpc("online_booking_slots_v2", { p_branch_id: branchId, p_promo_id: promoId, p_date: day, p_count: count });
        res = error ? rpcError(error, origin) : respond(data, 200, origin);
      }
    } else {
      // book
      const branchId = String(body.branchId ?? "");
      const promoId = String(body.promoId ?? "");
      const reference = typeof body.referenceId === "string" ? body.referenceId.trim() : "";
      const start = parseStart(body.startTime);
      const count = parseCount(body.count);
      const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
      if (str(body.website, 200).trim() !== "") {
        detail = { honeypot: true };
        res = respond({ success: false, error_code: "SLOT_UNAVAILABLE" }, 409, origin);
      } else if (!UUID.test(branchId)) res = respond({ error: "INVALID_BRANCH" }, 422, origin);
      else if (!UUID.test(promoId)) res = respond({ error: "INVALID_SERVICE" }, 422, origin);
      else if (!/^[A-Za-z0-9_-]{8,64}$/.test(reference)) res = respond({ error: "INVALID_REFERENCE" }, 422, origin);
      else if (!start) res = respond({ error: "INVALID_TIME" }, 422, origin);
      else if (count === "invalid") res = respond({ error: "INVALID_COUNT" }, 422, origin);
      else {
        const args = {
          p_reference_id: reference, p_branch_id: branchId, p_promo_id: promoId, p_start: start,
          p_name: str(body.name, 200), p_phone: str(body.phone, 40), p_customer_type: str(body.customerType, 10),
          p_note: str(body.note, 600),
        };
        const { data, error } = count === null
          ? await supabase.rpc("online_booking_create_v1", args)
          : await supabase.rpc("online_booking_create_v2", { ...args, p_count: count });
        if (error) res = rpcError(error, origin);
        else if (data?.success === true) {
          detail = { booking_ref: data.booking_ref, count: count ?? 1 };
          res = respond(data, 201, origin);
        } else {
          detail = { error_code: data?.error_code ?? null };
          res = respond({ success: false, error_code: String(data?.error_code ?? "INTERNAL_ERROR") }, 409, origin);
        }
      }
    }
  } catch (err) {
    console.error("[public-booking] unexpected:", err instanceof Error ? err.message : err);
    res = respond({ error: "INTERNAL_ERROR" }, 500, origin);
  }

  await writeLog({ ip_hash: ipHash, endpoint: action, status: res.status, ms: Date.now() - started, detail });
  return res;
});
