import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * API ภายนอก: รายชื่อ + เบอร์ลูกค้าที่โอนแล้ว (แคมเปญ 6 ปี) ให้ทีมโฆษณา — อ่านอย่างเดียว
 *
 * GET /functions/v1/deposit-campaign-list?since=2026-11-23&until=2026-11-27   (ไม่ใส่ = 30 วันล่าสุด)
 * Header: Authorization: Bearer <QLASS_DEPOSIT_STATS_API_KEY>  (คีย์เดียวกับยอดรวม)
 *
 * - ใช้คีย์ QLASS_DEPOSIT_STATS_API_KEY ร่วมกับ deposit-campaign-stats (เจ้าของสั่ง) แต่คนละ function คนละ RPC
 *   ถ้าคีย์ซ้ำกับ QLASS_EXTERNAL_API_KEY ถือว่ายังไม่ได้ตั้ง — ลบ secret = ปิดทั้งยอดรวมและรายชื่อ
 * - server-to-server: ไม่มี CORS
 * - ไม่ส่งสลิป หมายเหตุ เหตุผลยกเลิก ผู้บันทึก หรือ id ใด ๆ (เลือกคอลัมน์ใน SQL public.deposit_campaign_list_v1)
 * - ย้อนหลังไม่เกิน 30 วัน, 30 ครั้ง/ชม., หมดอายุเองหลัง 3 ธ.ค. 2569 — กันซ้ำทั้งที่นี่และใน SQL
 * - deploy ด้วย --no-verify-jwt เพราะตรวจคีย์เอง
 */

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("QLASS_SUPABASE_SECRET_KEY")
  ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MIN_KEY_LENGTH = 32;
// ใช้คีย์เดียวกับ deposit-campaign-stats (เจ้าของสั่ง 28 พ.ย. 2569: ไม่สร้างคีย์ใหม่) — ลบ secret นี้ = ปิดทั้งสองช่อง
const apiKey = (Deno.env.get("QLASS_DEPOSIT_STATS_API_KEY") ?? "").trim();
const otherKey = (Deno.env.get("QLASS_EXTERNAL_API_KEY") ?? "").trim();
const apiKeyReady = apiKey.length >= MIN_KEY_LENGTH && apiKey !== otherKey;

const WINDOW_DAYS = 30;
// วันสุดท้ายที่ตอบ (เวลาไทย) — แคมเปญจบ 2 ธ.ค. 2569 เผื่อเช็คยอดปิด 1 วัน
const LAST_DAY = "2026-12-03";

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

function bangkokToday() {
  return new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
}

function addDays(iso: string, days: number) {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

const SQL_ERRORS: Record<string, [number, string]> = {
  api_expired: [410, "api_expired"],
  rate_limited: [429, "rate_limited"],
  invalid_range: [400, "invalid_range"],
  range_out_of_window: [400, "range_out_of_window"],
};

Deno.serve(async (req) => {
  if (req.method !== "GET") return response({ error: "method_not_allowed" }, 405);
  if (!apiKeyReady) return response({ error: "api_not_configured" }, 503);

  const token = bearerToken(req);
  if (!token || !constantTimeEqual(token, apiKey)) return response({ error: "unauthorized" }, 401);

  const today = bangkokToday();
  if (today > LAST_DAY) return response({ error: "api_expired" }, 410);

  const url = new URL(req.url);
  const rawSince = url.searchParams.get("since");
  const rawUntil = url.searchParams.get("until");
  const since = rawSince === null ? addDays(today, -(WINDOW_DAYS - 1)) : parseIsoDate(rawSince);
  const until = rawUntil === null ? today : parseIsoDate(rawUntil);
  if (!since || !until) {
    return response({ error: "invalid_date", detail: "since / until ต้องเป็น YYYY-MM-DD" }, 400);
  }
  if (since > until) return response({ error: "invalid_range", detail: "since ต้องไม่เกิน until" }, 400);
  if (since < addDays(today, -(WINDOW_DAYS - 1)) || until > today) {
    return response({ error: "range_out_of_window", detail: `ย้อนหลังได้ไม่เกิน ${WINDOW_DAYS} วัน และห้ามวันในอนาคต` }, 400);
  }

  const { data, error } = await supabase.rpc("deposit_campaign_list_v1", { p_since: since, p_until: until });
  if (error) {
    const known = Object.keys(SQL_ERRORS).find((code) => (error.message ?? "").includes(code));
    if (known) {
      const [status, code] = SQL_ERRORS[known];
      return response({ error: code }, status);
    }
    console.error("[deposit-campaign-list] rpc failed:", error.message);
    return response({ error: "query_failed" }, 500);
  }

  return response({ ...data, asOf: new Date().toISOString() });
});
