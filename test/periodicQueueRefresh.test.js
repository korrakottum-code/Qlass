import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createPeriodicRefreshController } from "../src/utils/realtimeCatchUp.js";

// ตาข่ายชั้นสอง: ดึงของที่เปลี่ยนเป็นระยะ (25 ก.ย. 2569) — Realtime บางครั้งส่งช้า 52–125 วินาทีทั้งที่ต่อปกติ
// ความเสียหายที่เทสต์นี้กัน: ยิงฐานข้อมูลถี่/พร้อมกันทุกเครื่อง, ยิงตอนแท็บซ่อน, วนไม่จบเมื่อล้มเหลว,
// ดึงย้อนไกลทุกรอบ (ข้อมูลบวม), ข้ามแถวที่เปลี่ยนเพราะจุดเริ่มเดินหน้าผิด

const T0 = Date.parse("2026-09-25T10:00:00Z");

function harness({ run, opts = {}, visible = true } = {}) {
  let t = T0;
  let vis = visible;
  const timers = new Map();
  let nextId = 1;
  const calls = [];
  const c = createPeriodicRefreshController({
    run: run ?? (async (args) => { calls.push(args); return { maxUpdatedAt: null }; }),
    isVisible: () => vis,
    now: () => t,
    setTimer: (fn, ms) => { const id = nextId++; timers.set(id, { fn, at: t + ms }); return id; },
    clearTimer: (id) => timers.delete(id),
    random: () => 0,
    intervalMs: 30_000, jitterMs: 5_000, overlapMs: 60_000,
    ...opts,
  });
  return {
    c, calls, timers,
    setVisible(v) { vis = v; },
    advance(ms) { t += ms; for (const [id, tm] of [...timers]) if (tm.at <= t) { timers.delete(id); tm.fn(); } },
    now: () => t,
  };
}
const flush = () => new Promise((r) => setImmediate(r));

test("ยังโหลดข้อมูลหลักไม่เสร็จ → ไม่ตั้งเวลา ไม่ยิง", async () => {
  const h = harness();
  h.advance(300_000); await flush();
  assert.equal(h.calls.length, 0);
  assert.equal(h.timers.size, 0);
});

test("พร้อมแล้วยิงทุก ~30 วินาที ไม่ใช่ทันที (ข้อมูลเพิ่งโหลดสดอยู่)", async () => {
  const h = harness();
  h.c.setReady(true);
  h.advance(29_000); await flush();
  assert.equal(h.calls.length, 0);
  h.advance(2_000); await flush();
  assert.equal(h.calls.length, 1);
  h.advance(30_000); await flush();
  assert.equal(h.calls.length, 2);
});

test("รอบแรกเริ่มย้อนจากตอนโหลดเสร็จ 10 นาที (เผื่อนาฬิกาเครื่องเพี้ยน) ทั้งคิวที่เปลี่ยนและประวัติการลบ", async () => {
  const h = harness({ opts: { overlapMs: 0 } });
  h.c.setReady(true);
  h.advance(31_000); await flush();
  assert.equal(h.calls[0].sinceIso, new Date(T0 - 10 * 60_000).toISOString());
  assert.equal(h.calls[0].deletedSinceIso, new Date(T0 - 10 * 60_000).toISOString());
});

test("จุดเริ่มรอบถัดไป = updated_at สูงสุดที่เห็น ถอยเผื่อ 60 วินาที (ไม่ดึง 10 นาทีย้อนหลังซ้ำทุกรอบ)", async () => {
  const seen = [];
  const h = harness({ run: async (a) => { seen.push(a); return { maxUpdatedAt: "2026-09-25T10:00:20.000Z" }; } });
  h.c.setReady(true);
  h.advance(31_000); await flush();
  h.advance(31_000); await flush();
  assert.equal(seen.length, 2);
  assert.equal(seen[1].sinceIso, "2026-09-25T09:59:20.000Z");
});

test("ประวัติการลบใช้นาฬิกาเครื่อง (ไม่มี updated_at): เริ่มจากรอบล่าสุดที่สำเร็จ ย้อน 10 นาที", async () => {
  const seen = [];
  const h = harness({ run: async (a) => { seen.push(a); return { maxUpdatedAt: null }; } });
  h.c.setReady(true);
  h.advance(31_000); await flush(); // สำเร็จที่ T0+31s
  h.advance(31_000); await flush();
  assert.equal(seen[1].deletedSinceIso, new Date(T0 + 31_000 - 10 * 60_000).toISOString());
});

test("รอบที่ไม่เจอแถวใหม่ (maxUpdatedAt เป็น null) ห้ามขยับจุดเริ่มถอยหลังหรือเดินหน้าเกินของเดิม", async () => {
  const seen = [];
  let n = 0;
  const h = harness({ run: async (a) => { seen.push(a); n += 1; return { maxUpdatedAt: n === 1 ? "2026-09-25T10:00:10.000Z" : null }; } });
  h.c.setReady(true);
  h.advance(31_000); await flush();
  h.advance(31_000); await flush();
  h.advance(31_000); await flush();
  assert.equal(seen[1].sinceIso, seen[2].sinceIso);
});

test("ค่า updated_at ที่เก่ากว่าจุดเริ่มปัจจุบันไม่ทำให้จุดเริ่มถอยหลัง", async () => {
  const seen = [];
  const vals = ["2026-09-25T10:00:30.000Z", "2026-09-25T09:00:00.000Z", null];
  let i = 0;
  const h = harness({ run: async (a) => { seen.push(a); return { maxUpdatedAt: vals[i++] }; } });
  h.c.setReady(true);
  for (let k = 0; k < 3; k += 1) { h.advance(31_000); await flush(); }
  assert.equal(seen[1].sinceIso, seen[2].sinceIso);
});

test("จุดเริ่มไม่ย้อนเกิน 24 ชั่วโมง (แท็บซ่อนนานแล้วกลับมา)", async () => {
  const h = harness({ opts: { overlapMs: 60_000 } });
  h.c.setReady(true);
  h.setVisible(false);
  h.advance(31_000); await flush(); // ไม่ยิง
  h.advance(3 * 24 * 3600_000);
  h.setVisible(true);
  h.c.onVisibilityChange();
  h.advance(6_000); await flush();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].sinceIso, new Date(h.now() - 24 * 3600_000).toISOString());
});

test("แท็บซ่อน → ไม่ยิง / กลับมาดูแล้วยิงต่อโดยไม่ต้องรอครบรอบใหม่", async () => {
  const h = harness();
  h.c.setReady(true);
  h.setVisible(false);
  h.advance(31_000); await flush();
  h.advance(300_000); await flush();
  assert.equal(h.calls.length, 0);
  assert.equal(h.timers.size, 0, "แท็บซ่อนต้องไม่ค้าง timer");
  h.setVisible(true);
  h.c.onVisibilityChange();
  h.advance(1); await flush();
  assert.equal(h.calls.length, 1);
});

test("ซ่อนแท็บระหว่างรอ timer → ตอนถึงเวลาไม่ยิง", async () => {
  const h = harness();
  h.c.setReady(true);
  h.advance(10_000);
  h.setVisible(false);
  h.advance(25_000); await flush();
  assert.equal(h.calls.length, 0);
});

test("ล้มเหลว = ถอยเวลาแบบทวีคูณ (30→60→120→240) หยุดที่เพดาน 5 นาที และเงียบ (ไม่โยน error ออกมา)", async () => {
  const times = [];
  const h = harness({ run: async () => { times.push(h.now()); throw new Error("boom"); }, opts: { jitterMs: 0 } });
  h.c.setReady(true);
  for (let sec = 0; sec < 3_000; sec += 1) { h.advance(1_000); await flush(); }
  const gaps = times.slice(1).map((t, i) => (t - times[i]) / 1000);
  assert.deepEqual(gaps.slice(0, 4), [60, 120, 240, 300]);
  assert.ok(gaps.every((g) => g <= 300), "ห้ามถี่กว่า/ห่างกว่าเพดาน 5 นาที");
  assert.ok(gaps.slice(3).every((g) => g === 300));
});

test("หลังล้มเหลวแล้วสำเร็จ → กลับสู่จังหวะ 30 วินาที และไม่ข้ามช่วง (จุดเริ่มไม่ขยับตอนล้มเหลว)", async () => {
  const seen = [];
  let fail = true;
  const h = harness({ run: async (a) => { seen.push(a); if (fail) throw new Error("x"); return { maxUpdatedAt: null }; } });
  h.c.setReady(true);
  h.advance(31_000); await flush();
  fail = false;
  h.advance(61_000); await flush();
  assert.equal(seen.length, 2);
  assert.equal(seen[0].sinceIso, seen[1].sinceIso, "ล้มเหลวแล้วต้องขอช่วงเดิมซ้ำ");
  assert.equal(h.c._state().failures, 0);
  h.advance(31_000); await flush();
  assert.equal(seen.length, 3);
});

test("รอบอื่นทำงานอยู่ (run คืน null) ไม่นับเป็นล้มเหลวและไม่ขยับจุดเริ่ม", async () => {
  const seen = [];
  const h = harness({ run: async (a) => { seen.push(a); return null; } });
  h.c.setReady(true);
  h.advance(31_000); await flush();
  h.advance(31_000); await flush();
  assert.equal(seen.length, 2);
  assert.equal(h.c._state().failures, 0);
  assert.equal(seen[0].sinceIso, seen[1].sinceIso);
});

test("ไม่ยิงซ้อนกัน: รอบก่อนยังไม่จบ ไม่เริ่มรอบใหม่", async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  let active = 0, maxActive = 0;
  const h = harness({ run: async () => { active += 1; maxActive = Math.max(maxActive, active); await gate; active -= 1; return { maxUpdatedAt: null }; } });
  h.c.setReady(true);
  h.advance(31_000); await flush();
  h.c.onVisibilityChange();
  h.advance(120_000); await flush();
  assert.equal(maxActive, 1);
  release(); await flush();
});

test("jitter อยู่ในช่วง 0–5 วินาที กระจายเวลาแต่ละเครื่อง", () => {
  const delays = [];
  for (const r of [0, 0.5, 0.999]) {
    const h = harness({ opts: { random: () => r, setTimer: (fn, ms) => { delays.push(ms); return 1; } } });
    h.c.setReady(true);
  }
  assert.ok(delays.every((d) => d >= 30_000 && d < 35_000), JSON.stringify(delays));
  assert.ok(new Set(delays).size > 1);
});

test("dispose / setReady(false) ล้าง timer และไม่ยิงอีก", async () => {
  const a = harness();
  a.c.setReady(true);
  a.c.dispose();
  a.advance(120_000); await flush();
  assert.equal(a.calls.length, 0);
  assert.equal(a.timers.size, 0);
  const b = harness();
  b.c.setReady(true);
  b.c.setReady(false);
  b.advance(120_000); await flush();
  assert.equal(b.calls.length, 0);
  assert.equal(b.timers.size, 0);
});

// ─── สายเชื่อมใน App.jsx / supabaseService.js ───
const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const svc = readFileSync(new URL("../src/utils/supabaseService.js", import.meta.url), "utf8");

test("App.jsx: มีสวิตช์ปิดฉุกเฉิน VITE_QUEUE_REFRESH_SECONDS (0 = ปิด) ขั้นต่ำ 15 วินาที ค่าเริ่มต้น 30", () => {
  assert.match(app, /import\.meta\.env\.VITE_QUEUE_REFRESH_SECONDS/);
  assert.match(app, /raw === undefined \|\| raw === "" \? 30 : Number\(raw\)/);
  assert.match(app, /if \(!Number\.isFinite\(seconds\) \|\| seconds <= 0\) return undefined;/);
  assert.match(app, /intervalMs: Math\.max\(15, seconds\) \* 1000/);
});

test("App.jsx: รอบเป็นระยะข้ามเมื่อมีรอบอื่นค้าง เงียบเมื่อไม่มีอะไรเปลี่ยน และยังโหลดไม่เสร็จก็ไม่ยิง", () => {
  const block = app.slice(app.indexOf("createPeriodicRefreshController({"), app.indexOf("useEffect(() => { isDataReadyRef.current"));
  assert.match(block, /skipIfBusy: true, quiet: true/);
  assert.match(block, /document\.addEventListener\("visibilitychange", onVisibilityChange\);/);
  assert.match(block, /periodic\.dispose\(\);\s*document\.removeEventListener\("visibilitychange", onVisibilityChange\);/);
  assert.match(app, /periodicRefreshRef\.current\?\.setReady\(isDataReady\)/);
});

test("App.jsx: รอบเป็นระยะไม่แจ้งผู้ใช้เมื่อล้มเหลว (ใช้ runQueueCatchUp ที่เงียบอยู่แล้ว)", () => {
  const block = app.slice(app.indexOf("createPeriodicRefreshController({"), app.indexOf("useEffect(() => { isDataReadyRef.current"));
  assert.ok(!/showToast|setRangeLoadStatus|setSupabaseError|alert\(/.test(block));
});

test("runQueueCatchUp: คืน updated_at สูงสุดให้ตัวเป็นระยะ และไม่เกาะผลของรอบอื่นเมื่อ skipIfBusy", () => {
  const block = app.slice(app.indexOf("const runQueueCatchUp"), app.indexOf("useEffect(() => { catchUpControllerRef"));
  assert.match(block, /return opts\.skipIfBusy \? null : rangeInFlightRef\.current\.get\(key\)/);
  assert.match(block, /return \{ maxUpdatedAt: changed\.maxUpdatedAt \}/);
  assert.match(block, /fetchDeletedQueueIdsSince\(opts\.deletedSinceIso \?\? sinceIso\)/);
});

test("fetchQueuesChangedSince: คืน maxUpdatedAt จากค่าเซิร์ฟเวอร์ของแถวที่ดึงมา", () => {
  const fn = svc.slice(svc.indexOf("export async function fetchQueuesChangedSince"), svc.indexOf("export async function fetchDeletedQueueIdsSince"));
  assert.match(fn, /row\.updated_at > maxUpdatedAt/);
  assert.match(fn, /truncated, maxUpdatedAt/);
});
