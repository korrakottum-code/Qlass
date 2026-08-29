import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * API ภายนอก: สถิติคิวแบบรวมยอด (read-only)
 *
 * GET /functions/v1/external-queue-stats?since=2026-08-01&until=2026-08-31
 * Header: Authorization: Bearer <QLASS_EXTERNAL_API_KEY>
 *
 * ใช้ให้ระบบอื่น (เช่น แดชบอร์ดผู้บริหาร) ดึง "จำนวนคิว" ไปคำนวณต่อ เช่น ต้นทุน
 * ต่อคิวเมื่อจับคู่กับยอดโฆษณา — โดย **ไม่ต้องให้สิทธิ์เข้าฐานข้อมูล Qlass**
 *
 * เรื่องที่ตั้งใจออกแบบไว้แบบนี้:
 * - คนละ auth กับ staff-session โดยสิ้นเชิง เพิกถอน QLASS_EXTERNAL_API_KEY ได้
 *   โดยไม่กระทบการล็อกอินของทีม และไม่มีทางใช้คีย์นี้ทำอย่างอื่นนอกจากอ่านสถิติ
 * - **ไม่มี CORS allowlist เพราะไม่ใช่ฟังก์ชันที่เบราว์เซอร์เรียก** — เป็น
 *   server-to-server ที่ถือ secret key ไม่ตอบ Access-Control-Allow-Origin ให้ใคร
 *   ดังนั้นหน้าเว็บข้ามโดเมนเรียกไม่ได้อยู่แล้ว (ต่างจาก staff-session/search-hn
 *   ที่เบราว์เซอล์เรียกตรงจึงต้องมี origin allowlist)
 * - การรวมยอดทำใน SQL (public.external_queue_stats) ข้อมูลลูกค้าจึงไม่เคยออกจาก
 *   ฐานข้อมูล ฟังก์ชันนี้ไม่แตะคอลัมน์ name / phone / note / price เลย
 * - อ่านอย่างเดียว ไม่มีคำสั่งเขียนใดๆ
 */

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("QLASS_SUPABASE_SECRET_KEY")
  ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// fail closed: คีย์สั้นกว่า 32 ตัวอักษรหรือไม่ได้ตั้งค่า = ปิดรับทุก request
const MIN_KEY_LENGTH = 32;
const externalApiKey = (Deno.env.get("QLASS_EXTERNAL_API_KEY") ?? "").trim();
const externalApiKeyReady = externalApiKey.length >= MIN_KEY_LENGTH;

const MAX_RANGE_DAYS = 370;

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const jsonHeaders = { "Content-Type": "application/json", "Cache-Control": "private, no-store" };

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let i = 0; i < left.length; i += 1) result |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return result === 0;
}

function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function parseIsoDate(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;
  return value;
}

Deno.serve(async (req) => {
  if (req.method !== "GET") return response({ error: "method_not_allowed" }, 405);

  if (!externalApiKeyReady) return response({ error: "external_api_not_configured" }, 503);

  const token = bearerToken(req);
  if (!token || !constantTimeEqual(token, externalApiKey)) {
    return response({ error: "unauthorized" }, 401);
  }

  const url = new URL(req.url);
  const since = parseIsoDate(url.searchParams.get("since"));
  const until = parseIsoDate(url.searchParams.get("until"));
  if (!since || !until) {
    return response({ error: "since_until_required", detail: "ต้องระบุ since และ until รูปแบบ YYYY-MM-DD" }, 400);
  }
  if (since > until) return response({ error: "invalid_range", detail: "since ต้องไม่เกิน until" }, 400);

  const rangeDays = Math.floor(
    (Date.parse(`${until}T00:00:00Z`) - Date.parse(`${since}T00:00:00Z`)) / 86_400_000
  ) + 1;
  if (rangeDays > MAX_RANGE_DAYS) {
    return response({ error: "range_too_large", detail: `ช่วงวันที่ต้องไม่เกิน ${MAX_RANGE_DAYS} วัน` }, 400);
  }

  const { data, error } = await supabase.rpc("external_queue_stats", { p_since: since, p_until: until });
  if (error) {
    console.error("[external-queue-stats] rpc failed:", error.message);
    return response({ error: "query_failed" }, 500);
  }

  return response({ ...data, asOf: new Date().toISOString() });
});
