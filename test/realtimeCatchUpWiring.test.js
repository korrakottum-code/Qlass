import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// สายเชื่อมของ "ตามข้อมูลหลัง Realtime หลุดแล้วต่อกลับ" (25 ก.ย. 2569) — ตัวตรรกะทดสอบแยกใน realtimeCatchUp.test.js
// ไฟล์นี้กันไม่ให้ใครแก้ App.jsx / supabaseService.js แล้วตัดสายหลุดโดยไม่รู้ตัว (เทสต์ตรรกะจะยังเขียวทั้งที่แอปไม่ได้ใช้)

const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const svc = readFileSync(new URL("../src/utils/supabaseService.js", import.meta.url), "utf8");

test("App.jsx ป้อนสถานะ Realtime เข้าตัวคุมทุกครั้ง (ยังบันทึก diagnostics เดิมอยู่ด้วย)", () => {
  assert.match(app, /import \{ applyQueueCatchUp, createRealtimeCatchUpController, createPeriodicRefreshController \} from "\.\/utils\/realtimeCatchUp";/);
  assert.match(app, /recordClientDiagnostic\("realtime_status", \{ status \}\);\s*catchUp\.onStatus\(status\);/);
});

test("ตัวคุมเห็นการซ่อน/แสดงแท็บ และถูกล้างเมื่อ effect ถูกถอด (ไม่ค้าง listener/timer)", () => {
  assert.match(app, /isVisible: \(\) => typeof document === "undefined" \|\| document\.visibilityState !== "hidden"/);
  assert.match(app, /document\.addEventListener\("visibilitychange", onVisibilityChange\);/);
  assert.match(app, /catchUp\.dispose\(\);\s*document\.removeEventListener\("visibilitychange", onVisibilityChange\);/);
});

test("ตัวคุมรู้ว่าโหลดข้อมูลหลักเสร็จแล้ว (ก่อนหน้านั้นไม่ตาม)", () => {
  assert.match(app, /useEffect\(\(\) => \{ catchUpControllerRef\.current\?\.setReady\(isDataReady\); \}, \[isDataReady\]\);/);
});

test("effect Realtime ยังรันครั้งเดียวตอนเปิดแอป (deps เป็นฟังก์ชันที่ identity คงที่ ไม่ทำให้สมัครใหม่ซ้ำ)", () => {
  assert.match(app, /const runQueueCatchUp = useCallback\(async \(sinceIso, opts = \{\}\) => \{[\s\S]*?\}, \[\]\);/);
  assert.match(app, /supabase\.removeChannel\(channel\);\s*\};\s*\}, \[runQueueCatchUp\]\);/);
});

test("รอบตามข้อมูลใช้กลไกกันคิวที่ถูกลบโผล่กลับ และเคลียร์เหมือนการโหลดช่วงอื่น", () => {
  const block = app.slice(app.indexOf("const runQueueCatchUp"), app.indexOf("useEffect(() => { catchUpControllerRef"));
  assert.match(block, /rangeInFlightRef\.current\.has\(key\)/);
  assert.match(block, /deletedDuringHistoryLoadRef\.current \?\? new Set\(\)/);
  assert.match(block, /applyQueueCatchUp\(prev, changed\.rows, \{ startQueues, deletedIds, removedIds \}\)/);
  assert.match(block, /finally \{\s*rangeInFlightRef\.current\.delete\(key\);\s*if \(rangeInFlightRef\.current\.size === 0\) deletedDuringHistoryLoadRef\.current = null;/);
  // ภาพก่อนเริ่มดึงต้องถ่าย "ก่อน" await ใด ๆ ไม่งั้นตรวจไม่ได้ว่าแถวไหนถูกแตะระหว่างดึง
  assert.ok(block.indexOf("const startQueues = queuesRef.current;") < block.indexOf("await Promise.all"));
});

test("ผลการตามข้อมูลล้มเหลวต้องไม่แจ้งผู้ใช้ (ไม่มี showToast/setRangeLoadStatus ในรอบนี้)", () => {
  const block = app.slice(app.indexOf("const runQueueCatchUp"), app.indexOf("useEffect(() => { catchUpControllerRef"));
  assert.ok(!/showToast|setRangeLoadStatus|setSupabaseError|alert\(/.test(block));
});

test("ฟังก์ชันดึง: คิวที่เปลี่ยนใช้ updated_at ของเซิร์ฟเวอร์ เรียงคงที่ และไม่ใช้ผลเพื่อตีความว่า 'ถูกลบ'", () => {
  const fn = svc.slice(svc.indexOf("export async function fetchQueuesChangedSince"), svc.indexOf("export async function fetchDeletedQueueIdsSince"));
  assert.match(fn, /\.gte\("updated_at", since\.toISOString\(\)\)/);
  assert.match(fn, /\.order\("updated_at", \{ ascending: true \}\)\s*\.order\("id", \{ ascending: true \}\)/);
  assert.match(fn, /if \(Number\.isNaN\(since\.getTime\(\)\)\) throw/);
});

test("ฟังก์ชันดึงรายการที่ถูกลบ: อ่านเฉพาะ target_id (ห้ามดึง detail ที่มีชื่อ/เบอร์ลูกค้า)", () => {
  const fn = svc.slice(svc.indexOf("export async function fetchDeletedQueueIdsSince"));
  const chain = fn.slice(0, fn.indexOf("return (data"));
  assert.match(chain, /\.from\("activity_logs"\)\s*\.select\("target_id"\)/);
  assert.match(chain, /\.eq\("action", "delete_queue"\)/);
  assert.ok(!/select\("\*"\)|detail/.test(chain), "ห้ามดึงคอลัมน์อื่นนอกจาก target_id");
});
