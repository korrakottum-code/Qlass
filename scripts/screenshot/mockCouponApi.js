// ตัวจำลอง API คูปองในหน่วยความจำ (โหมดเดโม) — ทำตามกติกาเดียวกับฟังก์ชัน coupon_*_v1 ใน SQL
// ไม่ต่อเครือข่าย ข้อมูลหายเมื่อรีเฟรช ใช้ดูหน้าจอ/ถ่ายภาพคู่มือเท่านั้น
export const couponsAvailable = true;
export const getServerSessionToken = () => "demo";

const POS = /^(T([1-4]|99)|D([1-9]|10|99)|S[12]|O[12349])$/;
const counters = {};
const batches = [];
const coupons = [];
const redemptions = [];
let seq = 0;
const uid = () => `demo-${++seq}`;
const today = () => new Date().toISOString().slice(0, 10);
const fail = (code) => { throw new Error(code); };

function status(c) {
  if (c.cancelled) return "cancelled";
  if (c.usedCount >= c.totalUses) return "used_up";
  if (c.expiryDate < today()) return "expired";
  return "active";
}
const view = (c) => ({
  id: c.id, code: c.code, name: c.name, category: c.category, price: c.price,
  totalUses: c.totalUses, usedCount: c.usedCount, remaining: c.totalUses - c.usedCount,
  expiryDate: c.expiryDate, status: status(c), customerName: c.customerName || null, customerPhone: c.customerPhone || null,
  note: c.note || null, createdAt: c.createdAt,
  redemptions: redemptions.filter((r) => r.couponId === c.id).sort((a, b) => b.redeemedAt.localeCompare(a.redeemedAt))
    .map((r) => ({ id: r.id, branchName: r.branchName, staffName: r.staffName, note: r.note, redeemedAt: r.redeemedAt, revertedAt: r.revertedAt })),
});
const pad = (n) => String(n).padStart(7, "0");
const find = (code) => coupons.find((c) => c.code === String(code).trim().toUpperCase());

export async function generateCoupons(_t, b) {
  const prefix = String(b.prefix || "").trim().toUpperCase();
  const qty = Number(b.quantity), uses = 1; // 1 ใบ = 1 ครั้ง
  if (!(qty >= 1 && qty <= 20000)) fail("invalid_quantity");
  const after = b.startAfter == null ? 0 : Number(b.startAfter);
  if (!(after >= 0 && after <= 9999999)) fail("invalid_start");
  if (!POS.test(prefix)) fail("invalid_prefix");
  if (!b.expiryDate || b.expiryDate < today()) fail("invalid_expiry");
  if (!(Number(b.price) >= 0)) fail("invalid_price");
  if (!String(b.name || "").trim()) fail("invalid_name");
  const base = Math.max(counters[prefix] || 0, after);
  const start = base + 1, end = base + qty;
  if (end > 9999999) fail("prefix_exhausted");
  counters[prefix] = end;
  const batchId = uid();
  const now = new Date().toISOString();
  batches.unshift({ id: batchId, prefix, firstCode: `${prefix}-${pad(start)}`, lastCode: `${prefix}-${pad(end)}`, name: b.name.trim(), category: b.category || "", price: Number(b.price), totalUses: uses, expiryDate: b.expiryDate, quantity: qty, note: b.note || null, createdAt: now });
  for (let n = start; n <= end; n++) {
    coupons.unshift({ id: uid(), batchId, code: `${prefix}-${pad(n)}`, name: b.name.trim(), category: b.category || "", price: Number(b.price), totalUses: uses, usedCount: 0, expiryDate: b.expiryDate, customerName: b.customerName, customerPhone: b.customerPhone, note: b.note, createdAt: now });
  }
  return { batchId, count: qty, price: Number(b.price), firstCode: `${prefix}-${pad(start)}`, lastCode: `${prefix}-${pad(end)}` };
}
export async function cancelCouponBatch(_t, batchId, cancel = true) {
  const b = batches.find((x) => x.id === batchId) || fail("batch_not_found");
  let changed = 0;
  if (cancel) {
    if (b.cancelledAt) fail("batch_already_cancelled");
    for (const c of coupons) if (c.batchId === b.id && !c.cancelled && c.usedCount === 0) { c.cancelled = true; c.cancelledByBatch = b.id; changed++; }
    b.cancelledAt = new Date().toISOString();
  } else {
    if (!b.cancelledAt) fail("batch_not_cancelled");
    for (const c of coupons) if (c.cancelledByBatch === b.id) { c.cancelled = false; c.cancelledByBatch = null; changed++; }
    b.cancelledAt = null;
  }
  return { changed, usedKept: coupons.filter((c) => c.batchId === b.id && c.usedCount > 0).length, cancelled: cancel };
}
export async function fetchCouponCounters() { return { ...counters }; }
export async function lookupCoupon(_t, code) { const c = find(code); return c ? view(c) : null; }
export async function listCoupons(_t, { search = "", status: st = "all", limit = 50, offset = 0 } = {}) {
  const q = search.trim().toLowerCase();
  const rows = coupons.filter((c) => (st === "all" || status(c) === st)
    && (!q || [c.code, c.name, c.customerName, c.customerPhone].some((v) => String(v || "").toLowerCase().includes(q))));
  return { total: rows.length, coupons: rows.slice(offset, offset + limit).map(view) };
}
export async function listCouponBatches() { return { total: batches.length, batches: [...batches] }; }
export async function redeemCoupon(_t, { code, branchId, note }) {
  const c = find(code) || fail("coupon_not_found");
  const s = status(c);
  if (s === "cancelled") fail("coupon_cancelled");
  if (s === "used_up") fail("coupon_used_up");
  if (s === "expired") fail("coupon_expired");
  if (!branchId) fail("invalid_branch");
  c.usedCount += 1;
  redemptions.push({ id: uid(), couponId: c.id, branchName: `สาขา ${branchId}`, staffName: "ผู้ใช้เดโม", note: note || null, redeemedAt: new Date().toISOString(), revertedAt: null });
  return view(c);
}
export async function revertCouponRedemption(_t, id) {
  const r = redemptions.find((x) => x.id === id) || fail("redemption_not_found");
  if (r.revertedAt) fail("already_reverted");
  r.revertedAt = new Date().toISOString();
  const c = coupons.find((x) => x.id === r.couponId);
  c.usedCount -= 1;
  return view(c);
}
export async function cancelCoupon(_t, code, cancel = true) {
  const c = find(code) || fail("coupon_not_found");
  c.cancelled = cancel;
  return view(c);
}
