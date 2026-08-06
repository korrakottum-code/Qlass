import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const script = readFileSync(new URL("../scripts/goal13_apply_production_function.py", import.meta.url), "utf8");

test("Goal 13 operator procedure can apply only the reviewed function and stops on unsafe state", () => {
  assert.match(script, /Refusing to run without --production/);
  assert.match(script, /APPLY_GOAL13/);
  assert.match(script, /GOAL13_VERSION = "20260724192700"/);
  assert.match(script, /GOAL11D_VERSION = "20260724192800"/);
  assert.match(script, /MIGRATION_SHA256 = "1ea5bce7dfa228e1d65e0e11b885f6cdb817a6b022fdc545b09fc34f209ec91d"/);
  assert.match(script, /local Goal 13 migration differs from the reviewed checksum/);
  assert.match(script, /Goal 13 is already recorded; do not rerun or repair history/);
  assert.match(script, /Goal 11D is already recorded while Goal 13 is absent/);
  assert.match(script, /create_queue_v1 already exists without Goal 13 history/);
  assert.match(script, /has_function_privilege\(rolname/);
  assert.match(script, /supabase migration repair --linked --status applied 20260724192700/);
  assert.doesNotMatch(script, /supabase db push/);
});
