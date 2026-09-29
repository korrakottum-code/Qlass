import { useState, useEffect, useCallback, Fragment } from "react";
import { formatThaiDate } from "../utils/helpers";
import { useSubmissionLock } from "../hooks/useSubmissionLock";
import { getServerSessionToken, couponsAvailable, lookupCoupon, listCoupons, listCouponBatches, redeemCoupon, revertCouponRedemption, cancelCoupon, generateCoupons, fetchCouponCounters, cancelCouponBatch } from "../utils/couponApi";
import { serverErrorCode } from "../utils/sessionApi";

// หมวดรหัส POS v6.2 — ต้องตรงกับ regex ใน coupon_generate_v1
const POS_CATEGORIES = [
  ["T1", "T1 เลเซอร์ขน · IPL"], ["T2", "T2 Pico (พนักงาน)"], ["T3", "T3 ทรีตเมนต์หน้า · มาส์ก · กดสิว"], ["T4", "T4 HIFU (พนักงาน)"], ["T99", "T99 ของแถม · ฟรี (พนักงาน)"],
  ["D1", "D1 Botox"], ["D2", "D2 Pico (แพทย์)"], ["D3", "D3 Meso หน้าใส"], ["D4", "D4 เครื่องโดยแพทย์"], ["D5", "D5 ปากกาลด นน. · ยาฉีด"],
  ["D6", "D6 IV Drip · วิตามิน"], ["D7", "D7 หัตถการทั่วไป"], ["D8", "D8 Meso Fat · สลายไขมัน"], ["D9", "D9 Biostimulator"], ["D10", "D10 Filler"], ["D99", "D99 ของแถม · ฟรี (แพทย์)"],
  ["S1", "S1 เซตฉีด + เครื่อง"], ["S2", "S2 โปรแคมเปญ · โปรประจำเดือน"],
  ["O1", "O1 Gift Card · วงเงิน VIP"], ["O2", "O2 ยาเม็ด · ยาทา"], ["O3", "O3 สินค้าหน้าร้าน"], ["O4", "O4 มัดจำ / Deposit"], ["O9", "O9 อื่น ๆ · Other Income"],
];

const STATUS = {
  active:    { label: "ใช้ได้",     color: "#059669" },
  used_up:   { label: "ใช้แล้ว",     color: "#6b7280" },
  expired:   { label: "หมดอายุ",    color: "#d97706" },
  cancelled: { label: "ยกเลิก",     color: "#dc2626" },
};

const ERRORS = {
  coupon_not_found: "ไม่พบรหัสคูปองนี้",
  coupon_cancelled: "คูปองนี้ถูกยกเลิกแล้ว",
  coupon_used_up: "คูปองนี้ถูกใช้แล้ว",
  coupon_expired: "คูปองนี้หมดอายุแล้ว",
  invalid_branch: "ไม่พบสาขาที่เลือก",
  already_reverted: "รายการนี้ถูกย้อนไปแล้ว",
  invalid_quantity: "จำนวนใบต้อง 1–20,000 ต่อครั้ง",
  batch_not_found: "ไม่พบล็อตนี้",
  batch_already_cancelled: "ล็อตนี้ถูกยกเลิกไปแล้ว",
  batch_not_cancelled: "ล็อตนี้ไม่ได้ถูกยกเลิกอยู่",
  invalid_start: "เลขที่ให้ออกต่อต้องอยู่ระหว่าง 0–9,999,999",
  invalid_expiry: "วันหมดอายุต้องไม่ใช่วันที่ผ่านมาแล้ว",
  invalid_price: "ราคาไม่ถูกต้อง",
  invalid_name: "กรุณาใส่ชื่อคูปอง/โปร",
  invalid_prefix: "กรุณาเลือกหมวดรหัส POS",
  prefix_exhausted: "หมวดนี้ออกเลขครบ 9,999,999 แล้ว",
  forbidden: "บทบาทนี้ไม่มีสิทธิ์ทำรายการนี้",
  invalid_session: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่",
};

async function explain(err) {
  const code = (await serverErrorCode(err)) || err?.message;
  return ERRORS[code] || "ทำรายการไม่สำเร็จ ลองอีกครั้ง";
}

function StatusBadge({ status }) {
  const s = STATUS[status] || STATUS.active;
  return <span style={{ color: s.color, fontWeight: 700, fontSize: 12 }}>● {s.label}</span>;
}

// ทั้งหน้านี้ไม่เก็บอะไรใน state ของ App.jsx — ค้นเป็นรายใบ/แบ่งหน้าจากเซิร์ฟเวอร์เท่านั้น
export default function CouponPage({ branches, currentUser, onToast }) {
  const role = currentUser?.role;
  const canManage = ["superadmin", "head_admin"].includes(role);
  const canRevert = ["superadmin", "head_admin", "admin", "branch_manager"].includes(role);
  const branchScoped = role === "branch_manager" || role === "cashier";

  const [tab, setTab] = useState("redeem");
  const { isSaving, run } = useSubmissionLock();

  // ── ตัดคูปอง ──
  const [code, setCode] = useState("");
  const [found, setFound] = useState(null); // undefined-ish: null = ยังไม่ค้น, false = ไม่พบ
  const [branchId, setBranchId] = useState(branchScoped ? currentUser?.branchId || "" : "");
  const [note, setNote] = useState("");

  // ── รายการ ──
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(0);
  const [list, setList] = useState({ total: 0, coupons: [] });
  const [loading, setLoading] = useState(false);
  const PAGE_SIZE = 50;

  // ── ออกล็อต ──
  const [gen, setGen] = useState({ name: "", category: "", price: "", quantity: 10, startAfter: "", prefix: "D1", expiryDate: "", customerName: "", customerPhone: "", note: "" });
  const [lastBatch, setLastBatch] = useState(null);
  const [counters, setCounters] = useState({});
  // เพิ่มจำนวนจากล็อตเดิม: จำนวนและวันหมดอายุที่กรอกในแต่ละแถว (คีย์ = id ล็อต)
  const [addQty, setAddQty] = useState({});
  const [addExpiry, setAddExpiry] = useState({});
  const [batchTick, setBatchTick] = useState(0); // เพิ่มค่าเพื่อโหลดรายการล็อตใหม่หลังยกเลิก/กู้คืน
  const [openGroups, setOpenGroups] = useState(() => new Set()); // โปรที่กางดูช่วงรหัสของแต่ละล็อตอยู่
  const [batches, setBatches] = useState({ total: 0, batches: [] });

  const token = getServerSessionToken();

  const refreshList = useCallback(async () => {
    setLoading(true);
    try {
      setList(await listCoupons(token, { search, status, limit: PAGE_SIZE, offset: page * PAGE_SIZE }));
    } catch (e) {
      onToast?.("error", await explain(e));
    } finally {
      setLoading(false);
    }
  }, [token, search, status, page, onToast]);

  useEffect(() => {
    if (tab !== "list") return undefined;
    const t = setTimeout(refreshList, 250); // หน่วงเล็กน้อยตอนพิมพ์ค้นหา
    return () => clearTimeout(t);
  }, [tab, refreshList]);

  // เลขล่าสุดของแต่ละหมวด ใช้โชว์ตัวอย่างช่วงรหัสก่อนกดออกล็อต (โหลดใหม่ทุกครั้งที่เปิดแท็บ/ออกล็อตเสร็จ)
  useEffect(() => {
    if ((tab !== "generate" && tab !== "batches") || !canManage) return;
    fetchCouponCounters(token).then(setCounters).catch(() => setCounters({}));
  }, [tab, canManage, token, lastBatch]);

  useEffect(() => {
    if (tab !== "batches") return;
    listCouponBatches(token).then(setBatches).catch(async (e) => onToast?.("error", await explain(e)));
  }, [tab, token, onToast, lastBatch, batchTick]);

  async function handleLookup(e) {
    e?.preventDefault();
    if (!code.trim()) return;
    try {
      const c = await lookupCoupon(token, code.trim());
      setFound(c || false);
    } catch (err) {
      onToast?.("error", await explain(err));
    }
  }

  async function handleRedeem() {
    if (!found || !branchId) return;
    const r = await run(async () => {
      try {
        return await redeemCoupon(token, { code: found.code, branchId, note });
      } catch (err) {
        onToast?.("error", await explain(err));
        return null;
      }
    });
    if (r.started && r.result) {
      setFound(r.result);
      setNote("");
      onToast?.("success", "ตัดคูปองแล้ว");
    }
  }

  async function handleRevert(redemptionId) {
    if (!window.confirm("ย้อนการตัดครั้งนี้? คูปองจะกลับมาใช้ได้อีกครั้ง")) return;
    const r = await run(async () => {
      try {
        return await revertCouponRedemption(token, redemptionId);
      } catch (err) {
        onToast?.("error", await explain(err));
        return null;
      }
    });
    if (r.started && r.result) {
      setFound(r.result);
      onToast?.("success", "ย้อนการตัดแล้ว");
    }
  }

  async function handleCancel(c, cancel) {
    if (cancel && !window.confirm(`ยกเลิกคูปอง ${c.code}? จะตัดใช้ไม่ได้อีก (กู้คืนได้ภายหลัง)`)) return;
    const r = await run(async () => {
      try {
        return await cancelCoupon(token, c.code, cancel);
      } catch (err) {
        onToast?.("error", await explain(err));
        return null;
      }
    });
    if (r.started && r.result) {
      setFound(r.result);
      onToast?.("success", cancel ? "ยกเลิกคูปองแล้ว" : "กู้คืนคูปองแล้ว");
    }
  }

  // ออกเพิ่มจากล็อตที่เคยออกแล้ว: ใช้ชื่อ/ราคา/หมวด/หมายเหตุเดิม กรอกแค่จำนวน (และแก้วันหมดอายุได้) แล้วยืนยัน
  async function handleAddMore(b) {
    const qty = Number(addQty[b.id]);
    const expiry = addExpiry[b.id] || String(b.expiryDate).slice(0, 10);
    if (!(qty >= 1 && qty <= 20000)) { onToast?.("error", ERRORS.invalid_quantity); return; }
    const last = counters[b.prefix] || 0;
    const range = `${b.prefix}-${String(last + 1).padStart(7, "0")} – ${b.prefix}-${String(last + qty).padStart(7, "0")}`;
    if (!window.confirm(`เพิ่ม ${qty.toLocaleString()} ใบ\n${b.name} · ฿${Number(b.price).toLocaleString()} · หมดอายุ ${formatThaiDate(expiry)}\nรหัสที่จะได้: ${range}\n\nยืนยันออกคูปอง?`)) return;
    const r = await run(async () => {
      try {
        return await generateCoupons(token, {
          name: b.name, category: b.category || "", price: Number(b.price), prefix: b.prefix,
          quantity: qty, expiryDate: expiry, note: b.note || "",
        });
      } catch (err) {
        onToast?.("error", await explain(err));
        return null;
      }
    });
    if (r.started && r.result) {
      setLastBatch(r.result); // ทำให้รายการล็อตและเลขล่าสุดโหลดใหม่
      setAddQty((prev) => ({ ...prev, [b.id]: "" }));
      onToast?.("success", `เพิ่มแล้ว ${r.result.count.toLocaleString()} ใบ: ${r.result.firstCode} – ${r.result.lastCode}`);
    }
  }

  // ออกล็อตผิด → ยกเลิกทั้งล็อต: ปิดเฉพาะใบที่ยังไม่เคยถูกใช้ ใบที่ตัดไปแล้วไม่ถูกแตะ กู้คืนได้
  async function handleCancelBatch(x, cancel) {
    const range = `${x.firstCode} – ${x.lastCode}`;
    const msg = cancel
      ? `ยกเลิกทั้งล็อต ${range} (${x.quantity.toLocaleString()} ใบ) ?\nใบที่ยังไม่เคยถูกใช้จะตัดไม่ได้อีก ใบที่ถูกใช้ไปแล้วไม่ถูกแตะ\n(กู้คืนได้ภายหลัง)`
      : `กู้คืนล็อต ${range} ?\nคืนเฉพาะใบที่ล็อตนี้ยกเลิกเอง ใบที่ถูกยกเลิกรายใบมาก่อนไม่ถูกกู้คืน`;
    if (!window.confirm(msg)) return;
    const r = await run(async () => {
      try {
        return await cancelCouponBatch(token, x.id, cancel);
      } catch (err) {
        onToast?.("error", await explain(err));
        return null;
      }
    });
    if (r.started && r.result) {
      setBatchTick((n) => n + 1);
      onToast?.("success", cancel
        ? `ยกเลิกแล้ว ${r.result.changed.toLocaleString()} ใบ${r.result.usedKept ? ` (ใช้ไปแล้ว ${r.result.usedKept.toLocaleString()} ใบ คงเดิม)` : ""}`
        : `กู้คืนแล้ว ${r.result.changed.toLocaleString()} ใบ`);
    }
  }

  async function handleGenerate(e) {
    e.preventDefault();
    const r = await run(async () => {
      try {
        return await generateCoupons(token, {
          ...gen,
          price: Number(gen.price || 0),
          quantity: Number(gen.quantity),
          startAfter: gen.startAfter === "" ? null : Number(gen.startAfter),
        });
      } catch (err) {
        onToast?.("error", await explain(err));
        return null;
      }
    });
    if (r.started && r.result) {
      setLastBatch(r.result);
      setGen((g) => ({ ...g, startAfter: "" })); // ใช้ครั้งเดียว: ตัวนับเดินต่อเองแล้ว
      onToast?.("success", `ออกคูปอง ${r.result.count} ใบแล้ว`);
    }
  }

  if (!couponsAvailable) {
    return <div className="card" style={{ padding: 24 }}>ระบบคูปองต้องเปิดโหมดเซสชันฝั่งเซิร์ฟเวอร์ (VITE_USE_SERVER_SESSION=true)</div>;
  }

  const tabs = [["redeem", "🎟️ ตัดคูปอง"], ["list", "📋 รายการ"], ["batches", "📦 ล็อต/ช่วงรหัส"], ...(canManage ? [["generate", "➕ ออกคูปอง"]] : [])];
  // ตัวอย่างช่วงรหัสที่จะได้ (คำนวณแบบเดียวกับที่เซิร์ฟเวอร์ทำ: ต่อจากเลขล่าสุดของหมวด หรือเลขที่ระบุ ถ้ามากกว่า)
  const pad7 = (n) => String(n).padStart(7, "0");
  const lastNo = Math.max(counters[gen.prefix] || 0, gen.startAfter === "" ? 0 : Number(gen.startAfter) || 0);
  const qtyNum = Number(gen.quantity) || 0;
  const preview = qtyNum > 0 ? { first: `${gen.prefix}-${pad7(lastNo + 1)}`, last: `${gen.prefix}-${pad7(lastNo + qtyNum)}`, over: lastNo + qtyNum > 9999999 } : null;
  // หุบรวมเป็นโปรละหนึ่งแถว (หมวด+ชื่อ+ราคาเดียวกัน) กางออกดูช่วงรหัสของแต่ละล็อตได้
  // รายการเรียงใหม่→เก่า จึงได้ล็อตแรกของแต่ละกลุ่มเป็นล็อตล่าสุด (ใช้เป็นต้นแบบตอนกด "เพิ่ม")
  const groups = [];
  {
    const byKey = new Map();
    for (const b of batches.batches) {
      const key = `${b.prefix}|${b.name}|${b.price}|${b.category || ""}`;
      let g = byKey.get(key);
      if (!g) { g = { key, prefix: b.prefix, name: b.name, price: b.price, latest: b, batches: [], total: 0 }; byKey.set(key, g); groups.push(g); }
      g.batches.push(b);
      g.total += b.quantity;
    }
  }
  const toggleGroup = (key) => setOpenGroups((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const totalPages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));

  return (
    <div>
      <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 800 }}>🎟️ คูปอง</h2>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {tabs.map(([id, label]) => (
          <button key={id} className={`btn btn-sm ${tab === id ? "btn-primary" : "btn-secondary"}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {tab === "redeem" && (
        <div className="card" style={{ padding: 16, maxWidth: 640 }}>
          <form onSubmit={handleLookup} style={{ display: "flex", gap: 8 }}>
            <input className="input" style={{ flex: 1, fontFamily: "var(--mono)", textTransform: "uppercase" }} placeholder="กรอกรหัสคูปอง" value={code} onChange={(e) => { setCode(e.target.value); setFound(null); }} autoFocus />
            <button className="btn btn-primary" type="submit">ตรวจสอบ</button>
          </form>

          {found === false && <p style={{ color: "#dc2626", marginTop: 12 }}>ไม่พบรหัสคูปองนี้</p>}

          {found && (
            <div style={{ marginTop: 16, display: "grid", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong style={{ fontSize: 16 }}>{found.name}</strong>
                <StatusBadge status={found.status} />
              </div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 13 }}>{found.code}</div>
              <div style={{ fontSize: 13, color: "var(--text3)" }}>
                {found.status === "used_up" ? "ใช้แล้ว" : "ยังไม่ได้ใช้"} · หมดอายุ {formatThaiDate(found.expiryDate)}
                {found.price > 0 && ` · ฿${Number(found.price).toLocaleString()}`}
              </div>
              {(found.customerName || found.customerPhone) && (
                <div style={{ fontSize: 13 }}>ลูกค้า: {found.customerName || "—"} {found.customerPhone || ""}</div>
              )}

              {found.status === "active" && (
                <>
                  {!branchScoped && (
                    <select className="input" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                      <option value="">— เลือกสาขาที่ตัด —</option>
                      {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  )}
                  <input className="input" placeholder="หมายเหตุ (ถ้ามี)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
                  <button className="btn btn-primary" disabled={isSaving || !branchId} onClick={handleRedeem}>ตัดคูปอง</button>
                </>
              )}

              {found.redemptions.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>ประวัติการใช้</div>
                  {found.redemptions.map((r) => (
                    <div key={r.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12, padding: "4px 0", opacity: r.revertedAt ? 0.5 : 1, textDecoration: r.revertedAt ? "line-through" : "none" }}>
                      <span>{new Date(r.redeemedAt).toLocaleString("th-TH")} · {r.branchName} · {r.staffName}{r.note ? ` · ${r.note}` : ""}</span>
                      {canRevert && !r.revertedAt && <button className="btn btn-sm btn-secondary" disabled={isSaving} onClick={() => handleRevert(r.id)}>ย้อน</button>}
                    </div>
                  ))}
                </div>
              )}

              {canManage && (
                <button className="btn btn-sm btn-secondary" disabled={isSaving} onClick={() => handleCancel(found, found.status !== "cancelled")}>
                  {found.status === "cancelled" ? "กู้คืนคูปอง" : "ยกเลิกคูปองนี้"}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "list" && (
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <input className="input" style={{ minWidth: 240 }} placeholder="ค้นหา รหัส / ชื่อโปร / ลูกค้า / เบอร์" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
            <select className="input" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }}>
              <option value="all">ทุกสถานะ</option>
              {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <span style={{ alignSelf: "center", fontSize: 12, color: "var(--text3)" }}>{loading ? "กำลังโหลด…" : `${list.total.toLocaleString()} ใบ`}</span>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>รหัส</th><th>ชื่อ</th><th>หมดอายุ</th><th>ลูกค้า</th><th>สถานะ</th><th /></tr></thead>
              <tbody>
                {list.coupons.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontFamily: "var(--mono)" }}>{c.code}</td>
                    <td>{c.name}</td>
                    <td>{formatThaiDate(c.expiryDate)}</td>
                    <td>{c.customerName || "—"} {c.customerPhone || ""}</td>
                    <td><StatusBadge status={c.status} /></td>
                    <td><button className="btn btn-sm btn-secondary" onClick={() => { setCode(c.code); setFound(c); setTab("redeem"); }}>เปิด</button></td>
                  </tr>
                ))}
                {!loading && list.coupons.length === 0 && <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--text3)" }}>ไม่พบคูปอง</td></tr>}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 12, alignItems: "center" }}>
            <button className="btn btn-sm btn-secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>‹</button>
            <span style={{ fontSize: 12 }}>หน้า {page + 1}/{totalPages}</span>
            <button className="btn btn-sm btn-secondary" disabled={page + 1 >= totalPages} onClick={() => setPage(page + 1)}>›</button>
          </div>
        </div>
      )}

      {tab === "batches" && (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th />
                <th>โปร/คูปอง</th><th>หมวด</th><th>ราคา</th><th>จำนวนล็อต</th><th>จำนวนใบรวม</th><th>เลขล่าสุด</th>
                {canManage && <th>เพิ่มจำนวน (ออกต่อจากเลขล่าสุด)</th>}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const b = g.latest;
                const open = openGroups.has(g.key);
                return (
                  <Fragment key={g.key}>
                    <tr>
                      <td><button className="btn btn-sm btn-secondary" aria-expanded={open} title={open ? "หุบ" : "กางดูช่วงรหัสของแต่ละล็อต"} onClick={() => toggleGroup(g.key)}>{open ? "▾" : "▸"}</button></td>
                      <td><b>{g.name}</b></td>
                      <td style={{ fontFamily: "var(--mono)" }}>{g.prefix}</td>
                      <td>฿{Number(g.price).toLocaleString()}</td>
                      <td>{g.batches.length}</td>
                      <td>{g.total.toLocaleString()}</td>
                      <td style={{ fontFamily: "var(--mono)" }}>{b.lastCode}</td>
                      {canManage && (
                        <td>
                          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "nowrap" }}>
                            <input className="input" type="number" min="1" max="20000" placeholder="จำนวน" style={{ width: 90 }} value={addQty[b.id] ?? ""} onChange={(e) => setAddQty({ ...addQty, [b.id]: e.target.value })} />
                            <input className="input" type="date" style={{ width: 140 }} value={addExpiry[b.id] ?? String(b.expiryDate).slice(0, 10)} onChange={(e) => setAddExpiry({ ...addExpiry, [b.id]: e.target.value })} title="วันหมดอายุของล็อตใหม่" />
                            <button className="btn btn-sm btn-primary" disabled={isSaving || !addQty[b.id]} onClick={() => handleAddMore(b)}>เพิ่ม</button>
                          </div>
                        </td>
                      )}
                    </tr>
                    {open && g.batches.map((x) => (
                      <tr key={x.id} style={{ background: "var(--surface2)" }}>
                        <td />
                        <td colSpan={canManage ? 7 : 6} style={{ fontSize: 12 }}>
                          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                            <span style={{ opacity: x.cancelledAt ? 0.55 : 1 }}>
                              <span style={{ fontFamily: "var(--mono)", fontWeight: 700, textDecoration: x.cancelledAt ? "line-through" : "none" }}>{x.firstCode} – {x.lastCode}</span>
                              {` · ${x.quantity.toLocaleString()} ใบ · หมดอายุ ${formatThaiDate(x.expiryDate)} · ออกเมื่อ ${new Date(x.createdAt).toLocaleDateString("th-TH")}`}
                              {x.cancelledAt && <b style={{ color: "#dc2626" }}>{` · ยกเลิกทั้งล็อตเมื่อ ${new Date(x.cancelledAt).toLocaleDateString("th-TH")}`}</b>}
                            </span>
                            {canManage && (
                              <button className="btn btn-sm btn-secondary" disabled={isSaving} onClick={() => handleCancelBatch(x, !x.cancelledAt)}>
                                {x.cancelledAt ? "กู้คืนล็อต" : "ยกเลิกทั้งล็อต"}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
              {groups.length === 0 && <tr><td colSpan={canManage ? 8 : 7} style={{ textAlign: "center", color: "var(--text3)" }}>ยังไม่มีล็อต</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === "generate" && canManage && (
        <form className="card" style={{ padding: 16, maxWidth: 640, display: "grid", gap: 10 }} onSubmit={handleGenerate}>
          <input className="input" placeholder="ชื่อคูปอง/โปร *" value={gen.name} onChange={(e) => setGen({ ...gen, name: e.target.value })} required maxLength={120} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <input className="input" placeholder="หมวด (ถ้ามี)" value={gen.category} onChange={(e) => setGen({ ...gen, category: e.target.value })} />
            <input className="input" type="number" min="0" placeholder="ราคา" value={gen.price} onChange={(e) => setGen({ ...gen, price: e.target.value })} />
            <label style={{ fontSize: 12 }}>จำนวนใบ (สูงสุด 20,000 ต่อครั้ง)
              <input className="input" type="number" min="1" max="20000" value={gen.quantity} onChange={(e) => setGen({ ...gen, quantity: e.target.value })} required />
            </label>
            <label style={{ fontSize: 12 }}>วันหมดอายุ
              <input className="input" type="date" value={gen.expiryDate} onChange={(e) => setGen({ ...gen, expiryDate: e.target.value })} required />
            </label>
            <label style={{ fontSize: 12 }}>หมวดรหัส POS (รหัสจะเป็น หมวด-เลขรัน 7 หลัก)
              <select className="input" value={gen.prefix} onChange={(e) => setGen({ ...gen, prefix: e.target.value })} required>
                {POS_CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 12 }}>ออกต่อจากเลขที่ (ถ้าเคยออกไว้ก่อนใช้ระบบนี้)
              <input className="input" type="number" min="0" max="9999999" placeholder={counters[gen.prefix] ? `ล่าสุดในระบบ ${counters[gen.prefix]}` : "เช่น 1001"} value={gen.startAfter} onChange={(e) => setGen({ ...gen, startAfter: e.target.value })} />
            </label>
            <input className="input" placeholder="ชื่อลูกค้า (ผูกทั้งล็อต ถ้ามี)" value={gen.customerName} onChange={(e) => setGen({ ...gen, customerName: e.target.value })} />
            <input className="input" placeholder="เบอร์ลูกค้า (ถ้ามี)" value={gen.customerPhone} onChange={(e) => setGen({ ...gen, customerPhone: e.target.value })} />
          </div>
          <input className="input" placeholder="หมายเหตุ" value={gen.note} onChange={(e) => setGen({ ...gen, note: e.target.value })} maxLength={200} />
          {preview && (
            <div style={{ fontSize: 13, padding: "8px 10px", borderRadius: 8, background: "var(--surface2)", color: preview.over ? "#dc2626" : "inherit" }}>
              {counters[gen.prefix] || gen.startAfter !== "" ? `ต่อจาก ${gen.prefix}-${pad7(lastNo)} → ` : "เริ่มหมวดนี้ → "}
              ล็อตนี้ได้ <b style={{ fontFamily: "var(--mono)" }}>{preview.first} – {preview.last}</b>
              {preview.over && " (เกินเลขสูงสุด 9,999,999)"}
            </div>
          )}
          <button className="btn btn-primary" type="submit" disabled={isSaving}>{isSaving ? "กำลังออกคูปอง…" : "ออกคูปอง"}</button>
          {lastBatch && (
            <p style={{ fontSize: 13, margin: 0 }}>
              ✅ ออกแล้ว {lastBatch.count} ใบ: {lastBatch.firstCode} ถึง {lastBatch.lastCode} = ฿{Number(lastBatch.price ?? 0).toLocaleString()}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
