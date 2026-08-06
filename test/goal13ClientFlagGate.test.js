import test from "node:test";
import assert from "node:assert/strict";
import {
  parseStaffAllowlist,
  shouldUseServerQueueCreate,
  buildServerQueuePayload,
  queueCreateErrorMessage,
  extractQueueCreateErrorCode,
  QUEUE_CREATE_ERROR_MESSAGES,
} from "../src/utils/queueCreateGate.js";

const OPERATOR = "11111111-2222-4333-8444-555555555555";

test("allowlist parsing trims, lowercases, and drops empty entries", () => {
  assert.deepEqual(parseStaffAllowlist(` ${OPERATOR.toUpperCase()} , , abc `), [OPERATOR, "abc"]);
  assert.deepEqual(parseStaffAllowlist(undefined), []);
  assert.deepEqual(parseStaffAllowlist(""), []);
});

test("gate requires flag, allowlisted operator, and a pending booking", () => {
  const allowlist = [OPERATOR];
  const form = { status: "pending" };
  const user = { id: OPERATOR };

  assert.equal(shouldUseServerQueueCreate({ enabled: true, allowlist, user, form }), true);
  // Flag off wins even for an allowlisted operator.
  assert.equal(shouldUseServerQueueCreate({ enabled: false, allowlist, user, form }), false);
  // An empty allowlist enables nobody.
  assert.equal(shouldUseServerQueueCreate({ enabled: true, allowlist: [], user, form }), false);
  // Non-allowlisted or missing user stays on the legacy writer.
  assert.equal(shouldUseServerQueueCreate({ enabled: true, allowlist, user: { id: "other" }, form }), false);
  assert.equal(shouldUseServerQueueCreate({ enabled: true, allowlist, user: null, form }), false);
  // Operator ID comparison is case-insensitive.
  assert.equal(shouldUseServerQueueCreate({ enabled: true, allowlist, user: { id: OPERATOR.toUpperCase() }, form }), true);
  // create_queue_v1 only accepts a new pending booking; anything else is
  // out of canary scope before any server call happens.
  assert.equal(shouldUseServerQueueCreate({ enabled: true, allowlist, user, form: { status: "confirmed" } }), false);
  assert.equal(shouldUseServerQueueCreate({ enabled: true, allowlist, user, form: {} }), true);
});

test("payload maps the booking form to the create_queue_v1 contract", () => {
  const payload = buildServerQueuePayload({
    name: "ลูกค้า",
    phone: "0812345678",
    branchId: "b1",
    roomId: "",
    procedureId: "p1",
    promoId: "",
    price: 1500,
    note: "",
    customerType: "old",
    status: "pending",
    date: "2026-08-07",
    timeBlock: 120,
    durationBlocks: null,
  });
  assert.deepEqual(payload, {
    name: "ลูกค้า",
    phone: "0812345678",
    branch_id: "b1",
    room_id: null,
    procedure_id: "p1",
    promo_id: null,
    price: "1500",
    note: "",
    customer_type: "old",
    status: "pending",
    date: "2026-08-07",
    time_block: 120,
    duration_blocks: null,
  });
  // Empty-string price must reach the server as null, not "" (Goal 12 metadata
  // and the PR #119 regression both depend on optional fields staying null).
  assert.equal(buildServerQueuePayload({ price: "" }).price, null);
  assert.equal(buildServerQueuePayload({}).customer_type, "new");
  assert.equal(buildServerQueuePayload({ status: "confirmed" }).status, "pending");
});

test("server rejection codes map to actionable Thai messages", () => {
  for (const code of Object.keys(QUEUE_CREATE_ERROR_MESSAGES)) {
    assert.notEqual(queueCreateErrorMessage(code), queueCreateErrorMessage("unknown_code"));
  }
  assert.match(queueCreateErrorMessage("room_conflict"), /ชน/);
  assert.match(queueCreateErrorMessage("unknown_code"), /ลองอีกครั้ง/);
});

test("error extraction handles both session-api and FunctionsHttpError shapes", async () => {
  assert.equal(await extractQueueCreateErrorCode(new Error("room_conflict")), "room_conflict");
  assert.equal(await extractQueueCreateErrorCode(new Error("network down")), null);
  assert.equal(await extractQueueCreateErrorCode(null), null);

  const httpError = new Error("Edge Function returned a non-2xx status code");
  httpError.context = { json: async () => ({ error: "room_closed" }) };
  assert.equal(await extractQueueCreateErrorCode(httpError), "room_closed");

  const cloneable = new Error("non-2xx");
  cloneable.context = {
    clone: () => ({ json: async () => ({ error: "invalid_session" }) }),
    json: async () => { throw new Error("body already consumed"); },
  };
  assert.equal(await extractQueueCreateErrorCode(cloneable), "invalid_session");

  const unreadable = new Error("non-2xx");
  unreadable.context = { json: async () => { throw new Error("bad body"); } };
  assert.equal(await extractQueueCreateErrorCode(unreadable), null);

  // Unknown codes in a readable body are still treated as transport-level.
  const unknownCode = new Error("non-2xx");
  unknownCode.context = { json: async () => ({ error: "something_else" }) };
  assert.equal(await extractQueueCreateErrorCode(unknownCode), null);
});
