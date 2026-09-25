import test from "node:test";
import assert from "node:assert/strict";
import {
  catchUpSince,
  applyQueueCatchUp,
  createRealtimeCatchUpController,
  CATCH_UP_MARGIN_MS,
  CATCH_UP_MAX_LOOKBACK_MS,
  CATCH_UP_MAX_REMOVALS,
} from "../src/utils/realtimeCatchUp.js";

// ตามข้อมูลให้ทัน "หลัง Realtime หลุดแล้วต่อกลับ" (25 ก.ย. 2569)
// ความเสียหายที่เทสต์นี้กัน: ทับข้อมูลสดของเครื่องด้วยผลที่ดึงก่อนหน้า, ลบคิวจริงทิ้งจากหน้าจอ, คิวที่ลบแล้วโผล่กลับมา,
// และวนยิงฐานข้อมูลไม่จบจากทุกเครื่อง

const q = (id, extra = {}) => ({ id, name: `n-${id}`, status: "pending", date: "2026-09-25", ...extra });

// ─── catchUpSince ────────────────────────────────────────────────────────
test("since = จุดที่หลุด ย้อนไป 10 นาที", () => {
  const now = Date.parse("2026-09-25T10:00:00Z");
  const since = catchUpSince(Date.parse("2026-09-25T09:50:00Z"), now);
  assert.equal(since, "2026-09-25T09:40:00.000Z");
  assert.equal(CATCH_UP_MARGIN_MS, 10 * 60 * 1000);
});

test("since ไม่ย้อนเกิน 24 ชั่วโมง (หลุดนานมาก = ไม่ดึงทั้งอดีต)", () => {
  const now = Date.parse("2026-09-25T10:00:00Z");
  const since = catchUpSince(Date.parse("2026-09-20T00:00:00Z"), now);
  assert.equal(since, "2026-09-24T10:00:00.000Z");
  assert.equal(CATCH_UP_MAX_LOOKBACK_MS, 24 * 60 * 60 * 1000);
});

// ─── applyQueueCatchUp ───────────────────────────────────────────────────
test("คิวใหม่ที่เครื่องนี้ไม่เคยเห็น (คนอื่นลงระหว่างหลุด) → เพิ่ม", () => {
  const a = q("a");
  const start = [a];
  const out = applyQueueCatchUp([a], [q("b")], { startQueues: start });
  assert.deepEqual(out.map((x) => x.id), ["a", "b"]);
  assert.equal(out[0], a, "แถวเดิมต้องเป็น reference เดิม");
});

test("สถานะเปลี่ยนระหว่างหลุด และเครื่องนี้ยังไม่เคยแตะแถวนั้น → ทับด้วยของใหม่", () => {
  const a = q("a", { status: "pending" });
  const fresh = q("a", { status: "confirmed" });
  const out = applyQueueCatchUp([a], [fresh], { startQueues: [a] });
  assert.equal(out[0], fresh);
});

test("แถวถูกแตะระหว่างดึง (optimistic/Realtime echo เข้ามาใหม่) → ห้ามทับด้วยผลที่ดึงก่อนหน้า", () => {
  const atStart = q("a", { status: "pending" });
  const editedDuringFetch = q("a", { status: "done" }); // ผู้ใช้เพิ่งกดเสร็จ → state เปลี่ยน reference
  const stale = q("a", { status: "confirmed" }); // ผลที่ดึงมา สร้างจากสถานะก่อนผู้ใช้กด
  const out = applyQueueCatchUp([editedDuringFetch], [stale], { startQueues: [atStart] });
  assert.equal(out[0], editedDuringFetch);
  assert.equal(out[0].status, "done");
});

test("แถวที่เพิ่งเพิ่มในเครื่องหลังเริ่มดึง (ไม่อยู่ในภาพก่อนเริ่ม) → ห้ามทับ", () => {
  const justAdded = q("z", { status: "pending" });
  const out = applyQueueCatchUp([justAdded], [q("z", { status: "confirmed" })], { startQueues: [] });
  assert.equal(out[0], justAdded);
});

test("เนื้อหาเหมือนกัน → คืน reference เดิม ไม่ re-render เปล่า ๆ", () => {
  const a = q("a");
  const prev = [a];
  assert.equal(applyQueueCatchUp(prev, [{ ...a }], { startQueues: prev }), prev);
  assert.equal(applyQueueCatchUp(prev, [], { startQueues: prev }), prev);
});

test("คิวที่ถูกลบในเครื่อง/Realtime ระหว่างดึง ห้ามโผล่กลับมา", () => {
  const out = applyQueueCatchUp([q("a")], [q("gone")], { startQueues: [q("a")], deletedIds: new Set(["gone"]) });
  assert.deepEqual(out.map((x) => x.id), ["a"]);
});

test("ลบตามประวัติการลบที่ยืนยัน: ลบเฉพาะ id นั้น คิวอื่นอยู่ครบและลำดับเดิม", () => {
  const prev = [q("a"), q("b"), q("c")];
  const out = applyQueueCatchUp(prev, [], { startQueues: prev, removedIds: ["b"] });
  assert.deepEqual(out.map((x) => x.id), ["a", "c"]);
  assert.equal(out[0], prev[0]);
  assert.equal(out[1], prev[2]);
});

test("ประวัติการลบอ้าง id ที่เครื่องนี้ไม่มีอยู่ → ไม่มีอะไรเปลี่ยน", () => {
  const prev = [q("a")];
  assert.equal(applyQueueCatchUp(prev, [], { startQueues: prev, removedIds: ["nope"] }), prev);
});

test("ถ้า id ที่ต้องลบมากผิดปกติ (เกินเพดาน) → ไม่ลบเลยสักแถว (กันข้อมูลเพี้ยนกวาดหน้าจอ)", () => {
  const ids = Array.from({ length: CATCH_UP_MAX_REMOVALS + 1 }, (_, i) => `x${i}`);
  const prev = ids.map((id) => q(id));
  const out = applyQueueCatchUp(prev, [], { startQueues: prev, removedIds: ids });
  assert.equal(out, prev);
  assert.equal(out.length, CATCH_UP_MAX_REMOVALS + 1);
});

test("แถวที่อยู่ในรายการลบ ห้ามถูกเพิ่ม/ทับกลับจากผลที่ดึง (ผลดึงกับประวัติเป็นคนละเวลา)", () => {
  const prev = [q("a")];
  const out = applyQueueCatchUp(prev, [q("a", { status: "confirmed" }), q("d")], { startQueues: prev, removedIds: ["a", "d"] });
  assert.deepEqual(out, []);
});

test("รวมทุกอย่างพร้อมกัน: เพิ่ม + ทับ + ลบ ในรอบเดียว และไม่แก้อาร์เรย์เดิม", () => {
  const a = q("a", { status: "pending" });
  const b = q("b");
  const prev = [a, b];
  const snapshot = [...prev];
  const out = applyQueueCatchUp(prev, [q("a", { status: "done" }), q("c")], { startQueues: prev, removedIds: ["b"] });
  assert.deepEqual(out.map((x) => `${x.id}:${x.status}`), ["a:done", "c:pending"]);
  assert.deepEqual(prev, snapshot, "ห้ามแก้อาร์เรย์เดิม");
});

test("ทำซ้ำได้ผลเดิม (idempotent) — updater ของ setState อาจถูกเรียกสองรอบใน StrictMode", () => {
  const a = q("a");
  const prev = [a];
  const opts = { startQueues: prev, removedIds: [] };
  const rows = [q("a", { status: "done" }), q("c")];
  const once = applyQueueCatchUp(prev, rows, opts);
  const twice = applyQueueCatchUp(prev, rows, opts);
  assert.deepEqual(once, twice);
  // ใช้กับผลรอบแรกซ้ำอีกที: ไม่ทำแถวซ้ำ
  const again = applyQueueCatchUp(once, rows, { ...opts, startQueues: once });
  assert.deepEqual(again.map((x) => x.id), ["a", "c"]);
});

test("แถวจากผลดึงที่ไม่มี id ถูกข้าม ไม่พัง", () => {
  const prev = [q("a")];
  assert.equal(applyQueueCatchUp(prev, [null, {}, { name: "x" }], { startQueues: prev }), prev);
});

// ─── ตัวคุมจังหวะ ────────────────────────────────────────────────────────
function harness(overrides = {}) {
  let t = 1_000_000;
  const timers = new Map();
  let nextId = 1;
  const calls = [];
  let visible = true;
  const h = {
    calls,
    setVisible(v) { visible = v; },
    advance(ms) {
      t += ms;
      for (const [id, tm] of [...timers]) if (tm.at <= t) { timers.delete(id); tm.fn(); }
    },
    pendingTimers: () => timers.size,
    now: () => t,
  };
  const c = createRealtimeCatchUpController({
    run: overrides.run ?? (async (since) => { calls.push(since); }),
    isVisible: () => visible,
    now: () => t,
    setTimer: (fn, ms) => { const id = nextId++; timers.set(id, { fn, at: t + ms }); return id; },
    clearTimer: (id) => timers.delete(id),
    random: () => 0,
    cooldownMs: 30_000, jitterMs: 1_500, retryDelayMs: 20_000, maxAttempts: 3,
    ...overrides.opts,
  });
  h.c = c;
  return h;
}
const flush = () => new Promise((r) => setImmediate(r));

test("เชื่อมต่อครั้งแรกปกติ (ไม่เคยหลุด) → ไม่ตาม", async () => {
  const h = harness();
  h.c.setReady(true);
  h.c.onStatus("SUBSCRIBED");
  h.advance(60_000); await flush();
  assert.equal(h.calls.length, 0);
});

test("หลุดแล้วต่อกลับ → ตาม 1 ครั้ง โดย since = จุดที่หลุด ย้อน 10 นาที", async () => {
  const h = harness();
  h.c.setReady(true);
  h.c.onStatus("SUBSCRIBED");
  h.advance(5_000);
  const lostAt = h.now();
  h.c.onStatus("CHANNEL_ERROR");
  h.advance(2_000);
  h.c.onStatus("SUBSCRIBED");
  h.advance(2_000); await flush();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0], new Date(lostAt - CATCH_UP_MARGIN_MS).toISOString());
});

test("หลุดหลายแบบ (TIMED_OUT / CLOSED) ก็ตามเหมือนกัน", async () => {
  for (const status of ["TIMED_OUT", "CLOSED"]) {
    const h = harness();
    h.c.setReady(true);
    h.c.onStatus(status);
    h.c.onStatus("SUBSCRIBED");
    h.advance(3_000); await flush();
    assert.equal(h.calls.length, 1, status);
  }
});

test("โหลดข้อมูลหลักยังไม่เสร็จ → รอ พอเสร็จแล้วค่อยตาม", async () => {
  const h = harness();
  h.c.onStatus("CHANNEL_ERROR");
  h.c.onStatus("SUBSCRIBED");
  h.advance(10_000); await flush();
  assert.equal(h.calls.length, 0);
  h.c.setReady(true);
  h.advance(3_000); await flush();
  assert.equal(h.calls.length, 1);
});

test("แท็บซ่อนอยู่ → ไม่ตาม รอกลับมาดูแล้วค่อยตาม", async () => {
  const h = harness();
  h.c.setReady(true);
  h.setVisible(false);
  h.c.onStatus("CHANNEL_ERROR");
  h.c.onStatus("SUBSCRIBED");
  h.advance(120_000); await flush();
  assert.equal(h.calls.length, 0, "ซ่อนอยู่ ห้ามตาม");
  h.setVisible(true);
  h.c.onVisibilityChange();
  h.advance(3_000); await flush();
  assert.equal(h.calls.length, 1);
});

test("ซ่อนแท็บระหว่างรอ timer → ตอนถึงเวลาไม่รัน รอกลับมาดู", async () => {
  const h = harness();
  h.c.setReady(true);
  h.c.onStatus("CHANNEL_ERROR");
  h.c.onStatus("SUBSCRIBED");
  h.setVisible(false);
  h.advance(3_000); await flush();
  assert.equal(h.calls.length, 0);
  h.setVisible(true);
  h.c.onVisibilityChange();
  h.advance(3_000); await flush();
  assert.equal(h.calls.length, 1);
});

test("หลุดซ้ำระหว่างรอ timer → ไม่รันตอนช่องยังไม่ต่อ รอ SUBSCRIBED ครั้งหน้า และตามด้วยจุดหลุดแรก", async () => {
  // random ใกล้ 1 = หน่วงเกือบเต็ม 1.5 วินาที จึงมีช่วงให้หลุดซ้ำก่อน timer ถึง (ถ้า random = 0 timer ทำงานทันที)
  const h = harness({ opts: { random: () => 0.99 } });
  h.c.setReady(true);
  const firstLoss = h.now();
  h.c.onStatus("CHANNEL_ERROR");
  h.c.onStatus("SUBSCRIBED");
  h.advance(500);
  h.c.onStatus("CHANNEL_ERROR"); // หลุดอีกก่อน timer ถึง
  h.advance(3_000); await flush();
  assert.equal(h.calls.length, 0, "ช่องยังไม่ต่อ ห้ามรัน");
  h.c.onStatus("SUBSCRIBED");
  h.advance(3_000); await flush();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0], new Date(firstLoss - CATCH_UP_MARGIN_MS).toISOString(), "ต้องย้อนไปจุดหลุดแรกที่ยังไม่ได้ตาม");
});

test("หลุด-ต่อรัว ๆ (ไม่มี timer ซ้อน) และห่างกันไม่ถึง 30 วินาที → รันไม่ถี่เกิน cooldown", async () => {
  const h = harness();
  h.c.setReady(true);
  h.c.onStatus("CHANNEL_ERROR"); h.c.onStatus("SUBSCRIBED");
  h.advance(2_000); await flush();
  assert.equal(h.calls.length, 1);
  const first = h.now();
  for (let i = 0; i < 6; i++) {
    h.advance(3_000);
    h.c.onStatus("CHANNEL_ERROR"); h.c.onStatus("SUBSCRIBED");
    await flush();
  }
  assert.equal(h.calls.length, 1, "ยังไม่ถึง 30 วินาทีจากรอบแรก");
  h.advance(30_000 - (h.now() - first) + 1_600); await flush();
  assert.equal(h.calls.length, 2, "ถึง cooldown แล้วรวมเป็นรอบเดียว");
  assert.equal(h.pendingTimers(), 0);
});

test("สั่ง SUBSCRIBED ซ้ำ ๆ ตอนมี timer รออยู่ → ไม่สร้าง timer ซ้อน", async () => {
  const h = harness();
  h.c.setReady(true);
  h.c.onStatus("CHANNEL_ERROR");
  h.c.onStatus("SUBSCRIBED");
  h.c.onStatus("SUBSCRIBED");
  h.c.onStatus("SUBSCRIBED");
  assert.equal(h.pendingTimers(), 1);
});

test("ล้มเหลว → ลองใหม่ได้ 3 ครั้ง แล้วหยุดเงียบ ๆ ไม่วนไม่จบ", async () => {
  let attempts = 0;
  const h = harness({ run: async () => { attempts += 1; throw new Error("network"); } });
  h.c.setReady(true);
  h.c.onStatus("CHANNEL_ERROR"); h.c.onStatus("SUBSCRIBED");
  for (let i = 0; i < 40; i++) { h.advance(20_000); await flush(); }
  assert.equal(attempts, 3, "ลองแค่ 3 ครั้งแล้วยอมแพ้ (ห้ามวนยิง DB ไม่จบ)");
  assert.equal(h.pendingTimers(), 0);
  assert.notEqual(h.c._state().pendingSince, null, "ยังจำจุดหลุดไว้ให้รอบหน้า");
});

test("ยอมแพ้แล้ว พอมีสัญญาณครั้งถัดไป (ต่อกลับ) → เริ่มลองใหม่ได้ และตามจากจุดหลุดเดิม", async () => {
  let fail = true;
  const seen = [];
  const h = harness({ run: async (since) => { seen.push(since); if (fail) throw new Error("x"); } });
  h.c.setReady(true);
  const lostAt = h.now();
  h.c.onStatus("CHANNEL_ERROR"); h.c.onStatus("SUBSCRIBED");
  for (let i = 0; i < 10; i++) { h.advance(20_000); await flush(); }
  assert.equal(seen.length, 3);
  fail = false;
  h.c.onStatus("SUBSCRIBED");
  h.advance(40_000); await flush();
  assert.equal(seen.length, 4);
  assert.equal(seen[3], new Date(lostAt - CATCH_UP_MARGIN_MS).toISOString());
  assert.equal(h.c._state().pendingSince, null);
});

test("ล้มเหลวครั้งแรกแล้วสำเร็จครั้งที่สอง → จบ ไม่ตามซ้ำ", async () => {
  let n = 0;
  const h = harness({ run: async () => { n += 1; if (n === 1) throw new Error("blip"); } });
  h.c.setReady(true);
  h.c.onStatus("CHANNEL_ERROR"); h.c.onStatus("SUBSCRIBED");
  for (let i = 0; i < 10; i++) { h.advance(20_000); await flush(); }
  assert.equal(n, 2);
});

test("หลุดใหม่ระหว่างที่กำลังตามอยู่ → ตามต่ออีกรอบหลังต่อกลับ (ไม่ทิ้งช่วงหลุดที่สอง)", async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const seen = [];
  const h = harness({ run: async (since) => { seen.push(since); if (seen.length === 1) await gate; } });
  h.c.setReady(true);
  h.c.onStatus("CHANNEL_ERROR"); h.c.onStatus("SUBSCRIBED");
  h.advance(2_000); await flush();
  assert.equal(seen.length, 1);
  h.c.onStatus("CHANNEL_ERROR"); // หลุดใหม่ระหว่างรัน
  release(); await flush();
  h.c.onStatus("SUBSCRIBED");
  h.advance(40_000); await flush();
  assert.equal(seen.length, 2);
});

test("dispose แล้วไม่รันอีก และล้าง timer", async () => {
  const h = harness();
  h.c.setReady(true);
  h.c.onStatus("CHANNEL_ERROR"); h.c.onStatus("SUBSCRIBED");
  h.c.dispose();
  h.advance(60_000); await flush();
  assert.equal(h.calls.length, 0);
  assert.equal(h.pendingTimers(), 0);
  h.c.onStatus("CHANNEL_ERROR"); h.c.onStatus("SUBSCRIBED");
  assert.equal(h.pendingTimers(), 0);
});

test("สุ่มหน่วง (jitter) อยู่ในช่วง 0–1.5 วินาที กันทุกเครื่องดึงพร้อมกัน", async () => {
  const delays = [];
  for (const r of [0, 0.5, 0.999]) {
    const h = harness({ opts: { random: () => r, setTimer: (fn, ms) => { delays.push(ms); return 1; } } });
    h.c.setReady(true);
    h.c.onStatus("CHANNEL_ERROR"); h.c.onStatus("SUBSCRIBED");
  }
  assert.ok(delays.every((d) => d >= 0 && d < 1_500), JSON.stringify(delays));
  assert.ok(new Set(delays).size > 1, "ค่าหน่วงต้องต่างกันตามตัวสุ่ม");
});
