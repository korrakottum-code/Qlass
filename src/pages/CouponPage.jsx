import { useState, useEffect, useCallback } from "react";
import { formatThaiDate } from "../utils/helpers";
import { useSubmissionLock } from "../hooks/useSubmissionLock";
import { getServerSessionToken, useServerSession, lookupCoupon, listCoupons, listCouponBatches, redeemCoupon, revertCouponRedemption, cancelCoupon, generateCoupons } from "../utils/sessionAuth";
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
  used_up:   { label: "ใช้ครบแล้ว", color: "#6b7280" },
  expired:   { label: "หมดอายุ",    color: "#d97706" },
  cancelled: { label: "ยกเลิก",     color: "#dc2626" },
};

const ERRORS = {
  coupon_not_found: "ไม่พบรหัสคูปองนี้",
  coupon_cancelled: "คูปองนี้ถูกยกเลิกแล้ว",
  coupon_used_up: "คูปองนี้ใช้ครบจำนวนครั้งแล้ว",
  coupon_expired: "คูปองนี้หมดอายุแล้ว",
  invalid_branch: "ไม่พบสาขาที่เลือก",
  already_reverted: "รายการนี้ถูกย้อนไปแล้ว",
  invalid_quantity: "จำนวนใบต้อง 1–2,000",
  invalid_uses: "จำนวนครั้งต่อใบต้อง 1–999",
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
  const [gen, setGen] = useState({ name: "", category: "", price: "", totalUses: 1, quantity: 10, prefix: "D1", expiryDate: "", customerName: "", customerPhone: "", note: "" });
  const [lastBatch, setLastBatch] = useState(null);
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

  useEffect(() => {
    if (tab !== "batches") return;
    listCouponBatches(token).then(setBatches).catch(async (e) => onToast?.("error", await explain(e)));
  }, [tab, token, onToast, lastBatch]);

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
      onToast?.("success", `ตัดคูปองแล้ว — เหลือ ${r.result.remaining}/${r.result.totalUses} ครั้ง`);
    }
  }

  async function handleRevert(redemptionId) {
    if (!window.confirm("ย้อนการตัดครั้งนี้? สิทธิ์จะกลับคืนคูปอง 1 ครั้ง")) return;
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

  async function handleGenerate(e) {
    e.preventDefault();
    const r = await run(async () => {
      try {
        return await generateCoupons(token, {
          ...gen,
          price: Number(gen.price || 0),
          totalUses: Number(gen.totalUses),
          quantity: Number(gen.quantity),
        });
      } catch (err) {
        onToast?.("error", await explain(err));
        return null;
      }
    });
    if (r.started && r.result) {
      setLastBatch(r.result);
      onToast?.("success", `ออกคูปอง ${r.result.count} ใบแล้ว`);
    }
  }

  if (!useServerSession) {
    return <div className="card" style={{ padding: 24 }}>ระบบคูปองต้องเปิดโหมดเซสชันฝั่งเซิร์ฟเวอร์ (VITE_USE_SERVER_SESSION=true)</div>;
  }

  const tabs = [["redeem", "🎟️ ตัดคูปอง"], ["list", "📋 รายการ"], ["batches", "📦 ล็อต/ช่วงรหัส"], ...(canManage ? [["generate", "➕ ออกคูปอง"]] : [])];
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
                เหลือ <b>{found.remaining}</b> / {found.totalUses} ครั้ง · หมดอายุ {formatThaiDate(found.expiryDate)}
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
                  <button className="btn btn-primary" disabled={isSaving || !branchId} onClick={handleRedeem}>ตัดคูปอง 1 ครั้ง</button>
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
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead><tr><th>รหัส</th><th>ชื่อ</th><th>เหลือ/ทั้งหมด</th><th>หมดอายุ</th><th>ลูกค้า</th><th>สถานะ</th><th /></tr></thead>
              <tbody>
                {list.coupons.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontFamily: "var(--mono)" }}>{c.code}</td>
                    <td>{c.name}</td>
                    <td>{c.remaining}/{c.totalUses}</td>
                    <td>{formatThaiDate(c.expiryDate)}</td>
                    <td>{c.customerName || "—"} {c.customerPhone || ""}</td>
                    <td><StatusBadge status={c.status} /></td>
                    <td><button className="btn btn-sm btn-secondary" onClick={() => { setCode(c.code); setFound(c); setTab("redeem"); }}>เปิด</button></td>
                  </tr>
                ))}
                {!loading && list.coupons.length === 0 && <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--text3)" }}>ไม่พบคูปอง</td></tr>}
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
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead><tr><th>ช่วงรหัส</th><th>ชื่อ</th><th>ราคา</th><th>ครั้ง/ใบ</th><th>จำนวนใบ</th><th>หมดอายุ</th><th>วันที่ออก</th></tr></thead>
            <tbody>
              {batches.batches.map((b) => (
                <tr key={b.id}>
                  <td style={{ fontFamily: "var(--mono)" }}>{b.firstCode} – {b.lastCode}</td>
                  <td>{b.name}</td>
                  <td>฿{Number(b.price).toLocaleString()}</td>
                  <td>{b.totalUses}</td>
                  <td>{b.quantity.toLocaleString()}</td>
                  <td>{formatThaiDate(b.expiryDate)}</td>
                  <td>{new Date(b.createdAt).toLocaleDateString("th-TH")}</td>
                </tr>
              ))}
              {batches.batches.length === 0 && <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--text3)" }}>ยังไม่มีล็อต</td></tr>}
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
            <label style={{ fontSize: 12 }}>ใช้ได้กี่ครั้งต่อใบ
              <input className="input" type="number" min="1" max="999" value={gen.totalUses} onChange={(e) => setGen({ ...gen, totalUses: e.target.value })} required />
            </label>
            <label style={{ fontSize: 12 }}>จำนวนใบ (สูงสุด 2,000 ต่อครั้ง)
              <input className="input" type="number" min="1" max="2000" value={gen.quantity} onChange={(e) => setGen({ ...gen, quantity: e.target.value })} required />
            </label>
            <label style={{ fontSize: 12 }}>วันหมดอายุ
              <input className="input" type="date" value={gen.expiryDate} onChange={(e) => setGen({ ...gen, expiryDate: e.target.value })} required />
            </label>
            <label style={{ fontSize: 12 }}>หมวดรหัส POS (รหัสจะเป็น หมวด-เลขรัน 7 หลัก)
              <select className="input" value={gen.prefix} onChange={(e) => setGen({ ...gen, prefix: e.target.value })} required>
                {POS_CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <input className="input" placeholder="ชื่อลูกค้า (ผูกทั้งล็อต ถ้ามี)" value={gen.customerName} onChange={(e) => setGen({ ...gen, customerName: e.target.value })} />
            <input className="input" placeholder="เบอร์ลูกค้า (ถ้ามี)" value={gen.customerPhone} onChange={(e) => setGen({ ...gen, customerPhone: e.target.value })} />
          </div>
          <input className="input" placeholder="หมายเหตุ" value={gen.note} onChange={(e) => setGen({ ...gen, note: e.target.value })} maxLength={200} />
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
