// ลูกค้าโอนแล้ว รอจองคิว — บันทึกการโอน (สลิปบังคับ) / รายชื่อ + ปุ่ม "เลือกวันที่" / ยอดรวมรายคนบันทึก
// ข้อมูลไม่อยู่ใน state ของ App.jsx (แบบเดียวกับคูปอง): ตารางปิดจากคีย์หน้าเว็บ ทุกอย่างผ่าน staff-session deposit_*
// ปุ่ม "เลือกวันที่" ส่งรายการกลับไปให้ App.jsx เปิดฟอร์มบันทึกคิวเดิม แล้วผูกคิวกลับมาหลังบันทึกสำเร็จ
import { useState, useEffect, useMemo, useRef } from "react";
import { formatThaiDate, blockToTime, getTodayStr } from "../utils/helpers";
import { useSubmissionLock } from "../hooks/useSubmissionLock";
import { pickDatePresets, daySpan } from "../utils/datePresets";
import { serverErrorCode } from "../utils/sessionApi";
import { getServerSessionToken, depositsAvailable, listDeposits, createDeposit, cancelDeposit, fetchDepositSlipUrl, fetchDepositStats } from "../utils/depositApi";
import {
  DEPOSIT_PAGE_SIZE, MAX_SLIP_BYTES, validateDepositForm, depositBookingState, canBookDeposit,
  formatBaht, formatPhone, sumDepositStats, depositCommissionForRow,
} from "../utils/deposits";
import Modal, { ModalHeader, ModalBody } from "../components/Modal";

// ช่วงด่วนของแท็บยอดรวม — ใช้ชุดเดียวกับหน้าตารางคิว/Export (utils/datePresets.js)
const STATS_PRESET_KEYS = ["today", "yesterday", "last7", "thisWeek", "lastWeek", "monthToYesterday", "thisMonth", "lastMonth", "thisQuarter", "thisYear"];

// สีใช้ธีมของแอป (ปุ่ม btn-primary/btn-secondary, ตาราง data-table, var(--green)) เหมือนหน้าอื่น — เจ้าของสั่ง ไม่ใช้ม่วง

const ERRORS = {
  invalid_name: "กรุณากรอกชื่อ-นามสกุลลูกค้า",
  invalid_phone: "เบอร์โทรต้องเป็นตัวเลข 9–10 หลัก และเป็นเบอร์จริง (ไม่ใช่ 0000000000)",
  invalid_amount: "ยอดโอนไม่ถูกต้อง",
  invalid_date: "วันที่บันทึกต้องไม่ใช่วันล่วงหน้า และย้อนได้ไม่เกิน 7 วัน",
  invalid_branch: "ไม่พบสาขาที่เลือก",
  invalid_promo: "ไม่พบโปรที่เลือก",
  invalid_slip: "ไฟล์สลิปไม่ถูกต้อง (ต้องเป็นรูป JPG/PNG/WebP ไม่เกิน 1.5 MB)",
  deposit_not_found: "ไม่พบรายการนี้",
  deposit_cancelled: "รายการนี้ถูกยกเลิกแล้ว",
  deposit_already_booked: "รายการนี้จองคิวไปแล้ว",
  queue_phone_mismatch: "เบอร์ในคิวไม่ตรงกับเบอร์ที่บันทึกการโอน จึงไม่ผูกให้",
  queue_already_linked: "คิวนี้ผูกกับรายการโอนอื่นอยู่แล้ว",
  queue_not_new: "ผูกได้เฉพาะคิวที่เพิ่งจองหลังบันทึกการโอน",
  queue_not_found: "ไม่พบคิว",
  invalid_reason: "กรุณาใส่เหตุผล (2–200 ตัวอักษร)",
  invalid_range: "ช่วงวันที่ไม่ถูกต้อง",
  forbidden: "บทบาทนี้ไม่มีสิทธิ์ทำรายการนี้",
  invalid_session: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่",
};

async function explain(err) {
  const code = (await serverErrorCode(err)) || err?.message;
  return ERRORS[code] || "ทำรายการไม่สำเร็จ ลองอีกครั้ง";
}

// ย่อรูปสลิปในเครื่องก่อนส่ง (ด้านยาวสุด 1600px, JPEG) — เน็ตมือถือช้าก็ส่งไว และกินพื้นที่เก็บน้อย
async function compressSlip(file) {
  if (!file || !/^image\//.test(file.type || "image/")) throw new Error("not_image");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("not_image"));
      el.src = url;
    });
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.75, 0.6, 0.45]) {
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
      if (base64.length * 0.75 <= MAX_SLIP_BYTES) return { base64, preview: dataUrl };
    }
    throw new Error("too_large");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function emptyForm(branchId) {
  return { customerName: "", customerPhone: "", branchId: branchId || "", procedureId: "", promoId: "", amount: "", recordDate: getTodayStr(), note: "", slipBase64: "", slipPreview: "" };
}

function BookingCell({ deposit, onBook, canBook }) {
  const state = depositBookingState(deposit);
  const b = deposit.booking;
  if (state === "cancelled") {
    return <div style={{ color: "#6b7280", fontWeight: 700, fontSize: 13 }}>ยกเลิก/คืนเงิน<div style={{ fontWeight: 400, fontSize: 11 }}>{deposit.cancelReason}</div></div>;
  }
  if (state === "waitlist") {
    return <div style={{ color: "#b45309", fontWeight: 700, textAlign: "center", fontSize: 13 }}>อยู่คิวรอ<div style={{ fontWeight: 400, fontSize: 11 }}>ยังไม่มีวันเวลา</div></div>;
  }
  if (state === "booked" || state === "done") {
    return (
      <div style={{ color: "var(--green)", fontWeight: 800, textAlign: "center" }}>
        {state === "done" ? "มาทำแล้ว" : "จองแล้ว"}
        <div style={{ fontWeight: 700, fontSize: 12 }}>{formatThaiDate(b.date)}{b.timeBlock != null ? ` · ${blockToTime(b.timeBlock)} น.` : ""}</div>
      </div>
    );
  }
  return (
    <div style={{ textAlign: "center" }}>
      {state === "lost" && (
        <div style={{ color: "#dc2626", fontSize: 11, fontWeight: 700, marginBottom: 4 }}>
          {deposit.booking?.status === "rescheduled" ? "คิวเดิมเลื่อนออก (ยังไม่มีวันใหม่)" : "คิวเดิมถูกยกเลิก/ไม่มา"}
        </div>
      )}
      {canBook
        ? <button className="btn btn-sm btn-primary" onClick={() => onBook(deposit)}>📅 เลือกวันที่</button>
        : <span style={{ fontSize: 12, color: "var(--text3)" }}>ยังไม่จอง</span>}
    </div>
  );
}

function CancelModal({ deposit, busy, onClose, onConfirm }) {
  const [reason, setReason] = useState("");
  return (
    <Modal onClose={onClose}>
      <ModalHeader title="ยกเลิก / คืนเงิน" onClose={onClose} />
      <ModalBody>
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ fontWeight: 700 }}>{deposit.customerName} · {formatPhone(deposit.customerPhone)}</div>
          <div style={{ fontSize: 13, color: "var(--text3)" }}>{deposit.promoName} · โอน {formatBaht(deposit.amount)} บาท</div>
          {deposit.booking && depositBookingState(deposit) === "booked" && (
            <div style={{ fontSize: 12, color: "#b45309" }}>⚠️ รายการนี้จองคิวไว้แล้ว — การยกเลิกตรงนี้ไม่ยกเลิกคิวให้ ต้องไปยกเลิกคิวที่ตารางคิวเองด้วย</div>
          )}
          <label style={{ fontSize: 13 }}>เหตุผล (บังคับ)
            <input className="input" autoFocus maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เช่น ลูกค้าขอคืนเงิน / บันทึกซ้ำ / กรอกผิด" style={{ marginTop: 4 }} />
          </label>
          <div style={{ fontSize: 12, color: "var(--text3)" }}>รายการจะไม่ถูกลบ แต่จะไม่นับเข้ายอดค่าคอม และย้อนกลับไม่ได้</div>
        </div>
      </ModalBody>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose}>ปิด</button>
        <button className="btn btn-primary" style={{ background: "#dc2626", borderColor: "#dc2626" }} disabled={busy || reason.trim().length < 2} onClick={() => onConfirm(reason.trim())}>ยืนยันยกเลิก</button>
      </div>
    </Modal>
  );
}

export default function DepositPage({ branches = [], promos = [], procedures = [], staff = [], currentUser, onToast, onBook, pendingLink, onRetryLink, onDismissPendingLink }) {
  const role = currentUser?.role;
  const isCeo = role === "ceo";
  const branchScoped = role === "branch_manager" || role === "cashier";
  const canCancel = ["superadmin", "head_admin", "admin"].includes(role);
  const statsAll = ["superadmin", "head_admin", "ceo"].includes(role);
  const ownBranchId = branchScoped ? currentUser?.branchId || "" : "";
  const token = getServerSessionToken();

  const [tab, setTab] = useState(isCeo ? "stats" : "list");
  const [form, setForm] = useState(() => emptyForm(ownBranchId));
  const [list, setList] = useState({ total: 0, deposits: [], key: "" });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [branchFilter, setBranchFilter] = useState("");
  const [page, setPage] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [cancelling, setCancelling] = useState(null);
  const [slipUrl, setSlipUrl] = useState(null);
  const [statsRange, setStatsRange] = useState(() => {
    const m = pickDatePresets(["thisMonth"])[0];
    return { from: m.start, to: m.end };
  });
  const [stats, setStats] = useState(null);
  const statsPresets = useMemo(() => pickDatePresets(STATS_PRESET_KEYS), []);
  const activeStatsPreset = statsPresets.find((p) => p.start === statsRange.from && p.end === statsRange.to)?.key ?? "";
  const fileRef = useRef(null);
  const { isSaving, run } = useSubmissionLock();

  const activePromos = useMemo(() => {
    const procName = (id) => procedures.find((p) => p.id === id)?.name || "";
    return promos
      .filter((p) => p.active !== false && (!form.procedureId || p.procedureId === form.procedureId))
      .map((p) => ({ ...p, label: `${p.name}${p.procedureId && !form.procedureId ? ` (${procName(p.procedureId)})` : ""}` }));
  }, [promos, procedures, form.procedureId]);

  // ค้นหา: หน่วง 300ms กันยิงเซิร์ฟเวอร์ทุกตัวอักษร
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // กำลังโหลด = ผลที่มีอยู่ยังไม่ใช่ของเงื่อนไขปัจจุบัน (ไม่ต้อง setState ตอนเริ่มโหลด)
  const listKey = `${debounced}|${status}|${branchFilter}|${page}|${reloadKey}`;
  const loading = list.key !== listKey;
  useEffect(() => {
    if (!depositsAvailable || tab !== "list") return undefined;
    let alive = true;
    listDeposits(token, { search: debounced, status, branchId: branchScoped ? null : branchFilter || null, limit: DEPOSIT_PAGE_SIZE, offset: page * DEPOSIT_PAGE_SIZE })
      .then((data) => { if (alive) setList({ total: data?.total || 0, deposits: data?.deposits || [], key: listKey }); })
      .catch(async (err) => {
        if (!alive) return;
        setList((l) => ({ ...l, key: listKey }));
        onToast?.("error", await explain(err));
      });
    return () => { alive = false; };
  }, [tab, debounced, status, branchFilter, page, reloadKey, token, branchScoped, onToast, listKey]);

  useEffect(() => {
    if (tab !== "stats") return undefined;
    let alive = true;
    // ใส่ "จาก" หลัง "ถึง" ได้ — สลับให้ ไม่ปล่อยให้เซิร์ฟเวอร์ตอบ invalid_range
    const { from, to } = statsRange;
    const [lo, hi] = from && to && from > to ? [to, from] : [from, to];
    fetchDepositStats(token, { from: lo || null, to: hi || null })
      .then((data) => { if (alive) setStats(data); })
      .catch(async (err) => { if (alive) onToast?.("error", await explain(err)); });
    return () => { alive = false; };
  }, [tab, token, statsRange, onToast]);

  async function handlePickSlip(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const { base64, preview } = await compressSlip(file);
      setForm((f) => ({ ...f, slipBase64: base64, slipPreview: preview }));
    } catch (err) {
      onToast?.("error", err?.message === "too_large" ? "รูปสลิปใหญ่เกินไป ลองถ่าย/แคปใหม่" : "เปิดไฟล์นี้ไม่ได้ กรุณาเลือกรูปสลิป (JPG/PNG)");
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    const problem = validateDepositForm(form, { today: getTodayStr(), branchLocked: branchScoped });
    if (problem) { onToast?.("error", problem); return; }
    const r = await run(async () => {
      try {
        return await createDeposit(token, {
          customerName: form.customerName.trim(), customerPhone: form.customerPhone,
          branchId: branchScoped ? ownBranchId : form.branchId, promoId: form.promoId,
          amount: Number(form.amount), recordDate: form.recordDate, note: form.note.trim(), slipBase64: form.slipBase64,
        });
      } catch (err) {
        onToast?.("error", await explain(err));
        return null;
      }
    });
    if (r.started && r.result) {
      onToast?.("success", `บันทึกการโอนของ ${r.result.customerName} แล้ว`);
      setForm(emptyForm(ownBranchId));
      setTab("list");
      setPage(0);
      setReloadKey((k) => k + 1);
    }
  }

  async function handleCancel(reason) {
    const target = cancelling;
    const r = await run(async () => {
      try { return await cancelDeposit(token, target.id, reason); } catch (err) { onToast?.("error", await explain(err)); return null; }
    });
    if (r.started && r.result) {
      setCancelling(null);
      onToast?.("success", "ยกเลิกรายการแล้ว");
      setReloadKey((k) => k + 1);
    }
  }

  async function openSlip(deposit) {
    try {
      setSlipUrl({ url: await fetchDepositSlipUrl(token, deposit.id), title: `${deposit.customerName} · ${formatBaht(deposit.amount)} บาท` });
    } catch (err) {
      onToast?.("error", await explain(err));
    }
  }

  if (!depositsAvailable) {
    return <div className="card" style={{ padding: 24 }}>เมนูนี้ต้องเปิดโหมดเซสชันฝั่งเซิร์ฟเวอร์ (VITE_USE_SERVER_SESSION=true)</div>;
  }

  const tabs = isCeo
    ? [["stats", "📊 ยอดรวมรายคน"]]
    : [["list", "📋 รายชื่อลูกค้า"], ["new", "➕ บันทึกการโอน"], ["stats", statsAll ? "📊 ยอดรวมรายคน" : "📊 ยอดของฉัน"]];
  const totalPages = Math.max(1, Math.ceil(list.total / DEPOSIT_PAGE_SIZE));
  const statRows = stats?.stats || [];
  const statSum = sumDepositStats(statRows, staff);
  const th = { whiteSpace: "nowrap" };
  const td = {};

  return (
    <div>
      <h2 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 800 }}>💸 ลูกค้าโอนแล้ว รอจองคิว</h2>
      <div style={{ fontSize: 13, color: "var(--text3)", marginBottom: 12 }}>รายชื่อลูกค้าหลังบันทึกข้อมูลการโอน — กด “เลือกวันที่” เพื่อจองคิวจริงให้ลูกค้า</div>

      {pendingLink && (
        <div className="card" style={{ padding: 12, marginBottom: 12, borderColor: "#dc2626", background: "#fef2f2" }}>
          <div style={{ fontWeight: 700, color: "#b91c1c" }}>คิว{pendingLink.customerName ? `ของ ${pendingLink.customerName}` : "ล่าสุด"} บันทึกแล้ว แต่ยังผูกกับรายการโอนไม่สำเร็จ</div>
          <div style={{ fontSize: 12, margin: "4px 0 8px" }}>กด “ลองผูกอีกครั้ง” (ห้ามกดจองใหม่ จะได้คิวซ้ำ)</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-sm btn-primary" onClick={async () => { if (await onRetryLink?.()) setReloadKey((k) => k + 1); }}>ลองผูกอีกครั้ง</button>
            <button className="btn btn-sm btn-secondary" onClick={onDismissPendingLink}>ปิด</button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {tabs.map(([id, label]) => (
          <button key={id} className={`btn btn-sm ${tab === id ? "btn-primary" : "btn-secondary"}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {tab === "new" && !isCeo && (
        <form className="card" style={{ padding: 16, maxWidth: 560, display: "grid", gap: 10 }} onSubmit={handleCreate}>
          <label style={{ fontSize: 13 }}>ชื่อ-นามสกุล *
            <input className="input" maxLength={120} value={form.customerName} onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))} />
          </label>
          <label style={{ fontSize: 13 }}>เบอร์โทร *
            <input className="input" inputMode="tel" maxLength={14} value={form.customerPhone} onChange={(e) => setForm((f) => ({ ...f, customerPhone: e.target.value }))} placeholder="08xxxxxxxx" />
          </label>
          <label style={{ fontSize: 13 }}>สาขา *
            {branchScoped
              ? <div className="input" style={{ background: "var(--surface2)" }}>{branches.find((b) => b.id === ownBranchId)?.name || "สาขาของฉัน"}</div>
              : (
                <select className="input" value={form.branchId} onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}>
                  <option value="">— เลือกสาขา —</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              )}
          </label>
          <label style={{ fontSize: 13 }}>หัตถการ (ช่วยกรองโปร)
            <select className="input" value={form.procedureId} onChange={(e) => setForm((f) => ({ ...f, procedureId: e.target.value, promoId: "" }))}>
              <option value="">— ทุกหัตถการ —</option>
              {procedures.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 13 }}>โปร/หัตถการที่โอน *
            {/* ไม่เติมยอดโอนจากราคาโปรให้: ยอดที่ลูกค้าโอน (เช่นมัดจำ 89) ไม่เท่าราคาโปรเสมอ เติมให้ = เสี่ยงกดผ่านแล้วยอดค่าคอมผิด */}
            <select className="input" value={form.promoId} onChange={(e) => setForm((f) => ({ ...f, promoId: e.target.value }))}>
              <option value="">— เลือกโปร —</option>
              {activePromos.map((p) => <option key={p.id} value={p.id}>{p.label}{p.price ? ` · ${formatBaht(p.price)} บาท` : ""}</option>)}
            </select>
          </label>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <label style={{ fontSize: 13, flex: "1 1 140px" }}>ยอดโอน (บาท) *
              <input className="input" inputMode="decimal" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value.replace(/[^0-9.]/g, "") }))} />
            </label>
            <label style={{ fontSize: 13, flex: "1 1 140px" }}>วันที่บันทึก *
              <input className="input" type="date" value={form.recordDate} max={getTodayStr()} onChange={(e) => setForm((f) => ({ ...f, recordDate: e.target.value }))} />
            </label>
          </div>
          <label style={{ fontSize: 13 }}>หมายเหตุ (ถ้ามี)
            <input className="input" maxLength={300} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="เช่น เวลาโอน / เลขอ้างอิง" />
          </label>
          <div style={{ fontSize: 13 }}>
            สลิปการโอน * (บังคับ)
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePickSlip} />
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 4, flexWrap: "wrap" }}>
              <button type="button" className="btn btn-sm btn-secondary" onClick={() => fileRef.current?.click()}>{form.slipBase64 ? "เปลี่ยนรูปสลิป" : "📎 แนบสลิป"}</button>
              {form.slipPreview
                ? <img src={form.slipPreview} alt="สลิป" style={{ height: 80, borderRadius: 6, border: "1px solid var(--border)" }} />
                : <span style={{ fontSize: 12, color: "#dc2626" }}>ยังไม่ได้แนบสลิป</span>}
            </div>
          </div>
          <div style={{ fontSize: 12, color: "var(--text3)" }}>ผู้บันทึก: <b>{currentUser?.nickname || currentUser?.name}</b> (ใส่ให้อัตโนมัติ ใช้คิดค่าคอม)</div>
          <button className="btn btn-primary" type="submit" disabled={isSaving}>{isSaving ? "กำลังบันทึก…" : "บันทึกการโอน"}</button>
        </form>
      )}

      {tab === "list" && !isCeo && (
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <input className="input" style={{ flex: "1 1 240px", minWidth: 0 }} placeholder="🔍 ค้นหาชื่อ-นามสกุล หรือเบอร์โทร" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
            <select className="input" style={{ flex: "0 1 170px" }} value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }}>
              <option value="all">ทุกสถานะ</option>
              <option value="waiting">ยังไม่จอง</option>
              <option value="booked">จองแล้ว</option>
              <option value="cancelled">ยกเลิก/คืนเงิน</option>
            </select>
            {!branchScoped && (
              <select className="input" style={{ flex: "0 1 170px" }} value={branchFilter} onChange={(e) => { setBranchFilter(e.target.value); setPage(0); }}>
                <option value="">ทุกสาขา</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            )}
            <span style={{ alignSelf: "center", fontSize: 12, color: "var(--text3)" }}>{loading ? "กำลังโหลด…" : `${list.total.toLocaleString()} รายการ`}</span>
          </div>
          <div className="card" style={{ padding: 0, overflowX: "auto" }}>
            <table className="data-table" style={{ minWidth: 860 }}>
              <thead>
                <tr>
                  <th style={th}>วันที่บันทึก</th><th style={th}>ชื่อ-นามสกุล</th><th style={th}>เบอร์โทร</th><th style={th}>สาขา</th>
                  <th style={th}>หัตถการ</th><th style={th}>ยอดโอน</th><th style={th}>จองลงคิว</th><th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {list.deposits.map((d) => (
                  <tr key={d.id} style={{ opacity: d.cancelledAt ? 0.6 : 1 }}>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>{formatThaiDate(d.recordDate)}</td>
                    <td style={td}>{d.customerName}<div style={{ fontSize: 11, color: "var(--text3)" }}>บันทึกโดย {d.recordedByName || "—"}</div></td>
                    <td style={{ ...td, whiteSpace: "nowrap", fontFamily: "var(--mono)" }}>{formatPhone(d.customerPhone)}</td>
                    <td style={td}>{d.branchName}</td>
                    <td style={td}>{d.promoName || d.procedureName}</td>
                    <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap", fontWeight: 700 }}>{formatBaht(d.amount)} บาท</td>
                    <td style={{ ...td, minWidth: 150 }}><BookingCell deposit={d} canBook={canBookDeposit(d)} onBook={onBook} /></td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>
                      <button className="btn btn-sm btn-secondary" onClick={() => openSlip(d)}>สลิป</button>
                      {canCancel && !d.cancelledAt && <button className="btn btn-sm btn-secondary" style={{ marginLeft: 6, color: "#dc2626" }} onClick={() => setCancelling(d)}>ยกเลิก</button>}
                    </td>
                  </tr>
                ))}
                {!loading && list.deposits.length === 0 && (
                  <tr><td colSpan={8} style={{ ...td, textAlign: "center", color: "var(--text3)", padding: 20 }}>ไม่พบรายการ</td></tr>
                )}
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

      {tab === "stats" && (
        <div className="card" style={{ padding: 16 }}>
          {/* แบบเดียวกับตัวกรองหน้าตารางคิว: ช่วงด่วน + จากวันที่/ถึงวันที่ (นับตาม "วันที่บันทึก" การโอน) */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">ช่วงด่วน</label>
              <select
                value={activeStatsPreset}
                onChange={(e) => {
                  const p = statsPresets.find((x) => x.key === e.target.value);
                  if (p) setStatsRange({ from: p.start, to: p.end });
                }}
              >
                {!activeStatsPreset && <option value="">กำหนดเอง ({Math.max(daySpan(statsRange.from, statsRange.to), daySpan(statsRange.to, statsRange.from), 0)} วัน)</option>}
                {statsPresets.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">จากวันที่บันทึก</label>
              <input type="date" value={statsRange.from} onChange={(e) => setStatsRange((r) => ({ ...r, from: e.target.value }))} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">ถึงวันที่</label>
              <input type="date" value={statsRange.to} onChange={(e) => setStatsRange((r) => ({ ...r, to: e.target.value }))} />
            </div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table" style={{ minWidth: 720 }}>
              <thead>
                <tr>
                  <th style={th}>คนบันทึก</th>
                  <th style={th}>บันทึกทั้งหมด</th>
                  <th style={th}>จองคิวแล้ว</th>
                  <th style={th}>ลูกค้ามาทำแล้ว</th>
                  <th style={th}>ค่าคอม 2% (แอดมิน)</th>
                </tr>
              </thead>
              <tbody>
                {statRows.map((r) => (
                  <tr key={r.staffId}>
                    <td style={td}>{r.staffName || "—"}</td>
                    <td style={{ ...td, textAlign: "right" }}>{r.count} ราย · <b>{formatBaht(r.amount)}</b> บาท</td>
                    <td style={{ ...td, textAlign: "right" }}>{r.bookedCount} ราย · <b>{formatBaht(r.bookedAmount)}</b> บาท</td>
                    <td style={{ ...td, textAlign: "right" }}>{r.doneCount} ราย · <b>{formatBaht(r.doneAmount)}</b> บาท</td>
                    <td style={{ ...td, textAlign: "right", color: "var(--green)", fontWeight: 800 }}>
                      {depositCommissionForRow(r, staff) == null ? <span style={{ color: "var(--text3)", fontWeight: 400 }}>—</span> : `${formatBaht(depositCommissionForRow(r, staff))} บาท`}
                    </td>
                  </tr>
                ))}
                {statRows.length > 1 && (
                  <tr style={{ background: "var(--surface2)", fontWeight: 800 }}>
                    <td style={td}>รวม</td>
                    <td style={{ ...td, textAlign: "right" }}>{statSum.count} ราย · {formatBaht(statSum.amount)} บาท</td>
                    <td style={{ ...td, textAlign: "right" }}>{statSum.bookedCount} ราย · {formatBaht(statSum.bookedAmount)} บาท</td>
                    <td style={{ ...td, textAlign: "right" }}>{statSum.doneCount} ราย · {formatBaht(statSum.doneAmount)} บาท</td>
                    <td style={{ ...td, textAlign: "right", color: "var(--green)" }}>{formatBaht(statSum.commission)} บาท</td>
                  </tr>
                )}
                {stats && statRows.length === 0 && <tr><td colSpan={5} style={{ ...td, textAlign: "center", color: "var(--text3)" }}>ไม่มีรายการในช่วงนี้</td></tr>}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 8 }}>
            ค่าคอม 2% ของยอด “บันทึกทั้งหมด” เฉพาะตำแหน่งแอดมิน ได้ทันทีที่บันทึกการโอน (ตำแหน่งอื่นขึ้น —) · ไม่นับรายการที่ยกเลิก/คืนเงิน (ยกเลิกทีหลัง = ค่าคอมรายการนั้นหายไปจากยอด) · “จองคิวแล้ว” ไม่นับคิวที่ถูกยกเลิก/ไม่มา · {stats?.scope === "self" ? "แสดงเฉพาะยอดที่คุณบันทึก" : "ทุกคนทุกสาขา"}
          </div>
        </div>
      )}

      {cancelling && <CancelModal deposit={cancelling} busy={isSaving} onClose={() => setCancelling(null)} onConfirm={handleCancel} />}
      {slipUrl && (
        <Modal onClose={() => setSlipUrl(null)}>
          <ModalHeader title={`สลิป · ${slipUrl.title}`} onClose={() => setSlipUrl(null)} />
          <ModalBody>
            <img src={slipUrl.url} alt="สลิปการโอน" style={{ maxWidth: "100%", display: "block", margin: "0 auto" }} />
          </ModalBody>
        </Modal>
      )}
    </div>
  );
}
