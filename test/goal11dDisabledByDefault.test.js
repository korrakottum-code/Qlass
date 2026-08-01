import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const client = readFileSync(new URL("../src/utils/clientObservability.js", import.meta.url), "utf8");
const worker = readFileSync(new URL("../supabase/functions/staff-session/index.ts", import.meta.url), "utf8");

test("Goal 11D browser and server controls fail closed unless explicitly enabled", () => {
  assert.match(client, /VITE_ENABLE_SERVER_DIAGNOSTICS === "true"/);
  assert.match(client, /VITE_ENABLE_CONTROLLED_REFRESH === "true"/);
  assert.match(client, /if \(!serverDiagnosticsEnabled \|\| !token\) return \{ attempted: false, accepted: 0 \}/);
  assert.match(client, /if \(!controlledRefreshEnabled \|\| !token\) return \{ refreshRequired: false \}/);

  assert.match(worker, /QLASS_OBSERVABILITY_ENABLED"\) === "true"/);
  assert.match(worker, /QLASS_CONTROLLED_REFRESH_ENABLED"\) === "true"/);
  assert.match(worker, /if \(!observabilityEnabled\) return response\(\{ enabled: false, accepted: 0 \}/);
  assert.match(worker, /const refreshRequired = controlledRefreshEnabled\s*&& validRelease\(requiredClientRelease\)\s*&& validRelease\(body\.release\)\s*&& body\.release !== requiredClientRelease/);
});
