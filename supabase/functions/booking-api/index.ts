import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Booking API สำหรับบอท Saifa AI (server-to-server)
 *
 *   GET  /v1/branches                        รหัสสาขาที่เปิดให้เรียกได้
 *   POST /v1/availability/check              เช็กว่าคิวว่างไหม + เวลาทางเลือก
 *   GET  /v1/availability/slots?branch_code=&sku=&date=YYYY-MM-DD   ทุกช่อง 30 นาทีของวัน
 *   POST /v1/bookings                        จองคิวลง Qlass (คีย์ sandbox = dry-run ไม่เขียนจริง)
 *
 * Header: X-API-Key  (แยกคีย์ production / sandbox)
 *
 * ออกแบบให้ปลอดภัยต่อระบบที่พนักงานใช้อยู่:
 * - คนละ auth กับ staff-session โดยสิ้นเชิง เพิกถอนคีย์ได้โดยไม่กระทบการล็อกอินของทีม
 * - ไม่มี CORS (เรียกจากเซิร์ฟเวอร์ Saifa เท่านั้น เบราว์เซอร์ข้ามโดเมนเรียกไม่ได้)
 * - fail closed: คีย์สั้นกว่า 32 ตัวหรือไม่ได้ตั้ง = ปิดรับ; คีย์ sandbox ซ้ำกับ production = ไม่รับคีย์ sandbox
 * - logic ทั้งหมดอยู่ใน SQL (booking_api_*_v1, service_role เท่านั้น) ฟังก์ชันนี้แค่ตรวจคีย์/รูปแบบ/อัตราการเรียก
 * - บันทึกการเรียก (booking_api_log) ไม่เก็บชื่อ/เบอร์ลูกค้า; คิวที่จองลงเป็นพนักงานบอท (role admin) สถานะตามกติกาเดียวกับแอดมิน
 */

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("QLASS_SUPABASE_SECRET_KEY")
  ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MIN_KEY_LENGTH = 32;
const productionKey = (Deno.env.get("QLASS_BOOKING_API_KEY") ?? "").trim();
const rawSandboxKey = (Deno.env.get("QLASS_BOOKING_API_SANDBOX_KEY") ?? "").trim();
const sandboxKey = rawSandboxKey === productionKey ? "" : rawSandboxKey;
const configuredKeys: Array<{ kind: "production" | "sandbox"; key: string }> = [
  { kind: "production" as const, key: productionKey },
  { kind: "sandbox" as const, key: sandboxKey },
].filter((k) => k.key.length >= MIN_KEY_LENGTH);

// จำกัดอัตรา (ต่อคีย์ ต่อนาที) นับจาก booking_api_log
const RATE_LIMIT_PER_MINUTE: Record<string, number> = {
  "GET /v1/branches": 60,
  "POST /v1/availability/check": 300,
  "GET /v1/availability/slots": 300,
  "POST /v1/bookings": 30,
};
const MAX_BODY_BYTES = 8 * 1024;

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const jsonHeaders = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store" };

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

const errorMessages: Record<string, string> = {
  UNAUTHORIZED: "API key ไม่ถูกต้อง",
  NOT_CONFIGURED: "บริการยังไม่เปิดใช้งาน",
  NOT_FOUND: "ไม่พบ endpoint นี้",
  METHOD_NOT_ALLOWED: "ไม่รองรับ method นี้",
  RATE_LIMITED: "เรียกถี่เกินไป กรุณาลองใหม่ภายหลัง",
  INVALID_REQUEST: "รูปแบบคำขอไม่ถูกต้อง",
  INVALID_BRANCH: "ไม่รู้จักรหัสสาขา",
  INVALID_SKU: "ไม่รู้จักรหัสบริการ (SKU)",
  INVALID_TIME: "เวลาไม่ถูกต้อง (ต้องเป็น ISO 8601 มีโซนเวลา และนาทีเป็นพหุคูณของ 5)",
  INVALID_CUSTOMER: "ชื่อ เบอร์โทร หรือประเภทลูกค้า (new/old) ไม่ถูกต้อง",
  INVALID_REFERENCE: "reference_id ไม่ถูกต้อง (ตัวอักษร ตัวเลข _ - ไม่เกิน 64 ตัว)",
  REFERENCE_ID_REUSED: "reference_id นี้ถูกใช้กับข้อมูลการจองอื่นแล้ว",
  SLOT_UNAVAILABLE: "คิวเวลานี้ถูกจองไปแล้วหรือไม่ว่าง",
  OUTSIDE_BOOKING_WINDOW: "จองได้ล่วงหน้าไม่เกิน 60 วัน และต้องก่อนเวลานัดอย่างน้อย 2 ชั่วโมง",
  PAST_TIME: "เวลาที่ขอผ่านมาแล้ว",
  SERVICE_NOT_AT_BRANCH: "สาขานี้ไม่มีบริการนี้",
  BRANCH_NOT_ACCEPTING: "สาขานี้ยังไม่เปิดรับจองผ่านระบบ",
  INTERNAL_ERROR: "ระบบคลินิกขัดข้อง",
};

function fail(errorCode: string, status: number) {
  return respond({ success: false, error_code: errorCode, message: errorMessages[errorCode] ?? errorCode }, status);
}

function constantTimeEqual(left: string, right: string) {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let result = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) result |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return result === 0;
}

function authenticate(req: Request): "production" | "sandbox" | null {
  const provided = (req.headers.get("x-api-key") ?? "").trim();
  if (!provided) return null;
  let matched: "production" | "sandbox" | null = null;
  // เทียบทุกคีย์เสมอ (ไม่ออกก่อน) เพื่อไม่ให้เวลาตอบบอกว่าตรงคีย์ไหน
  for (const k of configuredKeys) if (constantTimeEqual(provided, k.key)) matched = k.kind;
  return matched;
}

// ISO 8601 ที่ต้องมีโซนเวลา (Z หรือ ±hh:mm) — ไม่มีโซน = กำกวม ปฏิเสธ
const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
function parseStartTime(value: unknown): string | null {
  if (typeof value !== "string" || !ISO_WITH_ZONE.test(value)) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  const year = new Date(ms).getUTCFullYear();
  if (year < 2000 || year > 2100) return null;
  return new Date(ms).toISOString();
}

function parseDay(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return value;
}

function cleanCode(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toUpperCase();
  return v.length >= 1 && v.length <= max && /^[A-Z0-9-]+$/.test(v) ? v : null;
}

async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  const text = await req.text();
  if (text.length === 0 || new TextEncoder().encode(text).length > MAX_BODY_BYTES) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function rpcError(error: { message?: string }) {
  const code = String(error?.message ?? "");
  if (["INVALID_BRANCH", "INVALID_SKU", "INVALID_TIME", "INVALID_CUSTOMER", "INVALID_REFERENCE"].includes(code)) return fail(code, 422);
  if (code === "REFERENCE_ID_REUSED") return fail(code, 409);
  console.error("[booking-api] rpc failed:", code);
  return fail("INTERNAL_ERROR", 500);
}

async function overRateLimit(kind: string, endpoint: string): Promise<boolean> {
  const limit = RATE_LIMIT_PER_MINUTE[endpoint];
  if (!limit) return false;
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count, error } = await supabase
    .from("booking_api_log").select("id", { count: "exact", head: true })
    .eq("key_kind", kind).eq("endpoint", endpoint).gte("at", since);
  if (error) return false; // นับไม่ได้ = ไม่บล็อกคำขอปกติ
  return (count ?? 0) >= limit;
}

async function writeLog(entry: Record<string, unknown>) {
  try {
    const { error } = await supabase.from("booking_api_log").insert(entry);
    if (error) console.error("[booking-api] log failed:", error.message);
  } catch (err) {
    console.error("[booking-api] log failed:", err instanceof Error ? err.message : err);
  }
}

Deno.serve(async (req) => {
  const started = Date.now();
  if (configuredKeys.length === 0) return fail("NOT_CONFIGURED", 503);

  const kind = authenticate(req);
  if (!kind) return fail("UNAUTHORIZED", 401);

  const url = new URL(req.url);
  const at = url.pathname.indexOf("/v1/");
  const route = at >= 0 ? url.pathname.slice(at).replace(/\/+$/, "") : "";
  const endpoint = `${req.method} ${route}`;

  const known: Record<string, string[]> = {
    "/v1/branches": ["GET"],
    "/v1/availability/check": ["POST"],
    "/v1/availability/slots": ["GET"],
    "/v1/bookings": ["POST"],
  };
  if (!known[route]) return fail("NOT_FOUND", 404);
  if (!known[route].includes(req.method)) return fail("METHOD_NOT_ALLOWED", 405);

  let status = 200;
  let branchCode: string | null = null;
  let sku: string | null = null;
  let detail: Record<string, unknown> | null = null;
  let res: Response;

  try {
    if (await overRateLimit(kind, endpoint)) {
      status = 429;
      res = fail("RATE_LIMITED", 429);
    } else if (route === "/v1/bookings") {
      const body = await readJson(req);
      const customer = body && body.customer && typeof body.customer === "object" && !Array.isArray(body.customer)
        ? body.customer as Record<string, unknown> : null;
      const reference = typeof body?.reference_id === "string" ? body.reference_id.trim() : "";
      branchCode = cleanCode(body?.branch_code, 10);
      sku = cleanCode(body?.sku, 60);
      const start = parseStartTime(body?.start_time);
      const name = typeof customer?.name === "string" ? customer.name : "";
      const phone = typeof customer?.phone === "string" ? customer.phone : "";
      const type = typeof customer?.type === "string" ? customer.type : "";
      const note = typeof body?.note === "string" ? body.note : "";
      if (!body) { res = fail("INVALID_REQUEST", 422); }
      else if (!/^[A-Za-z0-9_-]{1,64}$/.test(reference)) { res = fail("INVALID_REFERENCE", 422); }
      else if (!branchCode) { res = fail("INVALID_BRANCH", 422); }
      else if (!sku) { res = fail("INVALID_SKU", 422); }
      else if (!start) { res = fail("INVALID_TIME", 422); }
      else if (!name || !phone || !type) { res = fail("INVALID_CUSTOMER", 422); }
      else {
        const { data, error } = await supabase.rpc("booking_api_create_v1", {
          p_reference_id: reference, p_branch_code: branchCode, p_sku: sku, p_start: start,
          p_name: name.slice(0, 200), p_phone: phone.slice(0, 40), p_customer_type: type.slice(0, 10),
          p_note: note.slice(0, 1000), p_dry_run: kind === "sandbox",
        });
        if (error) { res = rpcError(error); }
        else if (data?.success === true) {
          detail = { booking_id: data.booking_id, sandbox: kind === "sandbox" };
          const { sandbox: _sandbox, ...publicBody } = data;
          res = respond(publicBody, 201);
        } else {
          detail = { error_code: data?.error_code ?? null, reason: data?.reason ?? null };
          const alternatives = Array.isArray(data?.alternatives) ? data.alternatives : [];
          const code = String(data?.error_code ?? "INTERNAL_ERROR");
          res = respond({ success: false, error_code: code, message: errorMessages[code] ?? code, ...(code === "SLOT_UNAVAILABLE" ? { alternatives } : {}) }, Number(data?.http) || 409);
        }
      }
      status = res.status;
    } else if (route === "/v1/branches") {
      const { data, error } = await supabase.rpc("booking_api_branches_v1");
      if (error) { status = 500; res = rpcError(error); } else res = respond({ branches: data });
    } else if (route === "/v1/availability/check") {
      const body = await readJson(req);
      branchCode = cleanCode(body?.branch_code, 10);
      sku = cleanCode(body?.sku, 60);
      const start = parseStartTime(body?.start_time);
      if (!body || !branchCode || !sku) { status = 422; res = fail(!body ? "INVALID_REQUEST" : !branchCode ? "INVALID_BRANCH" : "INVALID_SKU", 422); }
      else if (!start) { status = 422; res = fail("INVALID_TIME", 422); }
      else {
        const { data, error } = await supabase.rpc("booking_api_check_v1", { p_branch_code: branchCode, p_sku: sku, p_start: start });
        if (error) { res = rpcError(error); status = res.status; }
        else {
          detail = { available: data.available, reason: data.reason ?? null };
          // ว่างแล้วไม่ต้องส่ง alternatives (ตามตัวอย่างใน brief)
          res = respond(data.available ? { available: true } : data);
        }
      }
    } else {
      // GET /v1/availability/slots
      branchCode = cleanCode(url.searchParams.get("branch_code"), 10);
      sku = cleanCode(url.searchParams.get("sku"), 60);
      const day = parseDay(url.searchParams.get("date"));
      if (!branchCode) { status = 422; res = fail("INVALID_BRANCH", 422); }
      else if (!sku) { status = 422; res = fail("INVALID_SKU", 422); }
      else if (!day) { status = 422; res = fail("INVALID_TIME", 422); }
      else {
        const { data, error } = await supabase.rpc("booking_api_slots_v1", { p_branch_code: branchCode, p_sku: sku, p_date: day });
        if (error) { res = rpcError(error); status = res.status; } else res = respond(data);
      }
    }
  } catch (err) {
    console.error("[booking-api] unexpected:", err instanceof Error ? err.message : err);
    status = 500;
    res = fail("INTERNAL_ERROR", 500);
  }

  await writeLog({ endpoint, key_kind: kind, status: res.status, ms: Date.now() - started, branch_code: branchCode, sku, detail });
  return res;
});
