import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const PROCLINIC_API = "https://proclinicth.com/admin/api/customer";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PROCLINIC_COOKIES_B64 = Deno.env.get("PROCLINIC_COOKIES_B64") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// แปลง cookies.json base64 → cookie header string
function buildCookieHeader(): { cookieStr: string; xsrfToken: string } {
  if (!PROCLINIC_COOKIES_B64) return { cookieStr: "", xsrfToken: "" };
  try {
    const json = atob(PROCLINIC_COOKIES_B64);
    const cookies: Array<{ name: string; value: string }> = JSON.parse(json);
    const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const xsrfRaw = cookies.find((c) => c.name === "XSRF-TOKEN")?.value ?? "";
    const xsrfToken = decodeURIComponent(xsrfRaw);
    return { cookieStr, xsrfToken };
  } catch {
    return { cookieStr: "", xsrfToken: "" };
  }
}

// ค้นหาใน Pro Clinic API โดยตรง
async function searchProclinic(q: string): Promise<{ data: unknown[]; ok: boolean }> {
  const { cookieStr, xsrfToken } = buildCookieHeader();
  if (!cookieStr) return { data: [], ok: false };

  try {
    const url = new URL(PROCLINIC_API);
    url.searchParams.set("q", q);
    const res = await fetch(url.toString(), {
      headers: {
        "Accept": "application/json",
        "X-Requested-With": "XMLHttpRequest",
        "Referer": "https://proclinicth.com/admin/customer",
        "Cookie": cookieStr,
        "X-XSRF-TOKEN": xsrfToken,
      },
    });
    if (!res.ok) return { data: [], ok: false };
    const json = await res.json();
    const items = (json?.data ?? []).slice(0, 10).map((c: Record<string, unknown>) => ({
      hnId: c.hn_id,
      firstname: c.firstname ?? "",
      lastname: c.lastname ?? "",
      nickname: c.nickname ?? "",
      telephone: c.telephone_number ?? "",
      birthdate: c.birthdate ?? "",
    }));
    return { data: items, ok: true };
  } catch {
    return { data: [], ok: false };
  }
}

// Fallback: ค้นหาใน Supabase hn_customers
async function searchSupabase(q: string): Promise<unknown[]> {
  const tokens = q.trim().split(/\s+/).filter((t) => t.length > 0);
  let url = `${SUPABASE_URL}/rest/v1/hn_customers?limit=10`;

  for (const t of tokens) {
    const safe = encodeURIComponent(t.replace(/[(),]/g, ""));
    url += `&or=(firstname.ilike.*${safe}*,lastname.ilike.*${safe}*,nickname.ilike.*${safe}*)`;
  }

  const res = await fetch(url, {
    headers: {
      "apikey": SUPABASE_SERVICE_KEY,
      "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Accept": "application/json",
    },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data ?? []).map((c: Record<string, unknown>) => ({
    hnId: c.hn_id,
    firstname: c.firstname ?? "",
    lastname: c.lastname ?? "",
    nickname: c.nickname ?? "",
    telephone: c.telephone ?? "",
    birthdate: c.birthdate ?? "",
  }));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { q } = await req.json();
    if (!q || q.trim().length < 2) {
      return new Response(JSON.stringify({ data: [], source: "none" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. ลอง Pro Clinic ก่อน
    const { data: proclinicData, ok } = await searchProclinic(q.trim());
    if (ok) {
      return new Response(
        JSON.stringify({ data: proclinicData, source: "proclinic" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Fallback → Supabase hn_customers
    const supabaseData = await searchSupabase(q.trim());
    return new Response(
      JSON.stringify({ data: supabaseData, source: "supabase", cookiesExpired: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
