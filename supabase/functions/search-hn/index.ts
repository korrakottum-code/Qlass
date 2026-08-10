import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PROCLINIC_API = "https://proclinicth.com/admin/api/customer";
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
// During the API-key handover this custom secret can use an sb_secret key.
// Keep the Supabase-managed legacy value as a compatibility fallback until all
// environments are migrated and the legacy keys are deactivated.
const serviceRoleKey = Deno.env.get("QLASS_SUPABASE_SECRET_KEY")
  ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Exact-match origin allowlist. QLASS_ALLOWED_ORIGINS (comma-separated) wins;
// the legacy single QLASS_ALLOWED_ORIGIN remains as a fallback. No wildcards:
// every allowed origin is spelled out, and an empty list fails closed.
const allowedOrigins = (Deno.env.get("QLASS_ALLOWED_ORIGINS") ?? Deno.env.get("QLASS_ALLOWED_ORIGIN") ?? "")
  .split(",").map((value) => value.trim()).filter(Boolean);
function isAllowedOrigin(origin: string | null): origin is string {
  return typeof origin === "string" && allowedOrigins.includes(origin);
}
const proclinicCookiesB64 = Deno.env.get("PROCLINIC_COOKIES_B64") ?? "";
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

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
    .select("id,active")
    .eq("id", session.staff_id)
    .eq("active", true)
    .maybeSingle();
  if (!staff) return null;

  await supabase.from("app_sessions").update({ last_seen_at: new Date().toISOString() }).eq("id", session.id);
  return staff;
}

function buildCookieHeader(): { cookieStr: string; xsrfToken: string } {
  if (!proclinicCookiesB64) return { cookieStr: "", xsrfToken: "" };
  try {
    const cookies: Array<{ name: string; value: string }> = JSON.parse(atob(proclinicCookiesB64));
    const cookieStr = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
    const xsrfRaw = cookies.find((cookie) => cookie.name === "XSRF-TOKEN")?.value ?? "";
    return { cookieStr, xsrfToken: decodeURIComponent(xsrfRaw) };
  } catch {
    return { cookieStr: "", xsrfToken: "" };
  }
}

type HnCustomer = {
  hnId: string;
  firstname: string;
  lastname: string;
  nickname: string;
  telephone: string;
  birthdate: string;
};

async function searchProclinic(q: string): Promise<{ data: HnCustomer[]; ok: boolean }> {
  const { cookieStr, xsrfToken } = buildCookieHeader();
  if (!cookieStr) return { data: [], ok: false };
  try {
    const url = new URL(PROCLINIC_API);
    url.searchParams.set("q", q);
    const result = await fetch(url, {
      headers: {
        "Accept": "application/json",
        "X-Requested-With": "XMLHttpRequest",
        "Referer": "https://proclinicth.com/admin/customer",
        "Cookie": cookieStr,
        "X-XSRF-TOKEN": xsrfToken,
      },
    });
    if (!result.ok) return { data: [], ok: false };
    const json = await result.json();
    return {
      ok: true,
      data: (json?.data ?? []).slice(0, 10).map((customer: Record<string, unknown>) => ({
        hnId: String(customer.hn_id ?? ""),
        firstname: String(customer.firstname ?? ""),
        lastname: String(customer.lastname ?? ""),
        nickname: String(customer.nickname ?? ""),
        telephone: String(customer.telephone_number ?? ""),
        birthdate: String(customer.birthdate ?? ""),
      })),
    };
  } catch {
    return { data: [], ok: false };
  }
}

async function searchSupabase(q: string): Promise<HnCustomer[]> {
  const isPhone = /^\d+$/.test(q);
  let query = supabase
    .from("hn_customers")
    .select("hn_id,firstname,lastname,nickname,telephone,birthdate")
    .limit(10);
  if (isPhone) {
    query = query.ilike("telephone", `%${q}%`);
  } else {
    const safeTokens = q.split(/\s+/).filter(Boolean).map((token) => {
      // This string is passed to PostgREST's `or` expression, so only retain
      // letters and digits (Thai text is included by Unicode properties).
      return token.replace(/[^\p{L}\p{N}]/gu, "");
    }).filter(Boolean);
    if (safeTokens.length === 0) return [];
    for (const safe of safeTokens) {
      query = query.or(`firstname.ilike.%${safe}%,lastname.ilike.%${safe}%,nickname.ilike.%${safe}%`);
    }
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((customer) => ({
    hnId: String(customer.hn_id ?? ""),
    firstname: customer.firstname ?? "",
    lastname: customer.lastname ?? "",
    nickname: customer.nickname ?? "",
    telephone: customer.telephone ?? "",
    birthdate: customer.birthdate ?? "",
  }));
}

async function auditLookup(staffId: string, q: string, resultCount: number, source: "proclinic" | "supabase") {
  const { error } = await supabase.from("hn_lookup_audit").insert({
    staff_id: staffId,
    query_hash: await sha256(q),
    result_count: resultCount,
    source,
  });
  if (error) console.error("hn lookup audit error", error.message);
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (!isAllowedOrigin(origin)) return response({ error: "origin_not_allowed" }, 403, origin);
  if (req.method !== "POST") return response({ error: "method_not_allowed" }, 405, origin);

  try {
    const staff = await findActiveStaff(req.headers.get("x-qlass-session"));
    if (!staff) return response({ error: "invalid_session" }, 401, origin);

    const body = await req.json();
    const q = typeof body?.q === "string" ? body.q.trim() : "";
    if (q.length < 2 || q.length > 100) return response({ data: [], source: "none" }, 400, origin);

    const proclinic = await searchProclinic(q);
    const source = proclinic.ok ? "proclinic" : "supabase";
    const data = proclinic.ok ? proclinic.data : await searchSupabase(q);
    await auditLookup(staff.id, q, data.length, source);
    return response({ data, source, cookiesExpired: !proclinic.ok }, 200, origin);
  } catch (error) {
    console.error("search-hn error", error);
    return response({ error: "service_unavailable" }, 500, origin);
  }
});
