import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchPublicBranches, fetchPublicServices, fetchPublicSlots, bookPublic } from "../utils/onlineBookingApi";
import { bangkokToday, bookingDates, thaiDateLabel, normalizePhone, isValidMobile } from "../utils/publicBooking";

// หน้าลูกค้าจองคิวเอง (/#book หรือ /#book/<branchId>) — ไม่ต้องล็อกอิน เปิดจากลิงก์ในไลน์/เพจ ใช้บนมือถือเป็นหลัก
// เปิดเฉพาะสาขา/บริการที่ตั้งไว้ในเมนู "จองออนไลน์" กติกาเตียงและเวลาอยู่ฝั่งเซิร์ฟเวอร์ (online_booking_*_v1) ทั้งหมด

const ERROR_TEXT = {
  SLOT_UNAVAILABLE: "เวลานี้เพิ่งถูกจองไป กรุณาเลือกเวลาอื่น",
  TOO_MANY_BOOKINGS: "เบอร์นี้มีคิวจองออนไลน์ค้างอยู่ 2 คิวแล้ว หากต้องการจองเพิ่มหรือเปลี่ยนเวลา กรุณาทักแชทคลินิก",
  OUTSIDE_BOOKING_WINDOW: "ต้องจองก่อนเวลานัดอย่างน้อย 2 ชั่วโมง และล่วงหน้าได้ไม่เกิน 14 วัน",
  BRANCH_NOT_ACCEPTING: "สาขานี้ปิดรับจองออนไลน์ชั่วคราว กรุณาทักแชทคลินิก",
  INVALID_CUSTOMER: "กรุณาตรวจชื่อและเบอร์มือถืออีกครั้ง",
  INVALID_SERVICE: "บริการนี้ปิดรับจองออนไลน์แล้ว กรุณาเลือกบริการอื่น",
  INVALID_BRANCH: "สาขานี้ปิดรับจองออนไลน์แล้ว",
  RATE_LIMITED: "ทำรายการถี่เกินไป กรุณารอสักครู่แล้วลองใหม่",
};
function errorText(code) {
  return ERROR_TEXT[code] || "ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง";
}

function branchIdFromHash() {
  const m = window.location.hash.match(/^#book\/([0-9a-f-]{36})/i);
  return m ? m[1].toLowerCase() : "";
}
function newReference() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

const S = {
  page: { minHeight: "100vh", background: "var(--bg)", padding: "16px 16px 40px" },
  wrap: { maxWidth: 480, margin: "0 auto" },
  card: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 16, marginBottom: 12 },
  h1: { fontSize: 20, fontWeight: 700, margin: "4px 0 2px" },
  sub: { color: "var(--text2)", fontSize: 13, marginBottom: 14 },
  label: { fontWeight: 700, fontSize: 15, marginBottom: 10 },
  option: (on) => ({
    display: "block", width: "100%", textAlign: "left", padding: "12px 14px", marginBottom: 8, borderRadius: 10, cursor: "pointer",
    border: `1.5px solid ${on ? "var(--accent)" : "var(--border)"}`, background: on ? "var(--accent-soft)" : "var(--surface)",
    fontFamily: "var(--font)", fontSize: 15, color: "var(--text)",
  }),
  chipRow: { display: "flex", gap: 8, overflowX: "auto", paddingBottom: 6 },
  chip: (on, disabled) => ({
    flex: "0 0 auto", padding: "8px 12px", borderRadius: 10, cursor: disabled ? "default" : "pointer", fontFamily: "var(--font)", fontSize: 14,
    border: `1.5px solid ${on ? "var(--accent)" : "var(--border)"}`, background: on ? "var(--accent)" : disabled ? "var(--surface2)" : "var(--surface)",
    color: on ? "#fff" : disabled ? "var(--text3)" : "var(--text)", textDecoration: disabled ? "line-through" : "none",
  }),
  grid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 },
  input: { width: "100%", padding: "11px 12px", borderRadius: 10, border: "1.5px solid var(--border)", fontFamily: "var(--font)", fontSize: 16, background: "var(--surface)", color: "var(--text)", boxSizing: "border-box" },
  button: (disabled) => ({
    width: "100%", padding: "14px", borderRadius: 12, border: "none", fontFamily: "var(--font)", fontSize: 17, fontWeight: 700,
    background: disabled ? "var(--border2)" : "var(--accent)", color: "#fff", cursor: disabled ? "default" : "pointer",
  }),
  error: { background: "var(--red-soft)", color: "var(--red)", borderRadius: 10, padding: "10px 12px", fontSize: 14, marginBottom: 12 },
  muted: { color: "var(--text3)", fontSize: 13 },
  hint: { background: "var(--accent-soft)", color: "var(--text)", borderRadius: 10, padding: "10px 12px", fontSize: 14, lineHeight: 1.6 },
};

export default function PublicBookingPage() {
  const [branches, setBranches] = useState(null);
  const [branchId, setBranchId] = useState("");
  const [services, setServices] = useState(null);
  const [promoId, setPromoId] = useState("");
  const today = useMemo(() => bangkokToday(), []);
  const dates = useMemo(() => bookingDates(today), [today]);
  const [date, setDate] = useState(today);
  const [slots, setSlots] = useState(null);
  const [startTime, setStartTime] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [customerType, setCustomerType] = useState("");
  const [note, setNote] = useState("");
  const [website, setWebsite] = useState(""); // กับดักบอท (ซ่อน)
  const [loadError, setLoadError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(null);
  const refRef = useRef({ signature: "", reference: "" });
  const slotRequest = useRef(0);

  useEffect(() => {
    const prevTitle = document.title;
    document.title = "จองคิวออนไลน์ — Class Clinic";
    let cancelled = false;
    fetchPublicBranches()
      .then((list) => {
        if (cancelled) return;
        setBranches(list);
        const fromHash = branchIdFromHash();
        if (fromHash && list.some((b) => b.id === fromHash)) setBranchId(fromHash);
        else if (list.length === 1) setBranchId(list[0].id);
      })
      .catch((err) => { if (!cancelled) setLoadError(errorText(err.code)); });
    return () => { cancelled = true; document.title = prevTitle; };
  }, []);

  useEffect(() => {
    if (!branchId) return undefined;
    let cancelled = false;
    setServices(null); setPromoId(""); setSlots(null); setStartTime("");
    fetchPublicServices(branchId)
      .then((list) => { if (!cancelled) setServices(list); })
      .catch((err) => { if (!cancelled) setLoadError(errorText(err.code)); });
    return () => { cancelled = true; };
  }, [branchId]);

  const loadSlots = useCallback(() => {
    if (!branchId || !promoId || !date) return;
    const id = ++slotRequest.current;
    setSlots(null);
    setLoadError("");
    fetchPublicSlots(branchId, promoId, date)
      .then((list) => { if (id === slotRequest.current) setSlots(list); })
      .catch((err) => { if (id === slotRequest.current) { setSlots([]); setLoadError(errorText(err.code)); } });
  }, [branchId, promoId, date]);

  useEffect(() => { setStartTime(""); loadSlots(); }, [loadSlots]);

  const branch = branches?.find((b) => b.id === branchId) || null;
  const service = services?.find((s) => s.id === promoId) || null;
  const slot = slots?.find((s) => s.start_time === startTime) || null;
  const phoneOk = isValidMobile(phone);
  const formOk = Boolean(branch && service && slot && name.trim().length >= 2 && phoneOk && customerType);

  async function submit() {
    if (!formOk || submitting) return;
    setSubmitError("");
    setSubmitting(true);
    const payload = {
      branchId, promoId, startTime, name: name.trim(), phone: normalizePhone(phone), customerType, note: note.trim(), website,
    };
    // กดซ้ำด้วยข้อมูลเดิม (เน็ตหลุด) ใช้รหัสอ้างอิงเดิม = เซิร์ฟเวอร์คืนผลเดิม ไม่สร้างคิวซ้ำ
    const signature = JSON.stringify(payload);
    if (refRef.current.signature !== signature) refRef.current = { signature, reference: newReference() };
    try {
      const result = await bookPublic({ ...payload, referenceId: refRef.current.reference });
      setDone(result);
    } catch (err) {
      setSubmitError(errorText(err.code));
      if (err.code === "SLOT_UNAVAILABLE") { setStartTime(""); loadSlots(); }
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div style={S.page}>
        <div style={S.wrap}>
          <div style={{ ...S.card, textAlign: "center", padding: 24 }}>
            <div style={{ fontSize: 44 }}>✅</div>
            <div style={S.h1}>จองคิวสำเร็จ</div>
            <div style={{ ...S.hint, fontWeight: 700, margin: "10px 0 14px" }}>📸 กรุณาแคปหน้าจอนี้เก็บไว้ แล้วแสดงให้พนักงานดูเมื่อมาถึงคลินิก</div>
            <div style={{ ...S.sub, marginBottom: 16 }}>เลขที่การจอง <b style={{ fontFamily: "var(--mono)", color: "var(--text)" }}>{done.booking_ref}</b></div>
            <div style={{ textAlign: "left", fontSize: 15, lineHeight: 1.9 }}>
              <div>📍 {done.branch}</div>
              <div>💆 {done.service}</div>
              <div>📅 {thaiDateLabel(done.date)} เวลา {done.time} น.</div>
            </div>
            <div style={{ ...S.muted, marginTop: 16 }}>กรุณามาก่อนเวลานัด 10–15 นาที หากต้องการเลื่อนหรือยกเลิก กรุณาทักแชทคลินิก</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <div style={S.wrap}>
        <div style={S.h1}>จองคิวออนไลน์</div>
        <div style={S.sub}>Class Clinic — เลือกสาขา บริการ และเวลาที่สะดวก</div>
        {loadError && <div style={S.error}>{loadError}</div>}

        {branches === null && !loadError && <div style={S.card}><span style={S.muted}>กำลังโหลด…</span></div>}
        {branches && branches.length === 0 && (
          <div style={S.card}>ขณะนี้ยังไม่เปิดรับจองออนไลน์ กรุณาทักแชทคลินิกเพื่อจองคิว</div>
        )}

        {branches && branches.length > 0 && (
          <div style={S.card}>
            <div style={S.label}>1. สาขา</div>
            {branches.map((b) => (
              <button key={b.id} type="button" style={S.option(b.id === branchId)} onClick={() => setBranchId(b.id)}>{b.name}</button>
            ))}
          </div>
        )}

        {branch && (
          <div style={S.card}>
            <div style={S.label}>2. บริการ</div>
            {services === null && <span style={S.muted}>กำลังโหลด…</span>}
            {services && services.length === 0 && <span style={S.muted}>สาขานี้ยังไม่มีบริการที่จองออนไลน์ได้</span>}
            {services && services.map((s) => (
              <button key={s.id} type="button" style={S.option(s.id === promoId)} onClick={() => setPromoId(s.id)}>
                <div style={{ fontWeight: 600 }}>{s.name}</div>
                <div style={{ ...S.muted, marginTop: 2 }}>
                  {Number(s.price) > 0 ? `${Number(s.price).toLocaleString()} บาท · ` : ""}ประมาณ {s.duration_minutes} นาที
                </div>
              </button>
            ))}
            {services && <div style={{ ...S.hint, marginTop: 4 }}>💬 หาโปรที่ต้องการไม่เจอ? ทักแชทแอดมินได้เลย แอดมินจะช่วยจองให้</div>}
          </div>
        )}

        {service && (
          <div style={S.card}>
            <div style={S.label}>3. วันและเวลา</div>
            <div style={S.chipRow}>
              {dates.map((d) => (
                <button key={d} type="button" style={S.chip(d === date, false)} onClick={() => setDate(d)}>
                  {d === today ? "วันนี้" : thaiDateLabel(d).replace(/ \d{4}$/, "")}
                </button>
              ))}
            </div>
            <div style={{ marginTop: 12 }}>
              {slots === null && <span style={S.muted}>กำลังดูเวลาว่าง…</span>}
              {slots && slots.filter((s) => s.available).length === 0 && <span style={S.muted}>วันนี้ไม่มีเวลาว่าง ลองเลือกวันอื่น</span>}
              {slots && slots.some((s) => s.available) && (
                <div style={S.grid}>
                  {slots.map((s) => (
                    <button key={s.start_time} type="button" disabled={!s.available}
                      style={S.chip(s.start_time === startTime, !s.available)} onClick={() => setStartTime(s.start_time)}>
                      {s.time}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {slot && (
          <div style={S.card}>
            <div style={S.label}>4. ข้อมูลผู้จอง</div>
            <div style={{ marginBottom: 10 }}>
              <input style={S.input} placeholder="ชื่อ-นามสกุล" value={name} maxLength={100} autoComplete="name"
                onChange={(e) => setName(e.target.value)} />
            </div>
            <div style={{ marginBottom: 4 }}>
              <input style={S.input} placeholder="เบอร์มือถือ เช่น 0812345678" value={phone} inputMode="tel" autoComplete="tel"
                maxLength={15} onChange={(e) => setPhone(e.target.value)} />
            </div>
            {phone && !phoneOk && <div style={{ color: "var(--red)", fontSize: 13, marginBottom: 6 }}>กรุณากรอกเบอร์มือถือ 10 หลัก</div>}
            <div style={{ fontSize: 14, margin: "10px 0 6px" }}>เคยใช้บริการ Class Clinic มาก่อนไหม</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <button type="button" style={{ ...S.chip(customerType === "new", false), flex: 1 }} onClick={() => setCustomerType("new")}>ครั้งแรก</button>
              <button type="button" style={{ ...S.chip(customerType === "old", false), flex: 1 }} onClick={() => setCustomerType("old")}>เคยมาแล้ว</button>
            </div>
            <textarea style={{ ...S.input, minHeight: 60, resize: "vertical" }} placeholder="หมายเหตุ (ถ้ามี)" value={note} maxLength={300}
              onChange={(e) => setNote(e.target.value)} />
            {/* กับดักบอท: คนจริงมองไม่เห็นและไม่กรอก */}
            <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" value={website}
              onChange={(e) => setWebsite(e.target.value)} style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }} />
          </div>
        )}

        {slot && (
          <div style={S.card}>
            <div style={{ fontSize: 14, lineHeight: 1.8, marginBottom: 12 }}>
              <div>📍 {branch.name}</div>
              <div>💆 {service.name}</div>
              <div>📅 {thaiDateLabel(date)} เวลา {slot.time} น.</div>
            </div>
            {submitError && <div style={S.error}>{submitError}</div>}
            <button type="button" style={S.button(!formOk || submitting)} disabled={!formOk || submitting} onClick={submit}>
              {submitting ? "กำลังจอง…" : "ยืนยันการจอง"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
