import test from "node:test";
import assert from "node:assert/strict";
import { buildUuidRanges, walkRange, fetchAllByUuidRanges } from "../src/utils/queueHistoryPagination.js";

// สร้าง "ตาราง" จำลอง: ids เรียงลำดับ string ตาม uuid ต่างหลักแรก
function makeIds(n) {
  const ids = [];
  // เริ่มที่ i+1 ให้ไม่มี id ใดเท่ากับ uuid ศูนย์ล้วน (ขอบล่าง exclusive) — เหมือน gen_random_uuid() จริง
  for (let i = 0; i < n; i++) ids.push(`${((i + 1) % 16).toString(16)}${String(i + 1).padStart(7, "0")}-0000-0000-0000-000000000000`);
  return ids.sort();
}
function makeFetchPage(ids, pageSize, failOnRangeUpper = null) {
  return async (afterId, upperInclusive) => {
    if (failOnRangeUpper && upperInclusive === failOnRangeUpper) throw new Error("boom");
    return ids.filter((id) => id > afterId && id <= upperInclusive).slice(0, pageSize).map((id) => ({ id }));
  };
}

test("uuid ranges are contiguous, cover the whole space, and are valid uuids", () => {
  const r = buildUuidRanges(4);
  assert.equal(r.length, 4);
  assert.equal(r[0].lowerExclusive, "00000000-0000-0000-0000-000000000000");
  assert.equal(r[3].upperInclusive, "ffffffff-ffff-ffff-ffff-ffffffffffff");
  for (let i = 1; i < r.length; i++) assert.equal(r[i].lowerExclusive, r[i - 1].upperInclusive);
  for (const x of r) for (const v of [x.lowerExclusive, x.upperInclusive]) assert.match(v, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.throws(() => buildUuidRanges(0));
  assert.throws(() => buildUuidRanges(17));
});

test("walkRange pages until short page and advances the cursor each step", async () => {
  const ids = makeIds(2500);
  const calls = [];
  const fetchPage = async (after, upper) => { calls.push(after); return makeFetchPage(ids, 1000)(after, upper); };
  const rows = await walkRange(fetchPage, buildUuidRanges(1)[0], 1000);
  assert.equal(rows.length, 2500);
  assert.equal(calls.length, 3); // 1000, 1000, 500
  assert.deepEqual(rows.map((r) => r.id), ids);
});

test("walkRange refuses to spin if the cursor does not advance", async () => {
  const stuck = async () => Array.from({ length: 1000 }, () => ({ id: "same" }));
  await assert.rejects(() => walkRange(stuck, buildUuidRanges(1)[0], 1000), /cursor did not advance/);
});

test("fetchAllByUuidRanges returns every row exactly once across parallel ranges", async () => {
  const ids = makeIds(9876);
  const { rows, complete, errors } = await fetchAllByUuidRanges(makeFetchPage(ids, 1000), { pageSize: 1000 });
  assert.equal(complete, true);
  assert.equal(errors.length, 0);
  assert.equal(rows.length, ids.length);
  assert.equal(new Set(rows.map((r) => r.id)).size, ids.length, "no duplicates");
  assert.deepEqual([...rows.map((r) => r.id)].sort(), ids, "no missing rows");
});

test("a failing range yields complete=false but keeps rows from healthy ranges", async () => {
  const ids = makeIds(4000);
  const ranges = buildUuidRanges(4);
  const { rows, complete, errors } = await fetchAllByUuidRanges(
    makeFetchPage(ids, 1000, ranges[1].upperInclusive), { ranges, pageSize: 1000 }
  );
  assert.equal(complete, false);
  assert.equal(errors.length, 1);
  assert.ok(rows.length > 0 && rows.length < ids.length);
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length);
});
