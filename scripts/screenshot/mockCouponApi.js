// ตัวจำลอง API คูปองในหน่วยความจำ (โหมดเดโม) — ทำตามกติกาเดียวกับฟังก์ชัน coupon_*_v1 ใน SQL
// ไม่ต่อเครือข่าย ข้อมูลหายเมื่อรีเฟรช ใช้ดูหน้าจอ/ถ่ายภาพคู่มือเท่านั้น
export const couponsAvailable = true;
export const getServerSessionToken = () => "demo";

// หมวดรหัส POS เริ่มต้น (เหมือน seed ใน migration) แก้ไขได้ในหน้า "หมวดรหัส" ของเดโม
const categories = [
  ["T1", "เลเซอร์ขน Diode · IPL (พนักงานทำ)"],
  ["T2", "Pico (พนักงานทำ)"],
  ["T3", "ทรีตเมนต์หน้า · มาส์ก · กดสิว (พนักงานทำ)"],
  ["T4", "HIFU (พนักงานทำ)"],
  ["T99", "ของแถม · ฟรี (พนักงานทำ)"],
  ["D1", "Botox"],
  ["D2", "Pico (แพทย์ทำ)"],
  ["D3", "Meso หน้าใส"],
  ["D4", "เครื่องโดยแพทย์ HIFU · Oligio · Ulthera"],
  ["D5", "ปากกาลด นน. · ยาฉีด"],
  ["D6", "IV Drip · วิตามิน"],
  ["D7", "หัตถการทั่วไป ฉีดสิว · สลาย Filler · Subcision"],
  ["D8", "Meso Fat · สลายไขมัน"],
  ["D9", "Biostimulator Juvelook · Sculptra · Radiesse"],
  ["D10", "Filler"],
  ["D99", "ของแถม · ฟรี (แพทย์ทำ)"],
  ["S1", "เซตฉีด + เครื่อง"],
  ["S2", "โปรแคมเปญ · โปรประจำเดือน"],
  ["O1", "Gift Card · วงเงิน VIP"],
  ["O2", "ยาเม็ด · ยาทา"],
  ["O3", "สินค้าหน้าร้าน"],
  ["O4", "มัดจำ / Deposit"],
  ["O9", "อื่นๆ · Other Income"],
].map(([prefix, label], i) => ({ prefix, label, active: true, sortOrder: (i + 1) * 10 }));
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
  const cat = categories.find((c) => c.prefix === prefix);
  if (!cat) fail("invalid_prefix");
  if (!cat.active) fail("category_inactive");
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
export async function fetchCouponStats(_t, { from = null, to = null } = {}) {
  const t = today();
  const shift = (d, n) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
  const f = from || shift(t, -29), e = to || t;
  if (e < f || (new Date(e) - new Date(f)) / 86400000 > 365) fail("invalid_range");
  const st = (c) => status(c);
  const sum = (arr) => arr.reduce((a, c) => a + c.price, 0);
  const by = (k) => coupons.filter((c) => st(c) === k);
  const soon = coupons.filter((c) => st(c) === "active" && c.expiryDate <= shift(t, 30));
  const totals = {
    issued: coupons.length, issuedValue: sum(coupons),
    used: by("used_up").length, usedValue: sum(by("used_up")),
    active: by("active").length, activeValue: sum(by("active")),
    expired: by("expired").length, expiredValue: sum(by("expired")),
    cancelled: by("cancelled").length,
    expiringSoon: soon.length, expiringSoonValue: sum(soon),
  };
  const pk = new Map();
  for (const c of coupons) {
    const prefix = c.code.split("-")[0], key = `${prefix}|${c.name}|${c.price}`;
    const g = pk.get(key) || { prefix, name: c.name, price: c.price, issued: 0, used: 0, active: 0, expired: 0, cancelled: 0 };
    g.issued++; const k = st(c); g[k === "used_up" ? "used" : k]++; pk.set(key, g);
  }
  const inRange = redemptions.filter((r) => !r.revertedAt && r.redeemedAt.slice(0, 10) >= f && r.redeemedAt.slice(0, 10) <= e);
  const price = (r) => coupons.find((c) => c.id === r.couponId)?.price || 0;
  const bm = new Map();
  for (const r of inRange) { const g = bm.get(r.branchName) || { branchName: r.branchName, count: 0, value: 0 }; g.count++; g.value += price(r); bm.set(r.branchName, g); }
  const days = [];
  for (let d = f; d <= e; d = shift(d, 1)) {
    const rs = inRange.filter((r) => r.redeemedAt.slice(0, 10) === d);
    days.push({ date: d, count: rs.length, value: rs.reduce((a, r) => a + price(r), 0) });
  }
  const ex = new Map();
  for (const c of soon) { const prefix = c.code.split("-")[0], key = `${prefix}|${c.name}|${c.price}|${c.expiryDate}`; const g = ex.get(key) || { prefix, name: c.name, price: c.price, expiryDate: c.expiryDate, count: 0 }; g.count++; ex.set(key, g); }
  return {
    from: f, to: e, today: t, totals,
    products: [...pk.values()].sort((a, b) => b.issued - a.issued),
    branches: [...bm.values()].sort((a, b) => b.count - a.count),
    days,
    expiring: [...ex.values()].sort((a, b) => a.expiryDate.localeCompare(b.expiryDate)),
  };
}
const withIssued = () => categories.map((c) => ({ ...c, issued: counters[c.prefix] || 0 }));
export async function fetchCouponCategories() { return withIssued(); }
export async function saveCouponCategory(_t, { prefix, label, active, create }) {
  const p = String(prefix || "").trim().toUpperCase(), l = String(label || "").trim();
  if (!/^[A-Z]{1,3}[0-9]{1,3}$/.test(p) || l.length < 1 || l.length > 80) fail("invalid_category");
  const found = categories.find((c) => c.prefix === p);
  if (create) {
    if (found) fail("category_exists");
    categories.push({ prefix: p, label: l, active: active !== false, sortOrder: Math.max(0, ...categories.map((c) => c.sortOrder)) + 10 });
  } else {
    if (!found) fail("category_not_found");
    found.label = l;
    if (typeof active === "boolean") found.active = active;
  }
  return withIssued();
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
