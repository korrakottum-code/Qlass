import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workers = [
  "staff-session",
  "search-hn",
  "search-hn-recovery",
].map((name) => [name, readFileSync(new URL(`../supabase/functions/${name}/index.ts`, import.meta.url), "utf8")]);

test("every Edge Function gates on the exact-match origin allowlist and fails closed", () => {
  for (const [name, src] of workers) {
    // Comma-separated allowlist with the legacy single-origin fallback.
    assert.match(src, /QLASS_ALLOWED_ORIGINS"\) \?\? Deno\.env\.get\("QLASS_ALLOWED_ORIGIN"\)/, name);
    // Empty entries are dropped, so an unset/blank secret allows nobody.
    assert.match(src, /\.split\(","\)\.map\(\(value\) => value\.trim\(\)\)\.filter\(Boolean\)/, name);
    // Exact string membership only — the allowlist never does wildcard,
    // prefix, or suffix matching on origins.
    assert.match(src, /return typeof origin === "string" && allowedOrigins\.includes\(origin\);/, name);
    // The request gate and CORS header both use the same check.
    assert.match(src, /if \(!isAllowedOrigin\(origin\)\) return response\(\{ error: "origin_not_allowed" \}, 403, origin\);/, name);
    assert.match(src, /"Access-Control-Allow-Origin": isAllowedOrigin\(origin\) \? origin : "null"/, name);
  }
});
