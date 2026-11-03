import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildDateSegments, walkDateSegment, fetchAllByDateSegments, DATE_SEGMENT_CONCURRENCY,
} from "../src/utils/queueHistoryPagination.js";

// ตารางจำลอง: หลายแถวต่อวัน (ทดสอบ cursor กลางวัน) + วันที่มั่วปี 0005 / 6371 แบบที่มีจริงใน production
function makeRows() {
  const rows = [];
  let n = 0;
  const add = (date, count) => {
    for (let i = 0; i < count; i++) {
      n++;
      rows.push({ id: `${(n % 16).toString(16)}${String(n).padStart(7, "0")}-0000-0000-0000-000000000000`, date });
    }
  };
  for (let d = 1; d <= 28; d++) add(`2026-10-${String(d).padStart(2, "0")}`, 37 + (d % 5) * 11);
  add("2026-11-03", 250); // วันเดียวยาวกว่าหลายหน้า
  add("2026-12-24", 3);
  add("0005-10-04", 2);
  add("6371-05-23", 1);
  return rows;
}

// จำลอง PostgREST: from <= date <= to และ (date < c.date หรือ (date = c.date และ id > c.id)) เรียง date desc, id asc
function makeFetchPage(rows, { serverCap = null, failOn = null, track = null } = {}) {
  return async ({ from, to, cursor, pageSize }) => {
    if (track) { track.inFlight++; track.max = Math.max(track.max, track.inFlight); track.calls++; }
    await new Promise((r) => setTimeout(r, 1));
    try {
      if (failOn && failOn.from === from) throw new Error("boom");
      const cap = serverCap ? Math.min(pageSize, serverCap) : pageSize;
      return rows
        .filter((r) => r.date >= from && r.date <= to)
        .filter((r) => !cursor || r.date < cursor.date || (r.date === cursor.date && r.id > cursor.id))
        .sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.id < b.id ? -1 : 1))
        .slice(0, cap);
    } finally {
      if (track) track.inFlight--;
    }
  };
}

function covers(segments, first, last) {
  // ต่อกันพอดี ไม่มีรู ไม่ทับ เรียงใหม่ → เก่า
  const asc = [...segments].reverse();
  assert.equal(asc[0].from, first);
  assert.equal(asc.at(-1).to, last);
  for (let i = 1; i < asc.length; i++) {
    const prevTo = new Date(`${asc[i - 1].to}T00:00:00Z`);
    prevTo.setUTCDate(prevTo.getUTCDate() + 1);
    assert.equal(asc[i].from, prevTo.toISOString().slice(0, 10), `gap/overlap at ${i}`);
    assert.ok(asc[i].from <= asc[i].to);
  }
}

test("แบ่งช่วงวัน: ต่อกันพอดี ช่วงละ 2 วัน ใหม่ก่อนเก่า", () => {
  const s = buildDateSegments("2026-08-06", "2026-11-04", { today: "2026-11-04" });
  covers(s, "2026-08-06", "2026-11-04");
  assert.equal(s[0].to, "2026-11-04");
  assert.equal(s.length, 46);
  assert.ok(s.every((x) => x.from >= "2026-08-06"));
});

test("แบ่งช่วงวัน: เปิดแอป (30 วัน + คิวล่วงหน้า) อนาคตไกลใช้ช่วงยาว ไม่ยิงเปล่าเป็นร้อยครั้ง", () => {
  const s = buildDateSegments("2026-10-05", "2027-03-01", { today: "2026-11-04" });
  covers(s, "2026-10-05", "2027-03-01");
  assert.ok(s.length <= 30, `segments=${s.length}`);
});

test("แบ่งช่วงวัน: วันที่มั่ว (ปี 0005 / 6371) เป็นช่วงเดียวต่อฝั่ง ไม่แตกเป็นพันช่วง", () => {
  const s = buildDateSegments("0005-10-04", "6371-05-23", { today: "2026-11-04" });
  covers(s, "0005-10-04", "6371-05-23");
  assert.ok(s.length < 260, `segments=${s.length}`);
  assert.equal(s[0].to, "6371-05-23");
  assert.equal(s.at(-1).from, "0005-10-04");
});

test("แบ่งช่วงวัน: วันเดียว / ช่วงว่าง / ทั้งช่วงอยู่นอกหน้าต่าง", () => {
  assert.deepEqual(buildDateSegments("2026-11-04", "2026-11-04", { today: "2026-11-04" }), [{ from: "2026-11-04", to: "2026-11-04" }]);
  assert.deepEqual(buildDateSegments("2026-11-05", "2026-11-04", { today: "2026-11-04" }), []);
  assert.deepEqual(buildDateSegments("1990-01-01", "1990-06-01", { today: "2026-11-04" }), [{ from: "1990-01-01", to: "1990-06-01" }]);
});

test("ได้ครบทุกแถว ไม่ซ้ำ แม้วันเดียวยาวหลายหน้า และมีวันที่มั่ว", async () => {
  const rows = makeRows();
  const segments = buildDateSegments("0005-10-04", "6371-05-23", { today: "2026-11-04" });
  const res = await fetchAllByDateSegments(makeFetchPage(rows), segments, { pageSize: 40, expectedCount: rows.length });
  assert.equal(res.complete, true);
  assert.equal(res.rows.length, rows.length);
  assert.deepEqual(new Set(res.rows.map((r) => r.id)), new Set(rows.map((r) => r.id)));
});

test("ยิงพร้อมกันไม่เกิน concurrency (ไม่กลับไปยิงทุกหน้าพร้อมกันแบบเดิม)", async () => {
  const rows = makeRows();
  const track = { inFlight: 0, max: 0, calls: 0 };
  const segments = buildDateSegments("2026-10-01", "2026-12-31", { today: "2026-11-04" });
  await fetchAllByDateSegments(makeFetchPage(rows, { track }), segments, { pageSize: 40 });
  assert.ok(track.max <= DATE_SEGMENT_CONCURRENCY, `max in flight ${track.max}`);
  assert.ok(track.calls > DATE_SEGMENT_CONCURRENCY);
});

test("หน้าที่ล้ม = ไม่ครบ (แจ้ง error ไม่เงียบ) และยังเก็บของช่วงอื่นไว้", async () => {
  const rows = makeRows();
  const segments = buildDateSegments("2026-10-01", "2026-11-30", { today: "2026-11-04" });
  const res = await fetchAllByDateSegments(makeFetchPage(rows, { failOn: segments[2] }), segments, { pageSize: 40 });
  assert.equal(res.complete, false);
  assert.equal(res.errors.length, 1);
  assert.ok(res.rows.length > 0);
});

test("server ตัดหน้าสั้นกว่า pageSize = จับได้จาก count (ไม่คิดว่าครบ)", async () => {
  const rows = makeRows();
  const segments = buildDateSegments("0005-10-04", "6371-05-23", { today: "2026-11-04" });
  const res = await fetchAllByDateSegments(makeFetchPage(rows, { serverCap: 10 }), segments, { pageSize: 40, expectedCount: rows.length });
  assert.equal(res.complete, false);
});

test("cursor ไม่ขยับ = หยุดพร้อม error ไม่วนไม่รู้จบ", async () => {
  const stuck = async () => Array.from({ length: 5 }, () => ({ id: "a", date: "2026-11-04" }));
  const res = await walkDateSegment(stuck, { from: "2026-11-01", to: "2026-11-04" }, 5);
  assert.ok(res.error);
});

test("fetchQueues: ช่วงใหญ่ใช้ keyset ตามวัน ไม่ยิงทุกหน้าพร้อมกัน; ช่วงเล็ก (เปิดแอป 30 วัน) ใช้ทางเดิม", () => {
  const src = fs.readFileSync(new URL("../src/utils/supabaseService.js", import.meta.url), "utf8");
  const body = src.slice(src.indexOf("export async function fetchQueues("), src.indexOf("export async function fetchQueuesChangedSince("));
  assert.ok(body.includes("fetchQueuesByDateKeyset(sinceDate, untilDate, count)"));
  assert.ok(src.includes("return fetchAllByDateSegments(fetchPage, buildDateSegments(first, last, { today }), { expectedCount });"));
  assert.match(body, /count > LARGE_RANGE_ROWS/);
  // ยิงทุกหน้าพร้อมกันได้เฉพาะช่วงเล็ก (จำนวนหน้าถูกจำกัดด้วย LARGE_RANGE_ROWS)
  const allAtOnce = body.match(/Promise\.all\(Array\.from\(\{ length: numPages \}/g) || [];
  assert.equal(allAtOnce.length, 1);
});
