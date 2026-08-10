import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
const observabilityEnabled = Deno.env.get("QLASS_OBSERVABILITY_ENABLED") === "true";
const controlledRefreshEnabled = Deno.env.get("QLASS_CONTROLLED_REFRESH_ENABLED") === "true";
const requiredClientRelease = Deno.env.get("QLASS_REQUIRED_CLIENT_RELEASE") ?? "";
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const jsonHeaders = { "Content-Type": "application/json" };

function corsHeaders(origin: string | null) {
  return {
    ...jsonHeaders,
    "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin : "null",
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
const queueCreateErrors = new Set([
  "invalid_queue_payload", "past_date_not_allowed", "invalid_branch", "branch_forbidden",
  "invalid_room", "room_required", "invalid_procedure", "invalid_duration",
  "procedure_required", "invalid_promo", "invalid_time", "room_closed", "room_conflict",
  "request_id_forbidden", "invalid_session", "forbidden",
]);
const diagnosticEventNames = new Set([
  "client_error", "initial_load", "realtime_status", "render_error", "write_outcome",
]);
const diagnosticOutcomes = new Set(["started", "succeeded", "failed"]);
const diagnosticStages = new Set(["staff", "core", "history"]);
const diagnosticRealtimeStatuses = new Set(["SUBSCRIBED", "TIMED_OUT", "CLOSED", "CHANNEL_ERROR"]);

function validRelease(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9._-]{1,128}$/.test(value);
}

function sanitizeDiagnostic(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const event = value as Record<string, unknown>;
  if (!diagnosticEventNames.has(String(event.name)) || !validRelease(event.release)) return null;

  const safe: Record<string, unknown> = {
    release_id: event.release,
    event_name: event.name,
  };
  if (diagnosticOutcomes.has(String(event.outcome))) safe.outcome = event.outcome;
  if (diagnosticStages.has(String(event.stage))) safe.stage = event.stage;
  if (diagnosticRealtimeStatuses.has(String(event.status))) safe.realtime_status = event.status;
  if (Number.isInteger(event.durationMs) && Number(event.durationMs) >= 0 && Number(event.durationMs) <= 600000) {
    safe.duration_ms = event.durationMs;
  }
  return safe;
}

// Goal 18: staff writes go through this server boundary only. The payload is
// validated here because the browser can no longer be trusted once its direct
// staff grants are revoked.
function staffWriteRow(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const staff = value as Record<string, unknown>;
  const name = String(staff.name ?? "").trim();
  const role = String(staff.role ?? "");
  const pin = String(staff.pin ?? "");
  const rates = (staff.commissionRates && typeof staff.commissionRates === "object" && !Array.isArray(staff.commissionRates))
    ? staff.commissionRates as Record<string, unknown>
    : {};
  const rateNew = Number(rates.new ?? 0);
  const rateOld = Number(rates.old ?? 0);
  const rateCourse = Number(rates.course ?? 0);

  if (!name || !authenticatedRoles.has(role) || !/^\d{4}$/.test(pin)) return null;
  if (![rateNew, rateOld, rateCourse].every((rate) => Number.isFinite(rate) && rate >= 0)) return null;

  return {
    name,
    nickname: String(staff.nickname ?? ""),
    phone: String(staff.phone ?? ""),
    branch_id: staff.branchId ? String(staff.branchId) : null,
    role,
    pin,
    active: staff.active !== false,
    commission_rate_new: rateNew,
    commission_rate_old: rateOld,
    commission_rate_course: rateCourse,
  };
}

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
  if (!isAllowedOrigin(origin)) return response({ error: "origin_not_allowed" }, 403, origin);
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

    if (body?.action === "staff_create" || body?.action === "staff_update") {
      const current = await findSession(body.token);
      if (!current) return response({ error: "invalid_session" }, 401, origin);
      if (!staffManagementRoles.has(String(current.user.role ?? ""))) {
        return response({ error: "forbidden" }, 403, origin);
      }

      const row = staffWriteRow(body.staff);
      if (!row) return response({ error: "invalid_staff_payload" }, 400, origin);

      if (body.action === "staff_update") {
        if (typeof body.staffId !== "string" || body.staffId.length === 0) {
          return response({ error: "invalid_staff_payload" }, 400, origin);
        }
        const { data, error } = await supabase.from("staff").update(row).eq("id", body.staffId).select().single();
        if (error) throw error;
        return response({ staff: staffDetails(data, true) }, 200, origin);
      }

      const { data, error } = await supabase.from("staff").insert(row).select().single();
      if (error) throw error;
      return response({ staff: staffDetails(data, true) }, 200, origin);
    }

    if (body?.action === "staff_delete") {
      const current = await findSession(body.token);
      if (!current) return response({ error: "invalid_session" }, 401, origin);
      if (!staffManagementRoles.has(String(current.user.role ?? ""))) {
        return response({ error: "forbidden" }, 403, origin);
      }
      if (typeof body.staffId !== "string" || body.staffId.length === 0) {
        return response({ error: "invalid_staff_payload" }, 400, origin);
      }
      if (body.staffId === current.user.id) {
        return response({ error: "cannot_delete_self" }, 400, origin);
      }
      const { error } = await supabase.from("staff").delete().eq("id", body.staffId);
      if (error) throw error;
      return response({ ok: true }, 200, origin);
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

    if (body?.action === "create_queue_v1") {
      const current = await findSession(body.token);
      if (!current) return response({ error: "invalid_session" }, 401, origin);
      if (!authenticatedRoles.has(String(current.user.role ?? ""))) {
        return response({ error: "forbidden" }, 403, origin);
      }
      if (typeof body.requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId) || !body.queue || typeof body.queue !== "object" || Array.isArray(body.queue)) {
        return response({ error: "invalid_queue_payload" }, 400, origin);
      }

      const { data, error } = await supabase.rpc("create_queue_v1", {
        p_actor_staff_id: current.user.id,
        p_actor_session_id: current.session.id,
        p_request_id: body.requestId,
        p_payload: body.queue,
      });
      if (error) {
        const errorCode = String(error.message ?? "");
        if (queueCreateErrors.has(errorCode)) {
          const status = errorCode === "room_conflict" ? 409 : errorCode.endsWith("forbidden") || errorCode === "forbidden" ? 403 : 400;
          return response({ error: errorCode }, status, origin);
        }
        throw error;
      }
      return response({ queue: data }, 200, origin);
    }

    if (body?.action === "client_diagnostics") {
      const current = await findSession(body.token);
      if (!current) return response({ error: "invalid_session" }, 401, origin);
      if (!observabilityEnabled) return response({ enabled: false, accepted: 0 }, 200, origin);

      const events = Array.isArray(body.events) ? body.events.slice(0, 20) : [];
      const safeEvents = events.map(sanitizeDiagnostic).filter((event): event is Record<string, unknown> => Boolean(event));
      if (safeEvents.length > 0) {
        const { error } = await supabase.from("client_diagnostics").insert(safeEvents);
        if (error) throw error;
      }
      return response({ enabled: true, accepted: safeEvents.length }, 200, origin);
    }

    if (body?.action === "release_status") {
      const current = await findSession(body.token);
      if (!current) return response({ error: "invalid_session" }, 401, origin);
      const refreshRequired = controlledRefreshEnabled
        && validRelease(requiredClientRelease)
        && validRelease(body.release)
        && body.release !== requiredClientRelease;
      return response({ refreshRequired }, 200, origin);
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
