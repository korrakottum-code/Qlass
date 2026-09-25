// ตามข้อมูลให้ทัน "หลัง Realtime หลุดแล้วต่อกลับ" — โมดูลล้วน ไม่มี import ทดสอบด้วย node ได้ตรง ๆ
//
// ที่มา (25 ก.ย. 2569): เปิดระบบเก็บ error แล้วเห็นว่าการเชื่อมต่อ Realtime ของแต่ละเครื่องหลุดแล้วต่อกลับเอง
// ~2 ครั้ง/เครื่อง/ชม. (CHANNEL_ERROR แล้ว SUBSCRIBED ตามมา) แต่ App.jsx ตอนต่อกลับแค่ log ไม่ได้ดึงของที่พลาด
// ระหว่างหลุดกลับมา → หน้าจอไม่เห็นคิวที่เครื่องอื่นเพิ่งลง/เปลี่ยนสถานะ/ลบ จนกว่าจะรีเฟรช
// (กันจองซ้ำยังปลอดภัย เพราะตอนบันทึกแอปดึงข้อมูลสดจาก DB มาเช็คก่อนเสมอ)
//
// ทำไมไม่ดึงทั้งช่วงวันมาเทียบ (ตัดสินใจหลังตรวจข้อมูลจริง):
//   - ช่วงเมื่อวาน–อีก 14 วัน = 10,442 คิว ~3 MB/ครั้ง × 119 เครื่อง × หลุด 2 ครั้ง/ชม. ≈ 6 GB/วัน
//   - ตัวดึงเดิมแบ่งหน้าแบบ OFFSET และไม่รับประกันว่าครบ (ถ้ามีคนลบคิวระหว่างดึง แถวอาจข้ามไปได้)
//     ถ้าเอาไปตีความว่า "ไม่มีในผลลัพธ์ = ถูกลบ" จะลบคิวจริงทิ้งจากหน้าจอผิด ๆ
// จึงดึงเฉพาะ "สิ่งที่เปลี่ยนตั้งแต่ก่อนหลุด" แทน (ปกติไม่กี่สิบแถว):
//   - เพิ่ม/แก้: queues.updated_at ที่ trigger queue_set_concurrency_metadata ตั้งให้เป็นเวลาเซิร์ฟเวอร์ทุกครั้ง
//     ที่แถวถูก INSERT หรือเปลี่ยนจริง (ทุกทางเขียน: แอป edge function SQL ตรง) ไม่ขึ้นกับนาฬิกาเครื่องพนักงาน
//   - ลบ: activity_logs (action = delete_queue) ซึ่งแอปบันทึกทุกครั้งที่ลบคิว — ไม่ต้องเดาจาก "แถวหาย"
//
// กติกาความปลอดภัยของการรวมข้อมูล (applyQueueCatchUp):
//   1. แถวที่เครื่องนี้ยังไม่มี → เพิ่ม (ยกเว้นที่เพิ่งถูกลบระหว่างดึง)
//   2. แถวที่มีอยู่แล้ว → ทับด้วยของใหม่ "เฉพาะเมื่อยังไม่ถูกแตะตั้งแต่เริ่มดึง" (เทียบ reference กับภาพก่อนเริ่มดึง)
//      ถ้ามี optimistic update หรือ Realtime echo เข้ามาระหว่างดึง = ของในเครื่องสดกว่า ห้ามทับด้วยผลที่ดึงก่อนหน้า
//   3. ลบเฉพาะ id ที่ประวัติการลบยืนยัน และถ้ามากผิดปกติ (เกินเพดาน) ไม่ลบเลย

const DISRUPTED = new Set(["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"]);

/** ย้อนหลังจากจุดที่หลุดกี่ ms — เผื่อนาฬิกาเครื่องเพี้ยนจากเซิร์ฟเวอร์ (ถ้าเพี้ยนเกินนี้ก็แค่พลาดเท่าที่เป็นอยู่ตอนนี้) */
export const CATCH_UP_MARGIN_MS = 10 * 60 * 1000;
/** ย้อนไกลสุด — หลุดนานกว่านี้ (เช่นปิดเครื่องข้ามคืน) เซสชันหมดอายุ/โหลดใหม่อยู่แล้ว */
export const CATCH_UP_MAX_LOOKBACK_MS = 24 * 60 * 60 * 1000;
/** เพดานจำนวน id ที่ยอมลบต่อรอบ — ประวัติการลบปกติมี 0–3 รายการต่อรอบ มากกว่านี้ถือว่าผิดปกติ ไม่ลบเลย */
export const CATCH_UP_MAX_REMOVALS = 50;

/** เวลาเริ่มดึง (ISO) จากจุดที่หลุด — ไม่ย้อนเกิน maxLookback */
export function catchUpSince(disruptedAtMs, nowMs, { marginMs = CATCH_UP_MARGIN_MS, maxLookbackMs = CATCH_UP_MAX_LOOKBACK_MS } = {}) {
  const start = Math.max(disruptedAtMs - marginMs, nowMs - maxLookbackMs);
  return new Date(start).toISOString(); // timestamp เทียบคอลัมน์ timestamptz (ไม่ใช่วันที่)
}

function sameQueue(a, b) {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  for (const k of ka) if (a[k] !== b[k]) return false;
  return true;
}

/**
 * รวมผลการตามข้อมูลเข้า state คิว — ฟังก์ชันล้วน (ใช้ใน setQueues(prev => ...) ต้อง idempotent)
 * คืน reference เดิมถ้าไม่มีอะไรเปลี่ยน (กัน re-render เปล่า ๆ)
 *   prev         — state ปัจจุบัน ณ ตอนรวม
 *   changedRows  — แถวที่เปลี่ยนตั้งแต่ since (mapQueueRow แล้ว)
 *   startQueues  — state ก่อนเริ่มดึง ใช้ตัดสินว่าแถวไหน "ถูกแตะระหว่างดึง"
 *   deletedIds   — id ที่ถูกลบ (local/realtime) ระหว่างดึง ห้ามปั้นกลับมา
 *   removedIds   — id ที่ประวัติการลบยืนยันว่าถูกลบไปแล้ว
 */
export function applyQueueCatchUp(prev, changedRows, { startQueues = [], deletedIds = new Set(), removedIds = [], maxRemovals = CATCH_UP_MAX_REMOVALS } = {}) {
  const removals = new Set(removedIds.length <= maxRemovals ? removedIds : []);
  const prevById = new Map(prev.map((q) => [q.id, q]));
  const startById = new Map(startQueues.map((q) => [q.id, q]));

  const additions = [];
  const replacements = new Map();
  for (const row of changedRows || []) {
    if (!row?.id || deletedIds.has(row.id) || removals.has(row.id)) continue;
    const local = prevById.get(row.id);
    if (!local) { additions.push(row); continue; }
    // ทับเฉพาะแถวที่ยังเป็นตัวเดิมเป๊ะ (reference) เหมือนตอนเริ่มดึง และเนื้อหาต่างจริง
    if (local === startById.get(row.id) && !sameQueue(local, row)) replacements.set(row.id, row);
  }

  const hasRemoval = removals.size > 0 && prev.some((q) => removals.has(q.id));
  if (additions.length === 0 && replacements.size === 0 && !hasRemoval) return prev;

  const next = [];
  for (const q of prev) {
    if (removals.has(q.id)) continue;
    next.push(replacements.get(q.id) ?? q);
  }
  for (const row of additions) next.push(row);
  return next;
}

/**
 * ตัวคุมจังหวะการตามข้อมูล — ไม่แตะ React/เบราว์เซอร์ ฉีด timer/เวลา/การเห็นหน้าจอเข้ามาเพื่อทดสอบได้
 *   onStatus(status)        — เรียกทุกครั้งที่สถานะ Realtime เปลี่ยน
 *   setReady(bool)          — โหลดข้อมูลหลักเสร็จแล้ว (ก่อนหน้านั้นไม่ตาม)
 *   onVisibilityChange()    — เรียกตอน visibilitychange (แท็บที่ซ่อนอยู่ไม่ตาม รอกลับมาดู)
 *   dispose()               — ล้าง timer
 * เงื่อนไขรัน: เคยหลุดมาก่อน + ตอนนี้ต่อกลับแล้ว + พร้อม + เห็นหน้าจอ + ห่างจากรอบก่อน ≥ cooldown
 * ล้มเหลว = ลองใหม่ได้ maxAttempts ครั้ง แล้วเงียบ (รอการหลุด/กลับมาดูครั้งถัดไป) ไม่รบกวนผู้ใช้
 */
export function createRealtimeCatchUpController({
  run,
  isVisible = () => true,
  now = () => Date.now(),
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
  random = Math.random,
  cooldownMs = 30 * 1000,
  jitterMs = 1500,
  retryDelayMs = 20 * 1000,
  maxAttempts = 3,
  marginMs = CATCH_UP_MARGIN_MS,
  maxLookbackMs = CATCH_UP_MAX_LOOKBACK_MS,
} = {}) {
  let ready = false;
  let channelUp = false;
  let disposed = false;
  let running = false;
  let pendingSince = null; // เวลา (ms) ที่หลุดครั้งแรกที่ยังไม่ได้ตาม
  let lastRunAt = -Infinity;
  let attempts = 0;
  let timer = null;

  function schedule(delayMs) {
    if (disposed || running || timer !== null) return;
    if (pendingSince === null || !channelUp || !ready || !isVisible()) return;
    const wait = delayMs ?? Math.max(0, lastRunAt + cooldownMs - now()) + random() * jitterMs;
    timer = setTimer(fire, wait);
  }

  async function fire() {
    timer = null;
    // เงื่อนไขอาจเปลี่ยนระหว่างรอ (หลุดอีก / ซ่อนแท็บ) — เช็คซ้ำ รอสัญญาณครั้งหน้า
    if (disposed || pendingSince === null || !channelUp || !ready || !isVisible()) return;
    const claimed = pendingSince;
    pendingSince = null;
    running = true;
    attempts += 1;
    let succeeded = false;
    let gaveUp = false;
    try {
      await run(catchUpSince(claimed, now(), { marginMs, maxLookbackMs }));
      succeeded = true;
      attempts = 0;
      lastRunAt = now();
    } catch {
      // คืนจุดหลุดเดิมไว้ (ถ้าหลุดซ้ำระหว่างรัน ใช้อันที่เก่ากว่า) เพื่อรอบถัดไปตามให้ครบ
      pendingSince = pendingSince === null ? claimed : Math.min(pendingSince, claimed);
      if (attempts >= maxAttempts) { attempts = 0; gaveUp = true; }
    }
    running = false;
    if (succeeded) schedule(); // ถ้าหลุดใหม่ระหว่างรัน pendingSince จะมีค่า → ตามต่อ
    else if (!gaveUp) schedule(retryDelayMs);
    // gaveUp: หยุดเงียบ ๆ ไม่ตั้งเวลาใหม่ — รอ SUBSCRIBED / กลับมาดูหน้าจอ / โหลดเสร็จ ครั้งถัดไปค่อยเริ่มใหม่
    // (ห้ามตั้งเวลาซ้ำตรงนี้ ไม่งั้นวนยิง DB ไม่จบจากทุกเครื่อง)
  }

  return {
    onStatus(status) {
      if (disposed) return;
      if (DISRUPTED.has(status)) {
        channelUp = false;
        if (pendingSince === null) pendingSince = now();
      } else if (status === "SUBSCRIBED") {
        channelUp = true;
        schedule();
      }
    },
    setReady(value) { ready = !!value; if (ready) schedule(); },
    onVisibilityChange() { schedule(); },
    dispose() { disposed = true; if (timer !== null) { clearTimer(timer); timer = null; } },
    // เฉพาะทดสอบ
    _state: () => ({ ready, channelUp, running, pendingSince, attempts, hasTimer: timer !== null }),
  };
}
