import assert from "node:assert/strict";
import test from "node:test";
import { createSubmissionGuard } from "../src/hooks/useSubmissionLock.js";

test("submission guard starts only one write for simultaneous clicks", async () => {
  const guard = createSubmissionGuard();
  let calls = 0;
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const write = async () => {
    calls += 1;
    await pending;
    return "saved";
  };

  const first = guard.run(write);
  const second = await guard.run(write);
  assert.deepEqual(second, { started: false });
  assert.equal(calls, 1);

  release();
  assert.deepEqual(await first, { started: true, result: "saved" });
});

test("submission guard unlocks after a failed write so the preserved draft can retry", async () => {
  const guard = createSubmissionGuard();
  let attempts = 0;

  await assert.rejects(
    guard.run(async () => {
      attempts += 1;
      throw new Error("temporary failure");
    }),
    /temporary failure/,
  );

  const retry = await guard.run(async () => {
    attempts += 1;
    return "saved after retry";
  });
  assert.equal(attempts, 2);
  assert.deepEqual(retry, { started: true, result: "saved after retry" });
});
