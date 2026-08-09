import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createSessionApi } from "../src/utils/sessionApi.js";

const worker = readFileSync(new URL("../supabase/functions/staff-session/index.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");

test("Goal 18 staff write actions exist and are gated to staff-management roles", () => {
  for (const action of ["staff_create", "staff_update", "staff_delete"]) {
    assert.ok(worker.includes(`body?.action === "${action}"`), `missing ${action} action`);
  }
  // Every staff write path checks the management-role gate (2 handlers) in
  // addition to the staff-details read gate.
  assert.ok((worker.match(/staffManagementRoles\.has\(String\(current\.user\.role/g) ?? []).length >= 3);
  // Server-side payload validation: name, known role, 4-digit PIN, sane rates.
  assert.match(worker, /function staffWriteRow/);
  assert.match(worker, /\/\^\\d\{4\}\$\/\.test\(pin\)/);
  assert.match(worker, /cannot_delete_self/);
});

test("Goal 18 App routes staff writes through the server boundary when server sessions are on", () => {
  assert.match(app, /useServerSession \? createStaffServer\(getServerSessionToken\(\), data\) : createStaff\(data\)/);
  assert.match(app, /useServerSession \? updateStaffServer\(getServerSessionToken\(\), id, data\) : updateStaff\(id, data\)/);
  assert.match(app, /useServerSession \? deleteStaffServer\(getServerSessionToken\(\), id\) : deleteStaffDB\(id\)/);
  // No staff write bypasses the persist helpers.
  assert.equal((app.match(/await updateStaff\(/g) ?? []).length, 0);
  assert.equal((app.match(/await createStaff\(/g) ?? []).length, 0);
  assert.equal((app.match(/await deleteStaffDB\(/g) ?? []).length, 0);
});

test("Goal 18 session API sends staff writes with the session token and unwraps results", async () => {
  const calls = [];
  const api = createSessionApi(async (name, options) => {
    calls.push({ name, body: options.body });
    if (options.body.action === "staff_delete") return { data: { ok: true }, error: null };
    return { data: { staff: { id: "s1", name: "A" } }, error: null };
  });

  const created = await api.createStaffServer("tok", { name: "A" });
  assert.deepEqual(created, { id: "s1", name: "A" });
  const updated = await api.updateStaffServer("tok", "s1", { name: "A" });
  assert.deepEqual(updated, { id: "s1", name: "A" });
  await api.deleteStaffServer("tok", "s1");

  assert.deepEqual(calls.map((c) => c.body.action), ["staff_create", "staff_update", "staff_delete"]);
  assert.ok(calls.every((c) => c.name === "staff-session" && c.body.token === "tok"));
  assert.equal(calls[1].body.staffId, "s1");

  const failing = createSessionApi(async () => ({ data: { error: "forbidden" }, error: null }));
  await assert.rejects(() => failing.createStaffServer("tok", {}), /forbidden/);
});
