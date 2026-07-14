import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
// During the API-key handover this custom secret can use an sb_secret key.
// Keep the Supabase-managed legacy value as a compatibility fallback until all
// environments are migrated and the legacy keys are deactivated.
const serviceRoleKey = Deno.env.get("QLASS_SUPABASE_SECRET_KEY")
  ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const allowedOrigin = Deno.env.get("QLASS_ALLOWED_ORIGIN") ?? "";
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const jsonHeaders = { "Content-Type": "application/json" };

function corsHeaders(origin: string | null) {
  return {
    ...jsonHeaders,
    "Access-Control-Allow-Origin": allowedOrigin && origin === allowedOrigin ? origin : "null",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let i = 0; i < left.length; i += 1) result |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return result === 0;
}

function publicStaff(staff: Record<string, unknown>) {
  return {
    id: staff.id,
    name: staff.name,
    nickname: staff.nickname ?? "",
    branchId: staff.branch_id,
    role: staff.role,
    active: staff.active,
  };
}

const authenticatedRoles = new Set(["ceo", "superadmin", "head_admin", "admin", "branch_manager", "cashier"]);
const staffManagementRoles = new Set(["superadmin", "head_admin"]);

function staffDetails(staff: Record<string, unknown>, includePin: boolean) {
  const details: Record<string, unknown> = {
    ...publicStaff(staff),
    phone: staff.phone ?? "",
    commissionRates: {
      new: Number(staff.commission_rate_new ?? 0),
      old: Number(staff.commission_rate_old ?? 0),
      course: Number(staff.commission_rate_course ?? 0),
    },
  };
  if (includePin) details.pin = staff.pin ?? "";
  return details;
}

async function createSession(staffId: string) {
  const rawToken = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const tokenHash = await sha256(rawToken);
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase.from("app_sessions").insert({ token_hash: tokenHash, staff_id: staffId, expires_at: expiresAt });
  if (error) throw error;
  return { token: rawToken, expiresAt };
}

async function findSession(token: unknown) {
  if (typeof token !== "string" || token.length !== 64) return null;
  const tokenHash = await sha256(token);
  const { data: session } = await supabase
    .from("app_sessions")
    .select("id,staff_id,expires_at,revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (!session || session.revoked_at || new Date(session.expires_at) <= new Date()) return null;
  const { data: staff } = await supabase
    .from("staff")
    .select("id,name,nickname,branch_id,role,active")
    .eq("id", session.staff_id)
    .eq("active", true)
    .maybeSingle();
  if (!staff) return null;
  await supabase.from("app_sessions").update({ last_seen_at: new Date().toISOString() }).eq("id", session.id);
  return { session, user: publicStaff(staff) };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (!allowedOrigin || origin !== allowedOrigin) return response({ error: "origin_not_allowed" }, 403, origin);
  if (req.method !== "POST") return response({ error: "method_not_allowed" }, 405, origin);

  try {
    const body = await req.json();
    if (body?.action === "directory") {
      const { data, error } = await supabase.from("staff").select("id,name,nickname,branch_id,role,active").eq("active", true).order("created_at");
      if (error) throw error;
      return response({ staff: (data ?? []).map(publicStaff) }, 200, origin);
    }

    if (body?.action === "staff-details") {
      const current = await findSession(body.token);
      if (!current) return response({ error: "invalid_session" }, 401, origin);
      if (!authenticatedRoles.has(String(current.user.role ?? ""))) {
        return response({ error: "forbidden" }, 403, origin);
      }

      const includePin = staffManagementRoles.has(String(current.user.role));
      const columns = includePin
        ? "id,name,nickname,phone,branch_id,role,active,pin,commission_rate_new,commission_rate_old,commission_rate_course"
        : "id,name,nickname,phone,branch_id,role,active,commission_rate_new,commission_rate_old,commission_rate_course";
      const { data, error } = await supabase.from("staff").select(columns).order("created_at");
      if (error) throw error;
      return response({ staff: (data ?? []).map((staff) => staffDetails(staff, includePin)) }, 200, origin);
    }

    if (body?.action === "session") {
      const current = await findSession(body.token);
      if (!current) return response({ error: "invalid_session" }, 401, origin);
      return response({ user: current.user, expiresAt: current.session.expires_at }, 200, origin);
    }

    if (body?.action === "logout") {
      if (typeof body.token === "string") {
        const tokenHash = await sha256(body.token);
        await supabase.from("app_sessions").update({ revoked_at: new Date().toISOString() }).eq("token_hash", tokenHash);
      }
      return response({ ok: true }, 200, origin);
    }

    if (body?.action !== "login" || typeof body.staffId !== "string" || !/^\d{4}$/.test(body.pin ?? "")) {
      return response({ error: "invalid_credentials" }, 401, origin);
    }

    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const attemptKey = await sha256(`${body.staffId}:${clientIp}`);
    const { data: attempt } = await supabase.from("app_login_attempts").select("failures,locked_until").eq("identifier_hash", attemptKey).maybeSingle();
    if (attempt?.locked_until && new Date(attempt.locked_until) > new Date()) return response({ error: "try_later" }, 429, origin);

    const { data: staff, error } = await supabase.from("staff").select("id,name,nickname,branch_id,role,active,pin").eq("id", body.staffId).maybeSingle();
    if (error) throw error;
    if (!staff || !staff.active || !constantTimeEqual(String(staff.pin ?? ""), body.pin)) {
      const failures = (attempt?.failures ?? 0) + 1;
      const lockedUntil = failures >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;
      await supabase.from("app_login_attempts").upsert({ identifier_hash: attemptKey, failures, locked_until: lockedUntil, updated_at: new Date().toISOString() });
      return response({ error: "invalid_credentials" }, 401, origin);
    }

    await supabase.from("app_login_attempts").delete().eq("identifier_hash", attemptKey);
    const session = await createSession(staff.id);
    return response({ user: publicStaff(staff), session }, 200, origin);
  } catch (error) {
    console.error("staff-session error", error);
    return response({ error: "service_unavailable" }, 500, origin);
  }
});
