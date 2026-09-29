import { useState, useEffect, useCallback } from "react";
import { formatThaiDate } from "../utils/helpers";
import { addDays as shiftDay } from "../utils/queueRanges"; // ย้ายวันที่ด้วยตัวช่วยของโปรเจกต์ (ห้ามตัดวันจาก toISOString)
import { useSubmissionLock } from "../hooks/useSubmissionLock";
import { getServerSessionToken, couponsAvailable, lookupCoupon, listCoupons, listCouponBatches, redeemCoupon, revertCouponRedemption, cancelCoupon, generateCoupons, fetchCouponCounters, cancelCouponBatch, fetchCouponStats } from "../utils/couponApi";
import { serverErrorCode } from "../utils/sessionApi";
import Modal, { ModalHeader, ModalBody } from "../components/Modal";

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
  invalid_range: "ช่วงวันที่ไม่ถูกต้อง (ต้องไม่เกิน 366 วัน และวันเริ่มต้องไม่หลังวันสิ้นสุด)",
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

// หน้าต่างยืนยันสำหรับการกระทำที่แก้ยาก (ตัด / ยกเลิก): ต้องพิมพ์เลข 3 ตัวท้ายของรหัสให้ตรงก่อนถึงกดยืนยันได้
// กันกดผิดใบ/ผิดล็อต — ผู้ใช้ต้องมองรหัสจริง ๆ ไม่ใช่กด "ตกลง" ตามความเคยชิน
function DigitConfirm({ pending, busy, onClose, onConfirm }) {
  const [value, setValue] = useState("");
  const ok = value === pending.expect;
  return (
    <Modal onClose={onClose}>
      <ModalHeader title={pending.title} onClose={onClose} />
      <ModalBody>
        <div style={{ display: "grid", gap: 8 }}>
          {pending.lines.map((l, i) => (
            <div key={i} style={{ fontSize: i === 0 ? 15 : 13, fontWeight: i === 0 ? 700 : 400, color: i === 0 ? "inherit" : "var(--text3)" }}>{l}</div>
          ))}
          <div style={{ fontFamily: "var(--mono)", fontSize: 14 }}>{pending.codeLabel || "รหัสคูปอง"}: <b>{pending.code}</b></div>
          <label style={{ fontSize: 13 }}>พิมพ์เลข 3 ตัวท้ายของรหัสนี้เพื่อยืนยัน
            <input
              className="input" autoFocus inputMode="numeric" maxLength={3} placeholder="เช่น 001" value={value}
              style={{ fontFamily: "var(--mono)", letterSpacing: 4, fontSize: 16, marginTop: 4 }}
              onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => { if (e.key === "Enter" && ok && !busy) onConfirm(); }}
            />
          </label>
          {value.length === 3 && !ok && <div style={{ color: "#dc2626", fontSize: 12 }}>เลขไม่ตรงกับรหัส</div>}
        </div>
      </ModalBody>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose}>ปิด</button>
        <button className="btn btn-primary" style={pending.danger ? { background: "#dc2626", borderColor: "#dc2626" } : undefined} disabled={!ok || busy} onClick={onConfirm}>{pending.label}</button>
      </div>
    </Modal>
  );
}

// ─── สถิติ ───
// สีสถานะใช้ชุดเดียวกับป้ายสถานะในหน้า (ใช้ได้/ใช้แล้ว/หมดอายุ/ยกเลิก) และมีข้อความกำกับเสมอ ไม่พึ่งสีอย่างเดียว
const STAT_COLORS = { used: STATUS.used_up.color, active: STATUS.active.color, expired: STATUS.expired.color, cancelled: STATUS.cancelled.color };
const baht = (v) => `฿${Number(v || 0).toLocaleString()}`;
const num = (v) => Number(v || 0).toLocaleString();

function Tile({ label, value, sub }) {
  return (
    <div className="card" style={{ padding: "10px 12px", minWidth: 0 }}>
      <div style={{ fontSize: 12, color: "var(--text3)" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.25, overflowWrap: "anywhere" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--text3)" }}>{sub}</div>}
    </div>
  );
}

// แท่งซ้อนสัดส่วนสถานะ: ช่องว่าง 2px คั่นแต่ละส่วน + legend เป็นข้อความพร้อมตัวเลข
function StatusBar({ item }) {
  const parts = [
    { key: "used", label: "ใช้แล้ว", value: item.used },
    { key: "active", label: "ใช้ได้", value: item.active },
    { key: "expired", label: "หมดอายุ", value: item.expired },
    { key: "cancelled", label: "ยกเลิก", value: item.cancelled },
  ];
  return (
    <div>
      <div style={{ display: "flex", gap: 2, height: 10 }} role="img" aria-label={parts.map((p) => `${p.label} ${num(p.value)}`).join(" · ")}>
        {parts.filter((p) => p.value > 0).map((p) => (
          <div key={p.key} title={`${p.label}: ${num(p.value)}`} style={{ flex: p.value, minWidth: 3, background: STAT_COLORS[p.key], borderRadius: 3 }} />
        ))}
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12, marginTop: 4 }}>
        {parts.map((p) => (
          <span key={p.key} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, background: STAT_COLORS[p.key] }} />
            {p.label} {num(p.value)}
          </span>
        ))}
      </div>
    </div>
  );
}

function StatsView({ token, onToast }) {
  const [range, setRange] = useState({ from: "", to: "" });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetchCouponStats(token, { from: range.from || null, to: range.to || null }));
    } catch (e) {
      onToast?.("error", await explain(e));
    } finally {
      setLoading(false);
    }
  }, [token, range, onToast]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const preset = (days) => data && setRange({ from: shiftDay(data.today, -(days - 1)), to: data.today });
  const monthStart = () => data && setRange({ from: `${data.today.slice(0, 8)}01`, to: data.today });

  const t = data?.totals;
  const pct = t && t.issued ? Math.round((t.used / t.issued) * 100) : 0;
  const maxBranch = Math.max(1, ...(data?.branches || []).map((b) => b.count));
  const maxDay = Math.max(1, ...(data?.days || []).map((d) => d.count));
  const rangeTotal = (data?.days || []).reduce((a, d) => a + d.count, 0);
  const rangeValue = (data?.days || []).reduce((a, d) => a + Number(d.value), 0);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ fontSize: 12 }}>ตั้งแต่
          <input className="input" type="date" value={range.from || data?.from || ""} onChange={(e) => setRange({ ...range, from: e.target.value })} />
        </label>
        <label style={{ fontSize: 12 }}>ถึง
          <input className="input" type="date" value={range.to || data?.to || ""} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        </label>
        <button className="btn btn-sm btn-secondary" onClick={() => preset(7)} disabled={!data}>7 วัน</button>
        <button className="btn btn-sm btn-secondary" onClick={() => preset(30)} disabled={!data}>30 วัน</button>
        <button className="btn btn-sm btn-secondary" onClick={monthStart} disabled={!data}>เดือนนี้</button>
        {loading && <span style={{ fontSize: 12, color: "var(--text3)" }}>กำลังโหลด…</span>}
      </div>

      {!data ? <div style={{ color: "var(--text3)" }}>{loading ? "กำลังโหลด…" : "ยังไม่มีข้อมูล"}</div> : (
        <>
          <section>
            <h3 style={{ fontSize: 14, margin: "0 0 8px" }}>ภาพรวมทั้งหมด (ทุกล็อต ไม่ผูกกับช่วงวันที่)</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
              <Tile label="ออกทั้งหมด" value={`${num(t.issued)} ใบ`} sub={baht(t.issuedValue)} />
              <Tile label="ใช้แล้ว" value={`${num(t.used)} ใบ`} sub={`${pct}% ของที่ออก · ${baht(t.usedValue)}`} />
              <Tile label="ยังใช้ได้ (สต็อกคงเหลือ)" value={`${num(t.active)} ใบ`} sub={baht(t.activeValue)} />
              <Tile label="ใกล้หมดอายุ (30 วัน)" value={`${num(t.expiringSoon)} ใบ`} sub={baht(t.expiringSoonValue)} />
              <Tile label="หมดอายุโดยไม่ถูกใช้" value={`${num(t.expired)} ใบ`} sub={baht(t.expiredValue)} />
              <Tile label="ยกเลิก" value={`${num(t.cancelled)} ใบ`} />
            </div>
            <div className="card" style={{ padding: 12, marginTop: 8 }}>
              <StatusBar item={t} />
            </div>
          </section>

          <section>
            <h3 style={{ fontSize: 14, margin: "0 0 8px" }}>ตัดในช่วง {formatThaiDate(data.from)} – {formatThaiDate(data.to)}: {num(rangeTotal)} ใบ · {baht(rangeValue)}</h3>
            <div className="card" style={{ padding: 12, display: "grid", gap: 14 }}>
              <div>
                <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 4 }}>รายวัน (ใบที่ตัด)</div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 90 }} role="img" aria-label={`ตัดรวม ${num(rangeTotal)} ใบ สูงสุด ${num(maxDay)} ใบต่อวัน`}>
                  {data.days.map((d) => (
                    <div key={d.date} title={`${formatThaiDate(d.date)}: ${num(d.count)} ใบ · ${baht(d.value)}`}
                      style={{ flex: 1, minWidth: 2, height: `${d.count > 0 ? Math.max((d.count / maxDay) * 100, 4) : 0}%`, background: "var(--accent)", borderRadius: "3px 3px 0 0" }} />
                  ))}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text3)", marginTop: 2, gap: 8, flexWrap: "wrap" }}>
                  <span>{formatThaiDate(data.days[0]?.date)}</span>
                  <span>สูงสุด {num(maxDay)} ใบ/วัน</span>
                  <span>{formatThaiDate(data.days[data.days.length - 1]?.date)}</span>
                </div>
                <details style={{ marginTop: 6, fontSize: 12 }}>
                  <summary style={{ cursor: "pointer" }}>ดูเป็นตัวเลขรายวัน</summary>
                  <div style={{ display: "grid", gap: 2, marginTop: 4 }}>
                    {data.days.filter((d) => d.count > 0).map((d) => <div key={d.date}>{formatThaiDate(d.date)} · {num(d.count)} ใบ · {baht(d.value)}</div>)}
                    {rangeTotal === 0 && <div style={{ color: "var(--text3)" }}>ไม่มีการตัดในช่วงนี้</div>}
                  </div>
                </details>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 6 }}>ตามสาขา</div>
                <div style={{ display: "grid", gap: 8 }}>
                  {data.branches.map((b) => (
                    <div key={b.branchName} title={`${b.branchName}: ${num(b.count)} ใบ · ${baht(b.value)}`}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13 }}>
                        <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{b.branchName}</span>
                        <span style={{ whiteSpace: "nowrap" }}>{num(b.count)} ใบ · {baht(b.value)}</span>
                      </div>
                      <div style={{ height: 8, background: "var(--surface2)", borderRadius: 4 }}>
                        <div style={{ width: `${(b.count / maxBranch) * 100}%`, height: 8, background: "var(--accent)", borderRadius: 4 }} />
                      </div>
                    </div>
                  ))}
                  {data.branches.length === 0 && <div style={{ fontSize: 13, color: "var(--text3)" }}>ไม่มีการตัดในช่วงนี้</div>}
                </div>
              </div>
            </div>
          </section>

          <section>
            <h3 style={{ fontSize: 14, margin: "0 0 8px" }}>สต็อกต่อโปร (ออก / ใช้แล้ว / ใช้ได้ / หมดอายุ / ยกเลิก)</h3>
            <div style={{ display: "grid", gap: 8 }}>
              {data.products.map((p) => (
                <div key={`${p.prefix}|${p.name}|${p.price}`} className="card" style={{ padding: 12, display: "grid", gap: 6 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <strong style={{ overflowWrap: "anywhere" }}>{p.name}</strong>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 12, padding: "1px 6px", borderRadius: 6, background: "var(--surface2)" }}>{p.prefix}</span>
                    <span style={{ fontWeight: 700 }}>{baht(p.price)}</span>
                    <span style={{ fontSize: 12, color: "var(--text3)" }}>ออก {num(p.issued)} ใบ</span>
                  </div>
                  <StatusBar item={p} />
                </div>
              ))}
              {data.products.length === 0 && <div style={{ fontSize: 13, color: "var(--text3)" }}>ยังไม่มีคูปอง</div>}
            </div>
          </section>

          <section>
            <h3 style={{ fontSize: 14, margin: "0 0 8px" }}>ใกล้หมดอายุภายใน 30 วัน (ยังไม่ถูกใช้)</h3>
            <div style={{ display: "grid", gap: 6 }}>
              {data.expiring.map((e) => {
                const left = Math.round((new Date(`${e.expiryDate}T00:00:00Z`) - new Date(`${data.today}T00:00:00Z`)) / 86400000);
                return (
                  <div key={`${e.prefix}|${e.name}|${e.price}|${e.expiryDate}`} className="card" style={{ padding: "8px 12px", display: "flex", gap: 8, justifyContent: "space-between", flexWrap: "wrap", fontSize: 13 }}>
                    <span style={{ minWidth: 0, overflowWrap: "anywhere" }}><b>{e.name}</b> <span style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{e.prefix}</span> · {baht(e.price)}</span>
                    <span>{num(e.count)} ใบ · หมดอายุ {formatThaiDate(e.expiryDate)} ({left <= 0 ? "วันนี้" : `อีก ${left} วัน`})</span>
                  </div>
                );
              })}
              {data.expiring.length === 0 && <div style={{ fontSize: 13, color: "var(--text3)" }}>ไม่มีคูปองที่ใกล้หมดอายุ</div>}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

// ทั้งหน้านี้ไม่เก็บอะไรใน state ของ App.jsx — ค้นเป็นรายใบ/แบ่งหน้าจากเซิร์ฟเวอร์เท่านั้น
export default function CouponPage({ branches, currentUser, onToast }) {
  const role = currentUser?.role;
  const canManage = ["superadmin", "head_admin"].includes(role);
  const canRevert = ["superadmin", "head_admin", "admin", "branch_manager"].includes(role);
  const canStats = ["superadmin", "head_admin", "admin"].includes(role);
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
  const [pending, setPending] = useState(null); // การกระทำที่รอพิมพ์เลข 3 ตัวท้ายยืนยัน
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

  const last3 = (code) => String(code).slice(-3);
  const askDigits = (cfg) => setPending({ ...cfg, id: Date.now() });
  async function confirmPending() {
    const p = pending;
    setPending(null);
    if (p) await p.onConfirm();
  }

  function handleRedeem() {
    if (!found || !branchId) return;
    const branchName = branches.find((b) => String(b.id) === String(branchId))?.name || branchId;
    askDigits({
      title: "ยืนยันตัดคูปอง", code: found.code, expect: last3(found.code), label: "ตัดคูปอง",
      lines: [found.name, `สาขาที่ตัด: ${branchName}`, "ตัด = ลูกค้านำคูปองใบนี้มาใช้จริง ระบบบันทึกประวัติการใช้ (ถ้าตัดผิดใช้ปุ่ม “ย้อน”)"],
      onConfirm: doRedeem,
    });
  }

  async function doRedeem() {
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

  function handleCancel(c, cancel) {
    if (!cancel) { doCancel(c, false); return; }
    askDigits({
      title: "ยืนยันยกเลิกคูปอง", code: c.code, expect: last3(c.code), label: "ยกเลิกคูปอง", danger: true,
      lines: [c.name, "ยกเลิก = คูปองใบนี้ใช้ไม่ได้อีก (ออกผิด / คืนเงิน / คูปองหาย) ไม่ใช่การใช้ ไม่มีประวัติการใช้ กู้คืนได้ภายหลัง"],
      onConfirm: () => doCancel(c, true),
    });
  }

  async function doCancel(c, cancel) {
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
  function handleCancelBatch(x, cancel) {
    const range = `${x.firstCode} – ${x.lastCode}`;
    if (!cancel) {
      if (window.confirm(`กู้คืนล็อต ${range} ?\nคืนเฉพาะใบที่ล็อตนี้ยกเลิกเอง ใบที่ถูกยกเลิกรายใบมาก่อนไม่ถูกกู้คืน`)) doCancelBatch(x, false);
      return;
    }
    askDigits({
      title: "ยืนยันยกเลิกทั้งล็อต", code: x.lastCode, codeLabel: "รหัสสุดท้ายของล็อต", expect: last3(x.lastCode), label: "ยกเลิกทั้งล็อต", danger: true,
      lines: [`${range} (${x.quantity.toLocaleString()} ใบ)`, "ยกเลิกทั้งล็อต = ปิดทุกใบที่ยังไม่เคยถูกใช้ (ใช้เมื่อออกล็อตผิด) ใบที่ถูกใช้ไปแล้วไม่ถูกแตะ กู้คืนได้ภายหลัง"],
      onConfirm: () => doCancelBatch(x, true),
    });
  }

  async function doCancelBatch(x, cancel) {
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

  const tabs = [["redeem", "🎟️ ตัดคูปอง"], ["list", "📋 รายการ"], ["batches", "📦 ล็อต/ช่วงรหัส"], ...(canStats ? [["stats", "📊 สถิติ"]] : []), ...(canManage ? [["generate", "➕ ออกคูปอง"]] : [])];
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
                  <div style={{ fontSize: 12, color: "var(--text3)" }}>ตัด = ลูกค้านำคูปองมาใช้จริง (บันทึกประวัติ) · ตัดผิดกด “ย้อน” ในประวัติการใช้ด้านล่าง</div>
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
                <div style={{ fontSize: 12, color: "var(--text3)" }}>ยกเลิก = คูปองใบนี้ใช้ไม่ได้อีก (ออกผิด / คืนเงิน / คูปองหาย) ไม่ใช่การใช้ · กู้คืนได้</div>
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
            <input className="input" style={{ flex: "1 1 220px", minWidth: 0 }} placeholder="ค้นหา รหัส / ชื่อโปร / ลูกค้า / เบอร์" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
            <select className="input" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }}>
              <option value="all">ทุกสถานะ</option>
              {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <span style={{ alignSelf: "center", fontSize: 12, color: "var(--text3)" }}>{loading ? "กำลังโหลด…" : `${list.total.toLocaleString()} ใบ`}</span>
          </div>
          {/* การ์ดต่อคูปองแทนตาราง: ไหลตามความกว้างจอ ไม่ต้องเลื่อนซ้ายขวาที่ขนาดไหนเลย */}
          <div style={{ display: "grid", gap: 8 }}>
            {list.coupons.map((c) => (
              <div key={c.id} className="card" style={{ padding: "10px 12px", display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                <div style={{ minWidth: 0, flex: "1 1 200px" }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontFamily: "var(--mono)", fontWeight: 700 }}>{c.code}</span>
                    <StatusBadge status={c.status} />
                  </div>
                  <div style={{ fontSize: 13, overflowWrap: "anywhere" }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: "var(--text3)" }}>
                    หมดอายุ {formatThaiDate(c.expiryDate)}
                    {(c.customerName || c.customerPhone) && ` · ${c.customerName || ""} ${c.customerPhone || ""}`}
                  </div>
                </div>
                <button className="btn btn-sm btn-secondary" onClick={() => { setCode(c.code); setFound(c); setTab("redeem"); }}>เปิด</button>
              </div>
            ))}
            {!loading && list.coupons.length === 0 && <div style={{ textAlign: "center", color: "var(--text3)", padding: 16 }}>ไม่พบคูปอง</div>}
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 12, alignItems: "center" }}>
            <button className="btn btn-sm btn-secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>‹</button>
            <span style={{ fontSize: 12 }}>หน้า {page + 1}/{totalPages}</span>
            <button className="btn btn-sm btn-secondary" disabled={page + 1 >= totalPages} onClick={() => setPage(page + 1)}>›</button>
          </div>
        </div>
      )}

      {tab === "stats" && canStats && <StatsView token={token} onToast={onToast} />}

      {tab === "batches" && (
        <div style={{ display: "grid", gap: 10 }}>
          {canManage && <p style={{ fontSize: 12, color: "var(--text3)", margin: 0 }}>ออกล็อตผิดกาง (▸) โปรแล้วกด “ยกเลิกทั้งล็อต” = ปิดทุกใบที่ยังไม่เคยถูกใช้ (ใบที่ตัดไปแล้วไม่ถูกแตะ) กู้คืนได้ · ต้องพิมพ์เลข 3 ตัวท้ายของรหัสสุดท้ายในล็อตเพื่อยืนยัน</p>}
          {/* การ์ดต่อโปรแทนตาราง: ไหลตามความกว้างจอ ไม่ต้องเลื่อนซ้ายขวา */}
          {groups.map((g) => {
            const b = g.latest;
            const open = openGroups.has(g.key);
            return (
              <div key={g.key} className="card" style={{ padding: 12 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <button className="btn btn-sm btn-secondary" aria-expanded={open} title={open ? "หุบ" : "กางดูช่วงรหัสของแต่ละล็อต"} onClick={() => toggleGroup(g.key)}>{open ? "▾" : "▸"}</button>
                  <strong style={{ overflowWrap: "anywhere" }}>{g.name}</strong>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 12, padding: "1px 6px", borderRadius: 6, background: "var(--surface2)" }}>{g.prefix}</span>
                  <span style={{ fontWeight: 700 }}>฿{Number(g.price).toLocaleString()}</span>
                </div>
                <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 4 }}>
                  {g.batches.length} ล็อต · {g.total.toLocaleString()} ใบ · เลขล่าสุด <span style={{ fontFamily: "var(--mono)" }}>{b.lastCode}</span>
                </div>
                {canManage && (
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
                    <input className="input" type="number" min="1" max="20000" placeholder="เพิ่มกี่ใบ" style={{ width: 100 }} value={addQty[b.id] ?? ""} onChange={(e) => setAddQty({ ...addQty, [b.id]: e.target.value })} />
                    <input className="input" type="date" style={{ width: 150 }} value={addExpiry[b.id] ?? String(b.expiryDate).slice(0, 10)} onChange={(e) => setAddExpiry({ ...addExpiry, [b.id]: e.target.value })} title="วันหมดอายุของล็อตใหม่" />
                    <button className="btn btn-sm btn-primary" disabled={isSaving || !addQty[b.id]} onClick={() => handleAddMore(b)}>เพิ่ม</button>
                    <span style={{ fontSize: 11, color: "var(--text3)" }}>ออกต่อจากเลขล่าสุด</span>
                  </div>
                )}
                {open && (
                  <div style={{ marginTop: 10, borderTop: "1px solid var(--border)" }}>
                    {g.batches.map((x) => (
                      <div key={x.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: 12, display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                        <div style={{ minWidth: 0, flex: "1 1 220px", opacity: x.cancelledAt ? 0.55 : 1 }}>
                          <div style={{ fontFamily: "var(--mono)", fontWeight: 700, textDecoration: x.cancelledAt ? "line-through" : "none", overflowWrap: "anywhere" }}>{x.firstCode} – {x.lastCode}</div>
                          <div style={{ color: "var(--text3)" }}>
                            {`${x.quantity.toLocaleString()} ใบ · หมดอายุ ${formatThaiDate(x.expiryDate)} · ออกเมื่อ ${new Date(x.createdAt).toLocaleDateString("th-TH")}`}
                            {x.cancelledAt && <b style={{ color: "#dc2626" }}>{` · ยกเลิกทั้งล็อตเมื่อ ${new Date(x.cancelledAt).toLocaleDateString("th-TH")}`}</b>}
                          </div>
                        </div>
                        {canManage && (
                          <button className="btn btn-sm btn-secondary" disabled={isSaving} onClick={() => handleCancelBatch(x, !x.cancelledAt)}>
                            {x.cancelledAt ? "กู้คืนล็อต" : "ยกเลิกทั้งล็อต"}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {groups.length === 0 && <div style={{ textAlign: "center", color: "var(--text3)", padding: 16 }}>ยังไม่มีล็อต</div>}
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
      {pending && <DigitConfirm key={pending.id} pending={pending} busy={isSaving} onClose={() => setPending(null)} onConfirm={confirmPending} />}
    </div>
  );
}
