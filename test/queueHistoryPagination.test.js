import test from "node:test";
import assert from "node:assert/strict";
import { buildUuidRanges, walkRange, fetchAllByUuidRanges, allowedShortfall } from "../src/utils/queueHistoryPagination.js";

// สร้าง "ตาราง" จำลอง: ids เรียงลำดับ string ตาม uuid ต่างหลักแรก
// เริ่มที่ i+1 ให้ไม่มี id ใดเท่ากับ uuid ศูนย์ล้วน (ขอบล่าง exclusive) — เหมือน gen_random_uuid() จริง
function makeIds(n) {
  const ids = [];
  for (let i = 0; i < n; i++) ids.push(`${((i + 1) % 16).toString(16)}${String(i + 1).padStart(7, "0")}-0000-0000-0000-000000000000`);
  return ids.sort();
}
function makeFetchPage(ids, pageSize, { failOnRangeUpper = null, failAfterCalls = null, serverCap = null } = {}) {
  let calls = 0;
  return async (afterId, upperInclusive) => {
    calls++;
    if (failOnRangeUpper && upperInclusive === failOnRangeUpper) throw new Error("boom");
    if (failAfterCalls && calls > failAfterCalls) throw new Error("boom-late");
    const cap = serverCap ? Math.min(pageSize, serverCap) : pageSize;
    return ids.filter((id) => id > afterId && id <= upperInclusive).slice(0, cap).map((id) => ({ id }));
  };
}

test("uuid ranges: contiguous, full coverage, equal width, valid uuids; only divisors of 16", () => {
  for (const n of [1, 2, 4, 8, 16]) {
    const r = buildUuidRanges(n);
    assert.equal(r.length, n);
    assert.equal(r[0].lowerExclusive, "00000000-0000-0000-0000-000000000000");
    assert.equal(r[n - 1].upperInclusive, "ffffffff-ffff-ffff-ffff-ffffffffffff");
    for (let i = 1; i < r.length; i++) assert.equal(r[i].lowerExclusive, r[i - 1].upperInclusive);
    for (const x of r) for (const v of [x.lowerExclusive, x.upperInclusive]) assert.match(v, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    // ทุกช่วงกว้างเท่ากัน: หลักแรกของ upper แต่ละช่วงห่างกัน 16/n พอดี และไม่มีช่วงว่าง
    const firstHex = r.map((x) => parseInt(x.upperInclusive[0], 16));
    for (let i = 1; i < n; i++) assert.equal(firstHex[i] - firstHex[i - 1], 16 / n);
  }
  for (const bad of [0, 3, 5, 6, 7, 11, 17]) assert.throws(() => buildUuidRanges(bad));
});

test("walkRange pages until short page, advances cursor, and returns error=null on success", async () => {
  const ids = makeIds(2500);
  const calls = [];
  const inner = makeFetchPage(ids, 1000);
  const fetchPage = async (after, upper) => { calls.push(after); return inner(after, upper); };
  const { rows, error } = await walkRange(fetchPage, buildUuidRanges(1)[0], 1000);
  assert.equal(error, null);
  assert.equal(rows.length, 2500);
  assert.equal(calls.length, 3); // 1000, 1000, 500
  assert.deepEqual(rows.map((r) => r.id), ids);
});

test("walkRange keeps rows fetched before a failing page and reports the error (no throw)", async () => {
  const ids = makeIds(3500);
  const { rows, error } = await walkRange(makeFetchPage(ids, 1000, { failAfterCalls: 2 }), buildUuidRanges(1)[0], 1000);
  assert.ok(error instanceof Error);
  assert.equal(rows.length, 2000, "first two pages retained");
});

test("walkRange refuses to spin if the cursor does not advance", async () => {
  const stuck = async () => Array.from({ length: 1000 }, () => ({ id: "same" }));
  const { rows, error } = await walkRange(stuck, buildUuidRanges(1)[0], 1000);
  assert.match(String(error), /cursor did not advance/);
  // หน้าแรก: cursor=000…0 ≠ "same" → เดินต่อ; หน้าสอง: cursor="same" === last.id → จับได้ (2 หน้าพอดี ไม่วนต่อ)
  assert.equal(rows.length, 2000);
});

test("fetchAllByUuidRanges returns every row exactly once across parallel ranges", async () => {
  const ids = makeIds(9876);
  const { rows, complete, errors } = await fetchAllByUuidRanges(makeFetchPage(ids, 1000), { pageSize: 1000, expectedCount: ids.length });
  assert.equal(complete, true);
  assert.equal(errors.length, 0);
  assert.equal(rows.length, ids.length);
  assert.equal(new Set(rows.map((r) => r.id)).size, ids.length, "no duplicates");
  assert.deepEqual([...rows.map((r) => r.id)].sort(), ids, "no missing rows");
});

test("a failing range yields complete=false but keeps rows from that range's earlier pages and all healthy ranges", async () => {
  const ids = makeIds(4000);
  const ranges = buildUuidRanges(4);
  const { rows, complete, errors } = await fetchAllByUuidRanges(
    makeFetchPage(ids, 1000, { failOnRangeUpper: ranges[1].upperInclusive }), { ranges, pageSize: 1000 }
  );
  assert.equal(complete, false);
  assert.equal(errors.length, 1);
  assert.ok(rows.length > 0 && rows.length < ids.length);
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length);
});

test("server page cap below pageSize is detected via expectedCount (never reports complete on truncated data)", async () => {
  const ids = makeIds(9000);
  // server ตัดทุกหน้าเหลือ 500 → walkRange จะคิดว่าหมดช่วงหลังหน้าแรก
  const { rows, complete, errors } = await fetchAllByUuidRanges(
    makeFetchPage(ids, 1000, { serverCap: 500 }), { pageSize: 1000, expectedCount: ids.length }
  );
  assert.equal(complete, false, "must NOT claim complete");
  assert.ok(rows.length < ids.length);
  assert.match(String(errors[0]), /expected ~9000 rows/);
});

test("a few rows more or fewer than count(*) (concurrent writes during load) still counts as complete", async () => {
  const ids = makeIds(9000);
  // count(*) วัดก่อนโหลดได้ 9002 แต่มีคนลบไป 2 แถวระหว่างโหลด → 9000 ≠ 9002 แต่ต่างแค่ 0.02% → ครบ
  const a = await fetchAllByUuidRanges(makeFetchPage(ids, 1000), { pageSize: 1000, expectedCount: 9002 });
  assert.equal(a.complete, true);
  // count(*) ได้ 8990 แต่มีคนเพิ่ม 10 แถวระหว่างโหลด → ได้มากกว่า count → ครบ
  const b = await fetchAllByUuidRanges(makeFetchPage(ids, 1000), { pageSize: 1000, expectedCount: 8990 });
  assert.equal(b.complete, true);
});

test("allowedShortfall: absolute floor for small tables, ratio in the middle, absolute cap for large tables", () => {
  assert.equal(allowedShortfall(10), 5, "floor: small table tolerates a few concurrent deletes");
  assert.equal(allowedShortfall(1000), 20, "ratio: 2% of 1000");
  assert.equal(allowedShortfall(146000), 100, "cap: never silently accept hundreds missing");
  // ตารางเล็ก 10 แถว ลบไป 1 ระหว่างโหลด → ครบ; แต่ตารางใหญ่หาย 600 → ไม่ครบ
  assert.ok(10 - 9 <= allowedShortfall(10));
  assert.ok(146000 - 145850 > allowedShortfall(146000));
});

test("walkRange passes its pageSize to fetchPage so limit and termination stay coupled", async () => {
  const seen = [];
  const ids = makeIds(1500);
  const fetchPage = async (after, upper, pageSize) => { seen.push(pageSize); return makeFetchPage(ids, pageSize)(after, upper); };
  await walkRange(fetchPage, buildUuidRanges(1)[0], 700);
  assert.ok(seen.length >= 2 && seen.every((p) => p === 700));
});
