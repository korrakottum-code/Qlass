import { useState, useEffect, useCallback, useRef } from "react";
import { formatThaiDate } from "../utils/helpers";
import { addDays as shiftDay } from "../utils/queueRanges"; // ย้ายวันที่ด้วยตัวช่วยของโปรเจกต์ (ห้ามตัดวันจาก toISOString)
import { useSubmissionLock } from "../hooks/useSubmissionLock";
import { getServerSessionToken, couponsAvailable, lookupCoupon, listCoupons, listCouponBatches, redeemCoupon, revertCouponRedemption, cancelCoupon, generateCoupons, fetchCouponCounters, cancelCouponBatch, updateCouponBatch, deleteCouponBatch, fetchCouponAudit, fetchCouponStats, fetchCouponCategories, saveCouponCategory } from "../utils/couponApi";
import { serverErrorCode } from "../utils/sessionApi";
import Modal, { ModalHeader, ModalBody } from "../components/Modal";

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
  batch_has_used: "ล็อตนี้มีคูปองที่ถูกตัดใช้อยู่ จึงแก้/ลบทั้งล็อตไม่ได้ (ถ้าตัดผิดให้ย้อนการตัดก่อน แล้วลองใหม่)",
  batch_not_latest: "ลบได้เฉพาะล็อตท้ายสุดของหมวดนั้น (มีล็อตใหม่กว่าอยู่แล้ว) ถ้าผิดให้ใช้ “ยกเลิกทั้งล็อต” แทน",
  invalid_range: "ช่วงวันที่ไม่ถูกต้อง (ต้องไม่เกิน 366 วัน และวันเริ่มต้องไม่หลังวันสิ้นสุด)",
  invalid_start: "เลขที่ให้ออกต่อต้องอยู่ระหว่าง 0–9,999,999",
  invalid_expiry: "วันหมดอายุต้องไม่ใช่วันที่ผ่านมาแล้ว",
  invalid_price: "ราคาไม่ถูกต้อง",
  invalid_name: "กรุณาใส่ชื่อคูปอง/โปร",
  invalid_prefix: "กรุณาเลือกหมวดรหัส",
  category_exists: "มีหมวดรหัสนี้อยู่แล้ว",
  category_not_found: "ไม่พบหมวดรหัสนี้",
  category_inactive: "หมวดนี้ปิดใช้งานอยู่ — เปิดที่แท็บ “หมวดรหัส” ก่อนถึงจะออกล็อตได้",
  invalid_category: "รหัสหมวดต้องเป็นตัวอักษรใหญ่ 1–3 ตัวตามด้วยตัวเลข 1–3 หลัก (เช่น D11) และชื่อ 1–80 ตัวอักษร",
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

// เดือนเป็นข้อความ "YYYY-MM" คำนวณด้วยเวลาเครื่อง (ไม่ผ่าน toISOString)
const addMonth = (ym, n) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
// ทั้งเดือน (เดือนปัจจุบันนับถึงวันนี้ ไม่ล้ำไปอนาคต)
const monthRange = (ym, today) => {
  const [y, m] = ym.split("-").map(Number);
  const end = `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
  return { from: `${ym}-01`, to: end > today ? today : end };
};
const monthLabel = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("th-TH", { month: "long", year: "numeric" });
};

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

function StatsView({ token, onToast, labelOf }) {
  const [range, setRange] = useState({ from: "", to: "" });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  // กดลูกศรเปลี่ยนเดือนรัว ๆ ผลของคำขอเก่าอาจกลับมาช้ากว่า → ยอมรับเฉพาะคำขอล่าสุด ไม่งั้นป้ายเดือนกับตัวเลขไม่ตรงกัน
  const reqId = useRef(0);
  const load = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    try {
      const d = await fetchCouponStats(token, { from: range.from || null, to: range.to || null });
      if (id === reqId.current) setData(d);
    } catch (e) {
      if (id === reqId.current) onToast?.("error", await explain(e));
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [token, range, onToast]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const preset = (days) => data && setRange({ from: shiftDay(data.today, -(days - 1)), to: data.today });
  // ลูกศรเปลี่ยนเดือน: อิงเดือนของวันสิ้นสุดที่กำลังดูอยู่ (ช่วง 30 วันที่คร่อมสองเดือน → ‹ ไปเดือนก่อนของวันสิ้นสุด)
  const thisMonth = data ? data.today.slice(0, 7) : "";
  const anchor = (range.to || data?.to || "").slice(0, 7);
  const gotoMonth = (ym) => data && setRange(monthRange(ym, data.today));
  const viewFrom = range.from || data?.from || "";
  const viewTo = range.to || data?.to || "";
  const isMonthView = !!data && anchor !== "" && viewFrom === monthRange(anchor, data.today).from && viewTo === monthRange(anchor, data.today).to;

  const t = data?.totals;
  const pct = t && t.issued ? Math.round((t.used / t.issued) * 100) : 0;
  const maxBranch = Math.max(1, ...(data?.branches || []).map((b) => b.count));
  const maxDay = Math.max(1, ...(data?.days || []).map((d) => d.count));
  const rangeTotal = (data?.days || []).reduce((a, d) => a + d.count, 0);
  const rangeValue = (data?.days || []).reduce((a, d) => a + Number(d.value), 0);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button className="btn btn-sm btn-secondary" aria-label="เดือนก่อนหน้า" onClick={() => gotoMonth(addMonth(anchor, -1))} disabled={!data}>‹</button>
        <span style={{ minWidth: 130, textAlign: "center", fontWeight: 700, fontSize: 14, color: isMonthView ? "inherit" : "var(--text3)" }} aria-live="polite">
          {isMonthView ? monthLabel(anchor) : "กำหนดช่วงเอง"}
        </span>
        <button className="btn btn-sm btn-secondary" aria-label="เดือนถัดไป" onClick={() => gotoMonth(addMonth(anchor, 1))} disabled={!data || anchor >= thisMonth}>›</button>
        <button className="btn btn-sm btn-secondary" onClick={() => gotoMonth(thisMonth)} disabled={!data}>เดือนนี้</button>
        <button className="btn btn-sm btn-secondary" onClick={() => gotoMonth(addMonth(thisMonth, -1))} disabled={!data}>เดือนที่แล้ว</button>
        <button className="btn btn-sm btn-secondary" onClick={() => preset(7)} disabled={!data}>7 วัน</button>
        <button className="btn btn-sm btn-secondary" onClick={() => preset(30)} disabled={!data}>30 วัน</button>
        {loading && <span style={{ fontSize: 12, color: "var(--text3)" }}>กำลังโหลด…</span>}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ fontSize: 12 }}>ตั้งแต่
          <input className="input" type="date" value={range.from || data?.from || ""} onChange={(e) => setRange({ ...range, from: e.target.value })} />
        </label>
        <label style={{ fontSize: 12 }}>ถึง
          <input className="input" type="date" value={range.to || data?.to || ""} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        </label>
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
                    {labelOf?.(p.prefix) && <span style={{ fontSize: 12, color: "var(--text3)" }}>{labelOf(p.prefix)}</span>}
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

// ─── จัดการหมวดรหัส POS ───
function CategoryRow({ c, onSave, busy }) {
  const [label, setLabel] = useState(c.label);
  const [active, setActive] = useState(c.active);
  const dirty = label.trim() !== c.label || active !== c.active;
  async function save() {
    if (c.active && !active && !window.confirm(`ปิดหมวด ${c.prefix}?\nออกล็อตใหม่ในหมวดนี้ไม่ได้ (คูปองเดิมยังเห็นและใช้ได้ตามปกติ) เปิดกลับได้ภายหลัง`)) return;
    await onSave({ prefix: c.prefix, label: label.trim(), active, create: false });
  }
  return (
    <div className="card" style={{ padding: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", opacity: c.active ? 1 : 0.65 }}>
      <span style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 13, padding: "1px 8px", borderRadius: 6, background: "var(--surface2)", minWidth: 44, textAlign: "center" }}>{c.prefix}</span>
      <input className="input" style={{ flex: "1 1 200px", minWidth: 0 }} value={label} maxLength={80} aria-label={`ชื่อหมวด ${c.prefix}`} onChange={(e) => setLabel(e.target.value)} />
      {/* ส่วนท้ายแถวรวมเป็นกลุ่มเดียว ตัดบรรทัดทั้งกลุ่มเมื่อจอแคบ (ไม่หักทีละคำ) */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", whiteSpace: "nowrap" }}>
        <label style={{ fontSize: 12, display: "inline-flex", gap: 4, alignItems: "center" }}>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> เปิดใช้งาน
        </label>
        <span style={{ fontSize: 11, color: "var(--text3)" }}>{c.issued > 0 ? `ออกถึงเลข ${num(c.issued)}` : "ยังไม่เคยออก"}</span>
        <button className="btn btn-sm btn-primary" disabled={busy || !dirty || !label.trim()} onClick={save}>บันทึก</button>
      </div>
    </div>
  );
}

// ประวัติการทำรายการ: ใครทำอะไรเมื่อไร (ออก/ยกเลิก/กู้คืน/แก้/ลบล็อต, จัดการหมวด, ตัดใช้/ย้อน) เรียงใหม่→เก่า แบ่งหน้าที่เซิร์ฟเวอร์
const AUDIT_LABELS = {
  generate: "ออกล็อต", coupon_cancel: "ยกเลิกคูปอง", coupon_restore: "กู้คืนคูปอง", batch_cancel: "ยกเลิกทั้งล็อต", batch_restore: "กู้คืนล็อต",
  batch_update: "แก้ข้อมูลล็อต", batch_delete: "ลบล็อต", category_create: "เพิ่มหมวดรหัส", category_update: "แก้หมวดรหัส", redeem: "ตัดคูปอง", revert: "ย้อนการตัด",
};
const AUDIT_TONE = { batch_delete: "#dc2626", batch_cancel: "#dc2626", coupon_cancel: "#dc2626", revert: "#d97706", batch_update: "#2563eb" };
function auditSummary(e) {
  const d = e.detail || {};
  const range = d.firstCode ? `${d.firstCode} – ${d.lastCode}` : e.target;
  switch (e.action) {
    case "generate": return [e.target, `${num(d.count)} ใบ`, d.name, d.price != null ? baht(d.price) : null];
    case "batch_cancel": case "batch_restore": return [range, d.name, d.changed != null ? `${num(d.changed)} ใบ` : null];
    case "batch_update": return [range, d.after?.name && d.before?.name !== d.after.name ? `${d.before?.name} → ${d.after.name}` : d.after?.name,
      d.after?.price != null && Number(d.before?.price) !== Number(d.after.price) ? `${baht(d.before?.price)} → ${baht(d.after.price)}` : null];
    case "batch_delete": return [range, d.name, `${num(d.deleted)} ใบ`, d.cancelled ? "(ยกเลิกไว้แล้ว)" : null];
    case "redeem": case "revert": return [e.target, d.name, d.branchName];
    case "category_create": case "category_update": return [e.target, d.label, d.active === false ? "ปิดใช้งาน" : null];
    default: return [e.target, d.name];
  }
}
function AuditView({ token, onToast }) {
  const [filter, setFilter] = useState("");
  const [events, setEvents] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const reqId = useRef(0); // ยอมรับเฉพาะผลของคำขอล่าสุด (เปลี่ยนตัวกรองรัว ๆ)
  const load = useCallback(async (offset) => {
    const id = ++reqId.current;
    setLoading(true);
    try {
      const d = await fetchCouponAudit(token, { action: filter || null, limit: 50, offset });
      if (id !== reqId.current) return;
      setEvents((prev) => (offset === 0 ? d.events : [...prev, ...d.events]));
      setHasMore(!!d.hasMore);
    } catch (e) {
      if (id === reqId.current) onToast?.("error", await explain(e));
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [token, filter, onToast]);
  useEffect(() => {
    const t = setTimeout(() => load(0), 0);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <select className="input" style={{ width: 200, maxWidth: "100%" }} value={filter} onChange={(e) => { setEvents([]); setFilter(e.target.value); }} aria-label="กรองประเภทรายการ">
          <option value="">ทุกประเภท</option>
          {Object.entries(AUDIT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="btn btn-sm btn-secondary" disabled={loading} onClick={() => load(0)}>{loading ? "กำลังโหลด…" : "รีเฟรช"}</button>
        <span style={{ fontSize: 12, color: "var(--text3)" }}>ใครทำอะไรเมื่อไร (ใหม่ → เก่า)</span>
      </div>
      {events.map((e, i) => (
        <div key={`${e.at}-${e.action}-${i}`} className="card" style={{ padding: "8px 12px" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
            <strong style={{ color: AUDIT_TONE[e.action] || "inherit" }}>{AUDIT_LABELS[e.action] || e.action}</strong>
            <span style={{ fontSize: 12, color: "var(--text3)" }}>{new Date(e.at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}</span>
            <span style={{ fontSize: 12, marginLeft: "auto" }}>โดย {e.actor || "—"}</span>
          </div>
          <div style={{ fontSize: 12, color: "var(--text3)", overflowWrap: "anywhere", marginTop: 2 }}>
            {auditSummary(e).filter(Boolean).join(" · ")}
          </div>
        </div>
      ))}
      {!loading && events.length === 0 && <div style={{ textAlign: "center", color: "var(--text3)", padding: 16 }}>ยังไม่มีประวัติ</div>}
      {hasMore && <button className="btn btn-secondary" disabled={loading} onClick={() => load(events.length)}>{loading ? "กำลังโหลด…" : "โหลดเพิ่ม"}</button>}
    </div>
  );
}

function CategoriesView({ categories, onSave, busy }) {
  const [prefix, setPrefix] = useState("");
  const [label, setLabel] = useState("");
  const valid = /^[A-Z]{1,3}[0-9]{1,3}$/.test(prefix) && label.trim().length > 0;
  async function add(e) {
    e.preventDefault();
    if (await onSave({ prefix, label: label.trim(), active: true, create: true })) { setPrefix(""); setLabel(""); }
  }
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <p style={{ fontSize: 12, color: "var(--text3)", margin: 0 }}>
        หมวดรหัสที่ออกคูปองได้ (ตามคู่มือรหัส POS) · <b>ตัวรหัสเปลี่ยนไม่ได้เมื่อเพิ่มแล้ว และลบไม่ได้</b> เพราะคูปองที่ออกไปแล้วกับ POS ใช้รหัสนี้
        ถ้าต้องเปลี่ยน ให้ปิดหมวดเก่า แล้วเพิ่มหมวดใหม่ · ปิดหมวด = ออกล็อตใหม่ไม่ได้ (คูปองเดิมยังเห็นและใช้ได้) เปิดกลับได้
      </p>
      <form className="card" onSubmit={add} style={{ padding: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input className="input" style={{ width: 130, fontFamily: "var(--mono)" }} placeholder="รหัส เช่น D11" value={prefix} maxLength={6}
          onChange={(e) => setPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} aria-label="รหัสหมวดใหม่" />
        <input className="input" style={{ flex: "1 1 200px", minWidth: 0 }} placeholder="ชื่อหมวดที่แสดง" value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} aria-label="ชื่อหมวดใหม่" />
        <button className="btn btn-sm btn-primary" type="submit" disabled={busy || !valid}>เพิ่มหมวด</button>
        {prefix && !/^[A-Z]{1,3}[0-9]{1,3}$/.test(prefix) && <span style={{ fontSize: 12, color: "#dc2626" }}>รูปแบบ: ตัวอักษร 1–3 ตัว + ตัวเลข 1–3 หลัก เช่น D11, T99</span>}
      </form>
      {categories.map((c) => <CategoryRow key={c.prefix} c={c} onSave={onSave} busy={busy} />)}
      {categories.length === 0 && <div style={{ textAlign: "center", color: "var(--text3)", padding: 16 }}>ยังไม่มีหมวด (หรือโหลดไม่สำเร็จ)</div>}
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
  const [gen, setGen] = useState({ name: "", category: "", price: "", quantity: 10, startAfter: "", prefix: "", expiryDate: "", customerName: "", customerPhone: "", note: "" });
  const [lastBatch, setLastBatch] = useState(null);
  const [counters, setCounters] = useState({});
  const [categories, setCategories] = useState([]); // หมวดรหัส POS (โหลดจากเซิร์ฟเวอร์ ไม่เขียนตายในโค้ด)
  const [countersOk, setCountersOk] = useState(false); // false = ยังไม่โหลด/โหลดพลาด/เก่าแล้ว → ห้ามโชว์ช่วงรหัสที่คาดเดา
  // เพิ่มจำนวนจากล็อตเดิม: จำนวนและวันหมดอายุที่กรอกในแต่ละแถว (คีย์ = id ล็อต)
  const [addQty, setAddQty] = useState({});
  const [addExpiry, setAddExpiry] = useState({});
  const [batchTick, setBatchTick] = useState(0); // เพิ่มค่าเพื่อโหลดรายการล็อตใหม่หลังยกเลิก/กู้คืน
  const [editBatch, setEditBatch] = useState(null); // ฟอร์มแก้ข้อมูลล็อตที่เปิดอยู่ {id, name, category, price, expiryDate, note}
  const [pending, setPending] = useState(null); // การกระทำที่รอพิมพ์เลข 3 ตัวท้ายยืนยัน
  const [openGroups, setOpenGroups] = useState(() => new Set()); // โปรที่กางดูช่วงรหัสของแต่ละล็อตอยู่
  const [batches, setBatches] = useState({ total: 0, batches: [] });

  const token = getServerSessionToken();

  const listReq = useRef(0); // ยอมรับเฉพาะผลของคำขอล่าสุด
  const refreshList = useCallback(async () => {
    const id = ++listReq.current;
    setLoading(true);
    try {
      const d = await listCoupons(token, { search, status, limit: PAGE_SIZE, offset: page * PAGE_SIZE });
      if (id === listReq.current) setList(d);
    } catch (e) {
      if (id === listReq.current) onToast?.("error", await explain(e));
    } finally {
      if (id === listReq.current) setLoading(false);
    }
  }, [token, search, status, page, onToast]);

  useEffect(() => {
    if (tab !== "list") return undefined;
    const t = setTimeout(refreshList, 250); // หน่วงเล็กน้อยตอนพิมพ์ค้นหา
    return () => clearTimeout(t);
  }, [tab, refreshList]);

  // เลขล่าสุดของแต่ละหมวด ใช้โชว์ตัวอย่างช่วงรหัสก่อนกดออกล็อต (โหลดใหม่ทุกครั้งที่เปิดแท็บ/ออกล็อตเสร็จ)
  useEffect(() => {
    let alive = true;
    fetchCouponCategories(token).then((c) => { if (alive) setCategories(c); }).catch(() => {});
    return () => { alive = false; };
  }, [token]);

  useEffect(() => {
    if ((tab !== "generate" && tab !== "batches") || !canManage) return undefined;
    let alive = true;
    fetchCouponCounters(token)
      .then((c) => { if (alive) { setCounters(c); setCountersOk(true); } })
      .catch(() => { if (alive) setCountersOk(false); });
    return () => { alive = false; };
  }, [tab, canManage, token, lastBatch]);

  useEffect(() => {
    if (tab !== "batches") return undefined;
    let alive = true;
    listCouponBatches(token)
      .then((d) => { if (alive) setBatches(d); })
      .catch(async (e) => { if (alive) onToast?.("error", await explain(e)); });
    return () => { alive = false; };
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

  // ทุกการกระทำที่แก้ข้อมูล: กันกดซ้ำ (useSubmissionLock) + แปลง error เป็นข้อความไทย + คืน null เมื่อพลาด
  const call = (fn) => run(async () => {
    try {
      return await fn();
    } catch (err) {
      onToast?.("error", await explain(err));
      return null;
    }
  });

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
    const r = await call(() => redeemCoupon(token, { code: found.code, branchId, note }));
    if (r.started && r.result) {
      setFound(r.result);
      setNote("");
      onToast?.("success", "ตัดคูปองแล้ว");
    }
  }

  async function handleRevert(redemptionId) {
    if (!window.confirm("ย้อนการตัดครั้งนี้? คูปองจะกลับมาใช้ได้อีกครั้ง")) return;
    const r = await call(() => revertCouponRedemption(token, redemptionId));
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
    const r = await call(() => cancelCoupon(token, c.code, cancel));
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
    if (!countersOk) { onToast?.("error", "ยังโหลดเลขล่าสุดของหมวดไม่เสร็จ ลองอีกครั้งในสักครู่"); return; }
    const last = counters[b.prefix] || 0;
    const range = `${b.prefix}-${String(last + 1).padStart(7, "0")} – ${b.prefix}-${String(last + qty).padStart(7, "0")}`;
    if (!window.confirm(`เพิ่ม ${qty.toLocaleString()} ใบ\n${b.name} · ฿${Number(b.price).toLocaleString()} · หมดอายุ ${formatThaiDate(expiry)}\nรหัสที่จะได้: ${range}\n\nยืนยันออกคูปอง?`)) return;
    const r = await call(() => generateCoupons(token, {
          name: b.name, category: b.category || "", price: Number(b.price), prefix: b.prefix,
          quantity: qty, expiryDate: expiry, note: b.note || "",
        }));
    if (r.started && r.result) {
      setLastBatch(r.result); // ทำให้รายการล็อตและเลขล่าสุดโหลดใหม่
      setCountersOk(false);
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
    const r = await call(() => cancelCouponBatch(token, x.id, cancel));
    if (r.started && r.result) {
      setBatchTick((n) => n + 1);
      onToast?.("success", cancel
        ? `ยกเลิกแล้ว ${r.result.changed.toLocaleString()} ใบ${r.result.usedKept ? ` (ใช้ไปแล้ว ${r.result.usedKept.toLocaleString()} ใบ คงเดิม)` : ""}`
        : `กู้คืนแล้ว ${r.result.changed.toLocaleString()} ใบ`);
    }
  }

  // แก้ข้อมูลทั้งล็อต (คีย์ผิด): รหัสไม่เปลี่ยน ทำได้เฉพาะล็อตที่ยังไม่มีใบไหนถูกใช้ (เซิร์ฟเวอร์เป็นคนตัดสิน)
  async function saveBatchEdit() {
    const e = editBatch;
    if (!e || !e.name.trim()) { onToast?.("error", ERRORS.invalid_name); return; }
    const r = await call(() => updateCouponBatch(token, e.id, { name: e.name.trim(), category: e.category, price: Number(e.price), expiryDate: e.expiryDate, note: e.note }));
    if (r.started && r.result) {
      setEditBatch(null);
      setBatchTick((n) => n + 1);
      onToast?.("success", `แก้ข้อมูลแล้ว ${r.result.changed.toLocaleString()} ใบ`);
    }
  }

  // ลบล็อตที่ออกผิดทิ้งถาวร (ล็อตท้ายสุดของหมวด ที่ยังไม่เคยถูกใช้) เลขรันถอยกลับให้ออกใหม่ได้เลขเดิม
  function handleDeleteBatch(x) {
    askDigits({
      title: "ยืนยันลบล็อตทิ้ง", code: x.lastCode, codeLabel: "รหัสสุดท้ายของล็อต", expect: last3(x.lastCode), label: "ลบล็อตทิ้ง", danger: true,
      lines: [`${x.firstCode} – ${x.lastCode} (${x.quantity.toLocaleString()} ใบ)`, `ลบถาวร กู้คืนไม่ได้ เลขรันถอยกลับ ล็อตใหม่ในหมวดนี้จะเริ่มที่ ${x.firstCode} ใหม่ — ลบเฉพาะล็อตที่ยังไม่ได้แจก/ส่งรหัสให้ใคร`],
      onConfirm: async () => {
        const r = await call(() => deleteCouponBatch(token, x.id));
        if (r.started && r.result) {
          setEditBatch(null);
          setBatchTick((n) => n + 1);
          setCountersOk(false);
          onToast?.("success", `ลบแล้ว ${r.result.deleted.toLocaleString()} ใบ · ล็อตถัดไปเริ่มที่ ${r.result.nextCode}`);
        }
      },
    });
  }

  // เพิ่ม/แก้ชื่อ/เปิด-ปิดหมวดรหัส: ตอบกลับเป็นรายการหมวดล่าสุด (เซิร์ฟเวอร์คือความจริง)
  async function saveCategory(category) {
    const r = await call(() => saveCouponCategory(token, category));
    if (r.started && r.result) {
      setCategories(r.result);
      onToast?.("success", category.create ? `เพิ่มหมวด ${category.prefix} แล้ว` : "บันทึกหมวดแล้ว");
      return true;
    }
    return false;
  }

  async function handleGenerate(e) {
    e.preventDefault();
    const r = await call(() => generateCoupons(token, {
          ...gen,
          price: Number(gen.price || 0),
          quantity: Number(gen.quantity),
          startAfter: gen.startAfter === "" ? null : Number(gen.startAfter),
        }));
    if (r.started && r.result) {
      setLastBatch(r.result);
      setCountersOk(false);
      setGen((g) => ({ ...g, startAfter: "" })); // ใช้ครั้งเดียว: ตัวนับเดินต่อเองแล้ว
      onToast?.("success", `ออกคูปอง ${r.result.count} ใบแล้ว`);
    }
  }

  if (!couponsAvailable) {
    return <div className="card" style={{ padding: 24 }}>ระบบคูปองต้องเปิดโหมดเซสชันฝั่งเซิร์ฟเวอร์ (VITE_USE_SERVER_SESSION=true)</div>;
  }

  const tabs = [["redeem", "🎟️ ตัดคูปอง"], ["list", "📋 รายการ"], ["batches", "📦 ล็อต/ช่วงรหัส"], ...(canStats ? [["stats", "📊 สถิติ"], ["audit", "🧾 ประวัติ"]] : []), ...(canManage ? [["generate", "➕ ออกคูปอง"], ["categories", "🏷️ หมวดรหัส"]] : [])];
  // ตัวอย่างช่วงรหัสที่จะได้ (คำนวณแบบเดียวกับที่เซิร์ฟเวอร์ทำ: ต่อจากเลขล่าสุดของหมวด หรือเลขที่ระบุ ถ้ามากกว่า)
  const pad7 = (n) => String(n).padStart(7, "0");
  const lastNo = Math.max(counters[gen.prefix] || 0, gen.startAfter === "" ? 0 : Number(gen.startAfter) || 0);
  const qtyNum = Number(gen.quantity) || 0;
  const preview = countersOk && gen.prefix && qtyNum > 0 ? { first: `${gen.prefix}-${pad7(lastNo + 1)}`, last: `${gen.prefix}-${pad7(lastNo + qtyNum)}`, over: lastNo + qtyNum > 9999999 } : null;
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
  // ล็อตท้ายสุดของแต่ละหมวด (เลขรันมากสุด) = ล็อตเดียวที่ลบแล้วเลขถอยกลับได้
  const latestOfPrefix = {};
  {
    const top = {};
    for (const b of batches.batches) {
      const n = Number(String(b.lastCode).split("-").pop());
      if (!(b.prefix in top) || n > top[b.prefix]) { top[b.prefix] = n; latestOfPrefix[b.prefix] = b.id; }
    }
  }
  const toggleGroup = (key) => setOpenGroups((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const labelOf = (prefix) => categories.find((c) => c.prefix === prefix)?.label || "";
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

      {tab === "categories" && canManage && <CategoriesView categories={categories} onSave={saveCategory} busy={isSaving} />}

      {tab === "audit" && canStats && <AuditView token={token} onToast={onToast} />}

      {tab === "stats" && canStats && <StatsView token={token} onToast={onToast} labelOf={labelOf} />}

      {tab === "batches" && (
        <div style={{ display: "grid", gap: 10 }}>
          {canManage && <p style={{ fontSize: 12, color: "var(--text3)", margin: 0 }}>ออกล็อตผิดกาง (▸) โปรแล้วเลือก: “แก้ข้อมูล” (ชื่อ/หมวด/ราคา/วันหมดอายุ รหัสไม่เปลี่ยน) · “ยกเลิกทั้งล็อต” = ปิดทุกใบที่ยังไม่เคยถูกใช้ กู้คืนได้ · “ลบล็อต” = ลบทิ้งถาวรแล้วเลขรันถอยกลับ (เฉพาะล็อตท้ายสุดของหมวดที่ยังไม่มีใบถูกใช้) ยกเลิก/ลบต้องพิมพ์เลข 3 ตัวท้ายของรหัสสุดท้ายเพื่อยืนยัน</p>}
          {/* การ์ดต่อโปรแทนตาราง: ไหลตามความกว้างจอ ไม่ต้องเลื่อนซ้ายขวา */}
          {batches.total > batches.batches.length && (
            <p style={{ fontSize: 12, color: "#b45309", margin: 0 }}>แสดง {batches.batches.length.toLocaleString()} ล็อตล่าสุดจากทั้งหมด {batches.total.toLocaleString()} ล็อต โปรที่เก่ากว่านั้นอาจไม่แสดง และยอดรวมต่อโปรอาจน้อยกว่าจริง (ดูยอดจริงที่แท็บสถิติ)</p>
          )}
          {groups.map((g) => {
            const b = g.latest;
            const open = openGroups.has(g.key);
            return (
              <div key={g.key} className="card" style={{ padding: 12 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <button className="btn btn-sm btn-secondary" aria-expanded={open} title={open ? "หุบ" : "กางดูช่วงรหัสของแต่ละล็อต"} onClick={() => toggleGroup(g.key)}>{open ? "▾" : "▸"}</button>
                  <strong style={{ overflowWrap: "anywhere" }}>{g.name}</strong>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 12, padding: "1px 6px", borderRadius: 6, background: "var(--surface2)" }}>{g.prefix}</span>
                  {labelOf(g.prefix) && <span style={{ fontSize: 12, color: "var(--text3)" }}>{labelOf(g.prefix)}</span>}
                  <span style={{ fontWeight: 700 }}>฿{Number(g.price).toLocaleString()}</span>
                </div>
                <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 4 }}>
                  {g.batches.length} ล็อต · {g.total.toLocaleString()} ใบ · เลขล่าสุด <span style={{ fontFamily: "var(--mono)" }}>{b.lastCode}</span>
                </div>
                {canManage && (
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
                    <input className="input" type="number" min="1" max="20000" placeholder="เพิ่มกี่ใบ" style={{ width: 100 }} value={addQty[b.id] ?? ""} onChange={(e) => setAddQty({ ...addQty, [b.id]: e.target.value })} />
                    <input className="input" type="date" style={{ width: 150 }} value={addExpiry[b.id] ?? String(b.expiryDate).slice(0, 10)} onChange={(e) => setAddExpiry({ ...addExpiry, [b.id]: e.target.value })} title="วันหมดอายุของล็อตใหม่" />
                    <button className="btn btn-sm btn-primary" disabled={isSaving || !addQty[b.id] || !countersOk} onClick={() => handleAddMore(b)}>เพิ่ม</button>
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
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <button className="btn btn-sm btn-secondary" disabled={isSaving} onClick={() => setEditBatch(editBatch?.id === x.id ? null : { id: x.id, name: x.name, category: x.category || "", price: String(x.price), expiryDate: String(x.expiryDate).slice(0, 10), note: x.note || "" })}>แก้ข้อมูล</button>
                            <button className="btn btn-sm btn-secondary" disabled={isSaving} onClick={() => handleCancelBatch(x, !x.cancelledAt)}>
                              {x.cancelledAt ? "กู้คืนล็อต" : "ยกเลิกทั้งล็อต"}
                            </button>
                            {latestOfPrefix[x.prefix] === x.id && (
                              <button className="btn btn-sm btn-secondary" style={{ color: "#dc2626" }} disabled={isSaving} onClick={() => handleDeleteBatch(x)}>ลบล็อต</button>
                            )}
                          </div>
                        )}
                        {canManage && editBatch?.id === x.id && (
                          <div style={{ flex: "1 1 100%", display: "grid", gap: 8, padding: 10, borderRadius: 8, background: "var(--surface2)" }}>
                            <div style={{ fontSize: 12, color: "var(--text3)" }}>แก้ข้อมูลทั้งล็อต ({x.quantity.toLocaleString()} ใบ) รหัสไม่เปลี่ยน · ใช้ได้เฉพาะล็อตที่ยังไม่มีใบไหนถูกตัดใช้</div>
                            <input className="input" placeholder="ชื่อคูปอง/โปร *" value={editBatch.name} maxLength={120} onChange={(e) => setEditBatch({ ...editBatch, name: e.target.value })} />
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <input className="input" placeholder="หมวด (ถ้ามี)" style={{ flex: "1 1 140px", minWidth: 0 }} value={editBatch.category} onChange={(e) => setEditBatch({ ...editBatch, category: e.target.value })} />
                              <input className="input" type="number" min="0" placeholder="ราคา" style={{ flex: "1 1 110px", minWidth: 0 }} value={editBatch.price} onChange={(e) => setEditBatch({ ...editBatch, price: e.target.value })} />
                              <input className="input" type="date" style={{ flex: "1 1 150px", minWidth: 0 }} value={editBatch.expiryDate} onChange={(e) => setEditBatch({ ...editBatch, expiryDate: e.target.value })} title="วันหมดอายุ" />
                            </div>
                            <input className="input" placeholder="หมายเหตุ" maxLength={200} value={editBatch.note} onChange={(e) => setEditBatch({ ...editBatch, note: e.target.value })} />
                            <div style={{ display: "flex", gap: 6 }}>
                              <button className="btn btn-sm btn-primary" disabled={isSaving} onClick={saveBatchEdit}>บันทึก</button>
                              <button className="btn btn-sm btn-secondary" disabled={isSaving} onClick={() => setEditBatch(null)}>ปิด</button>
                            </div>
                          </div>
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
            <label style={{ fontSize: 12 }}>หมวดรหัส (รหัสจะเป็น หมวด-เลขรัน 7 หลัก)
              <select className="input" value={gen.prefix} onChange={(e) => setGen({ ...gen, prefix: e.target.value })} required>
                <option value="">— เลือกหมวด —</option>
                {categories.filter((c) => c.active).map((c) => <option key={c.prefix} value={c.prefix}>{c.prefix} {c.label}</option>)}
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
