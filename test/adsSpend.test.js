import test from "node:test";
import assert from "node:assert/strict";
import { computeAdsRange, sumDaily, sumMonth, toDailyMap, fetchAdsSpend, MAX_ADS_RANGE_DAYS } from "../src/utils/adsSpend.js";

test("computeAdsRange: ครอบทั้งช่วงที่เลือก เดือนของ selectedDate และกราฟ 14 วัน", () => {
  // ดูวันเดียว 5 ส.ค. ขณะที่วันนี้คือ 19 ส.ค. → ต้องครอบ 1 ส.ค. (ต้นเดือน) ถึง 31 ส.ค. (สิ้นเดือน)
  const r = computeAdsRange({
    dateRange: { start: "2026-08-05", end: "2026-08-05" },
    selectedDate: "2026-08-05",
    today: "2026-08-19",
  });
  assert.equal(r.since, "2026-08-01");
  assert.equal(r.until, "2026-08-31");
  assert.equal(r.truncated, false);
});

test("computeAdsRange: ดูเดือนเก่า ยังต้องครอบกราฟ 14 วันล่าสุดถึงวันนี้", () => {
  const r = computeAdsRange({
    dateRange: { start: "2026-05-01", end: "2026-05-31" },
    selectedDate: "2026-05-15",
    today: "2026-08-19",
  });
  assert.equal(r.since, "2026-05-01");
  assert.equal(r.until, "2026-08-19"); // สิ้นเดือนของ selectedDate (31 พ.ค.) เก่ากว่าวันนี้ → ขอบบน = วันนี้
});

test("computeAdsRange: ช่วงกว้างเกิน 1 ปี ถูกตัดและตั้งธง truncated", () => {
  const r = computeAdsRange({
    dateRange: { start: "2020-01-01", end: "2026-08-19" },
    selectedDate: "2026-08-19",
    today: "2026-08-19",
  });
  assert.equal(r.truncated, true);
  const span = (Date.parse(`${r.until}T00:00:00Z`) - Date.parse(`${r.since}T00:00:00Z`)) / 86400000;
  assert.ok(span <= MAX_ADS_RANGE_DAYS, `span ${span} ต้องไม่เกิน ${MAX_ADS_RANGE_DAYS}`);
});

test("computeAdsRange: today ไม่ถูกต้อง → null (ไม่ยิง API)", () => {
  assert.equal(computeAdsRange({ dateRange: null, selectedDate: "", today: "" }), null);
  assert.equal(computeAdsRange({ dateRange: null, selectedDate: "", today: "Invalid Da" }), null);
});

test("toDailyMap: ข้ามแถวรูปแบบผิด และรวมวันซ้ำ", () => {
  const map = toDailyMap([
    { day: "2026-08-01", spend: 100 },
    { day: "2026-08-01", spend: 50 },
    { day: "bad", spend: 999 },
    { day: "2026-08-02", spend: "x" },
    null,
  ]);
  assert.deepEqual(map, { "2026-08-01": 150 });
});

test("sumDaily / sumMonth: รวมตามช่วงแบบขอบรวม", () => {
  const byDay = { "2026-07-31": 10, "2026-08-01": 20, "2026-08-15": 30, "2026-09-01": 40 };
  assert.equal(sumDaily(byDay, "2026-08-01", "2026-08-15"), 50);
  assert.equal(sumDaily(byDay, "2026-08-02", "2026-08-14"), 0);
  assert.equal(sumMonth(byDay, "2026-08"), 50);
  assert.equal(sumMonth(byDay, ""), 0);
});

test("fetchAdsSpend: ไม่ throw — คืน ok:false พร้อม error เมื่อ Edge Function ล้ม", async () => {
  const boom = await fetchAdsSpend({
    since: "2026-08-01", until: "2026-08-19", token: "t",
    invoke: async () => { throw new Error("network down"); },
  });
  assert.equal(boom.ok, false);
  assert.equal(boom.error, "network down");

  const denied = await fetchAdsSpend({
    since: "2026-08-01", until: "2026-08-19", token: "t",
    invoke: async () => ({ data: { error: "forbidden" }, error: null }),
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.error, "forbidden");

  const bad = await fetchAdsSpend({ since: "", until: "", token: "t", invoke: async () => ({ data: {}, error: null }) });
  assert.equal(bad.ok, false);
  assert.equal(bad.error, "invalid_range");
});

test("fetchAdsSpend: ปลายทางไม่มี daily → hasDaily=false (การ์ดต้องซ่อนกราฟ ไม่ใช่วาดศูนย์)", async () => {
  const res = await fetchAdsSpend({
    since: "2026-08-01", until: "2026-08-19", token: "t",
    invoke: async () => ({ data: { spend: 774245, currency: "THB", asOf: "2026-08-19T01:22:47.589Z" }, error: null }),
  });
  assert.equal(res.ok, true);
  assert.equal(res.hasDaily, false);
  assert.equal(res.spend, 774245);
  assert.deepEqual(res.byDay, {});
});

test("fetchAdsSpend: ส่ง session token ผ่าน header และส่ง since/until ใน body", async () => {
  let seen = null;
  await fetchAdsSpend({
    since: "2026-08-01", until: "2026-08-19", token: "sess-123",
    invoke: async (name, options) => { seen = { name, options }; return { data: { spend: 0, daily: [] }, error: null }; },
  });
  assert.equal(seen.name, "ads-spend");
  assert.deepEqual(seen.options.body, { since: "2026-08-01", until: "2026-08-19" });
  assert.equal(seen.options.headers["X-Qlass-Session"], "sess-123");
});

test("fetchAdsSpend: ดึงโค้ดจริงจาก error.context เมื่อ Edge Function ตอบ non-2xx", async () => {
  // supabase-js ส่ง FunctionsHttpError ที่มี message กว้าง ๆ + context เป็น Response
  const res = await fetchAdsSpend({
    since: "2026-08-01", until: "2026-08-19", token: "t",
    invoke: async () => ({
      data: null,
      error: {
        message: "Edge Function returned a non-2xx status code",
        context: { json: async () => ({ error: "upstream_error", upstreamStatus: 401 }) },
      },
    }),
  });
  assert.equal(res.ok, false);
  assert.equal(res.error, "upstream_error");
});

test("fetchAdsSpend: อ่าน context ไม่ได้ ก็ยังคืน message เดิม ไม่ throw", async () => {
  const res = await fetchAdsSpend({
    since: "2026-08-01", until: "2026-08-19", token: "t",
    invoke: async () => ({ data: null, error: { message: "boom", context: { json: async () => { throw new Error("not json"); } } } }),
  });
  assert.equal(res.ok, false);
  assert.equal(res.error, "boom");
});
