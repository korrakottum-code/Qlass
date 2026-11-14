import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchPublicBranches, fetchPublicServices, fetchPublicSlots, bookPublic } from "../utils/onlineBookingApi";
import { bangkokToday, bookingDates, thaiDateLabel, normalizePhone, isValidMobile, matchesSearch, groupServices, COUPON_COUNTS, MAX_COUPONS, couponMinutes, addMinutes, floorToSlot, ceilToSlot, procedureOrderKind } from "../utils/publicBooking";

// หน้าลูกค้าจองคิวเอง (/#book หรือ /#book/<branchId>) — ไม่ต้องล็อกอิน เปิดจากลิงก์ในไลน์/เพจ ใช้บนมือถือเป็นหลัก
// เปิดเฉพาะสาขา/บริการที่ตั้งไว้ในเมนู "จองออนไลน์" กติกาเตียงและเวลาอยู่ฝั่งเซิร์ฟเวอร์ (online_booking_*_v1) ทั้งหมด

const ERROR_TEXT = {
  SLOT_UNAVAILABLE: "เวลานี้เพิ่งถูกจองไป กรุณาเลือกเวลาอื่น",
  TOO_MANY_BOOKINGS: "คุณลูกค้ามีคิวจองออนไลน์ค้างอยู่ 2 คิวแล้ว หากต้องการจองเพิ่มหรือเปลี่ยนเวลา กรุณาทัก LINE @classclinic",
  OUTSIDE_BOOKING_WINDOW: "ต้องจองก่อนเวลานัดอย่างน้อย 2 ชั่วโมง และล่วงหน้าได้ไม่เกิน 14 วัน",
  BRANCH_NOT_ACCEPTING: "สาขานี้ปิดรับจองออนไลน์ชั่วคราว กรุณาทัก LINE @classclinic",
  INVALID_CUSTOMER: "กรุณาตรวจชื่อและเบอร์มือถืออีกครั้ง",
  INVALID_SERVICE: "บริการนี้ปิดรับจองออนไลน์แล้ว กรุณาเลือกบริการอื่น",
  INVALID_BRANCH: "สาขานี้ปิดรับจองออนไลน์แล้ว",
  RATE_LIMITED: "ทำรายการถี่เกินไป กรุณารอสักครู่แล้วลองใหม่",
  INVALID_COUNT: `จองออนไลน์ใช้คูปองได้ครั้งละ 1–${MAX_COUPONS} ใบ หากใช้มากกว่านี้ กรุณาทัก LINE @classclinic`,
  // เพดานใหม่ (20261115130000): ค้างได้ไม่เกิน 2 วัน วันละไม่เกิน 3 คิว
  TOO_MANY_DAYS: "คุณลูกค้ามีคิวจองออนไลน์ล่วงหน้าครบ 2 วันแล้ว จองเพิ่มได้เฉพาะวันที่มีคิวอยู่แล้ว หากต้องการจองวันอื่นหรือเปลี่ยนเวลา กรุณาทัก LINE @classclinic",
  TOO_MANY_SAME_DAY: "คุณลูกค้ามีคิวจองออนไลน์ในวันนี้ครบ 3 คิวแล้ว หากต้องการจองเพิ่ม กรุณาทัก LINE @classclinic",
};
// ห้ามบอกลูกค้าว่าตรวจจากเบอร์ (เจ้าของสั่ง 14 พ.ย. 2569) — ลูกค้าจะเปลี่ยนเบอร์มาจองหลบกติกา
// minutes = ความยาวคิวที่กำลังจอง (ใช้คำนวณ "เวลาเริ่มไม่เกิน" ตอนผิดลำดับหัตถการ)
// dayTimes = เวลาเริ่มทุกปุ่มของวันนั้น ["11:00", …] — ถ้าเวลาที่ต้องเลือกอยู่นอกเวลาเปิด บอกให้เลือกวันอื่นแทน
function errorText(code, conflict, minutes, dayTimes) {
  if (code === "PROCEDURE_ORDER") {
    const what = conflict?.service ? `คิว ${conflict.service}` : "คิวหัตถการอื่น";
    const when = conflict?.time ? ` เวลา ${conflict.time}${conflict.end_time ? `–${conflict.end_time}` : ""} น.` : "";
    const times = Array.isArray(dayTimes) ? dayTimes.filter(Boolean) : [];
    if (conflict?.need === "start_from") {
      const earliest = conflict?.end_time ? ceilToSlot(conflict.end_time) : "";
      const noRoom = earliest && times.length > 0 && !times.some((t) => t >= earliest);
      const from = noRoom ? "วันนั้นไม่มีเวลาหลังคิวนั้นแล้ว กรุณาเลือกวันอื่น"
        : earliest ? `กรุณาเลือกเวลาตั้งแต่ ${earliest} น. เป็นต้นไป` : "กรุณาเลือกเวลาหลังคิวนั้น";
      return `หัตถการฉีดต้องทำหลัง Pico/Hifu/Ultraformer คุณลูกค้ามี${what}${when} ในวันเดียวกันอยู่แล้ว ${from} หรือทัก LINE @classclinic`;
    }
    const latest = conflict?.time ? floorToSlot(addMinutes(conflict.time, -(Number(minutes) || 0))) : "";
    const noRoom = latest && times.length > 0 && !times.some((t) => t <= latest);
    const by = noRoom ? "วันนั้นไม่มีเวลาพอให้ทำก่อนคิวนั้น กรุณาเลือกวันอื่น"
      : latest ? `กรุณาเลือกเวลาเริ่มไม่เกิน ${latest} น.` : "กรุณาเลือกเวลาก่อนคิวนั้น";
    return `Pico/Hifu/Ultraformer ต้องทำก่อนหัตถการฉีด คุณลูกค้ามี${what}${when} ในวันเดียวกันอยู่แล้ว ${by} หรือทัก LINE @classclinic`;
  }
  if (code === "CUSTOMER_TIME_CONFLICT") {
    const what = conflict?.service ? `คิว ${conflict.service}` : "คิวอื่น";
    const when = conflict?.time ? ` เวลา ${conflict.time}${conflict.end_time ? `–${conflict.end_time}` : ""} น.` : "";
    return `คุณลูกค้ามี${what}${when} ในวันเดียวกันอยู่แล้ว เวลาทับกัน กรุณาเลือกเวลาอื่นที่ไม่ทับคิวเดิม`;
  }
  return ERROR_TEXT[code] || "ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง";
}

// LINE OA ของคลินิก — ลิงก์เพิ่มเพื่อนแล้วเปิดแชทได้เลย
const LINE_ID = "@classclinic";
const LINE_URL = "https://line.me/R/ti/p/%40classclinic";

function LineLink({ children }) {
  return (
    <a href={LINE_URL} target="_blank" rel="noopener noreferrer"
      style={{ color: "#06C755", fontWeight: 700, textDecoration: "underline" }}>{children}</a>
  );
}

function serviceDetail(sv) {
  return `${Number(sv.price) > 0 ? `${Number(sv.price).toLocaleString()} บาท · ` : ""}ประมาณ ${sv.duration_minutes} นาที`;
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
  chosen: {
    display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 10,
    border: "1.5px solid var(--accent)", background: "var(--accent-soft)",
  },
  change: { flex: "0 0 auto", border: "none", background: "none", color: "var(--accent)", fontFamily: "var(--font)", fontSize: 14, fontWeight: 700, cursor: "pointer", padding: 4 },
  groupHead: (open) => ({
    display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", padding: "12px 14px", marginBottom: 8, borderRadius: 10,
    border: "1.5px solid var(--border)", background: open ? "var(--surface2)" : "var(--surface)", cursor: "pointer",
    fontFamily: "var(--font)", fontSize: 15, fontWeight: 700, color: "var(--text)", textAlign: "left",
  }),
  hint: { background: "var(--accent-soft)", color: "var(--text)", borderRadius: 10, padding: "10px 12px", fontSize: 14, lineHeight: 1.6 },
};

export default function PublicBookingPage() {
  const [branches, setBranches] = useState(null);
  const [branchId, setBranchId] = useState("");
  const [services, setServices] = useState(null);
  const [promoId, setPromoId] = useState("");
  const [couponCount, setCouponCount] = useState(1);
  // ค้นหา/เปลี่ยน — สาขา 30 แห่ง โปรเป็นร้อย จะได้ไม่ยาวเป็นพรืด เลือกแล้วหุบเหลือบรรทัดเดียว
  const [branchQuery, setBranchQuery] = useState("");
  const [pickBranch, setPickBranch] = useState(true);
  const [serviceQuery, setServiceQuery] = useState("");
  const [pickService, setPickService] = useState(true);
  const [openGroup, setOpenGroup] = useState("");
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
        if (fromHash && list.some((b) => b.id === fromHash)) { setBranchId(fromHash); setPickBranch(false); }
        else if (list.length === 1) { setBranchId(list[0].id); setPickBranch(false); }
      })
      .catch((err) => { if (!cancelled) setLoadError(errorText(err.code)); });
    return () => { cancelled = true; document.title = prevTitle; };
  }, []);

  useEffect(() => {
    if (!branchId) return undefined;
    let cancelled = false;
    setServices(null); setPromoId(""); setCouponCount(1); setSlots(null); setStartTime("");
    setPickService(true); setServiceQuery(""); setOpenGroup("");
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
    fetchPublicSlots(branchId, promoId, date, couponCount)
      .then((list) => { if (id === slotRequest.current) setSlots(list); })
      .catch((err) => { if (id === slotRequest.current) { setSlots([]); setLoadError(errorText(err.code)); } });
  }, [branchId, promoId, date, couponCount]);

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
      count: couponCount,
    };
    // กดซ้ำด้วยข้อมูลเดิม (เน็ตหลุด) ใช้รหัสอ้างอิงเดิม = เซิร์ฟเวอร์คืนผลเดิม ไม่สร้างคิวซ้ำ
    const signature = JSON.stringify(payload);
    if (refRef.current.signature !== signature) refRef.current = { signature, reference: newReference() };
    try {
      const result = await bookPublic({ ...payload, referenceId: refRef.current.reference });
      setDone(result);
    } catch (err) {
      setSubmitError(errorText(err.code, err.conflict, couponMinutes(service, couponCount), (slots || []).map((s) => s.time)));
      if (err.code === "SLOT_UNAVAILABLE" || err.code === "CUSTOMER_TIME_CONFLICT" || err.code === "PROCEDURE_ORDER") { setStartTime(""); loadSlots(); }
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
              <div>💆 {done.service}{done.count > 1 ? ` · คูปอง ${done.count} ใบ` : ""}</div>
              <div>📅 {thaiDateLabel(done.date)} เวลา {done.time}{done.end_time ? `–${done.end_time}` : ""} น.</div>
            </div>
            <div style={{ ...S.muted, marginTop: 16 }}>กรุณามาก่อนเวลานัด 10–15 นาที หากต้องการเลื่อนหรือยกเลิก กรุณาทัก LINE <LineLink>{LINE_ID}</LineLink></div>
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
          <div style={S.card}>ขณะนี้ยังไม่เปิดรับจองออนไลน์ กรุณาทัก LINE <LineLink>{LINE_ID}</LineLink> เพื่อจองคิว</div>
        )}

        {branches && branches.length > 0 && (
          <div style={S.card}>
            <div style={S.label}>1. สาขา</div>
            {branch && !pickBranch ? (
              <div style={S.chosen}>
                <div style={{ flex: 1, fontWeight: 600 }}>📍 {branch.name}</div>
                {branches.length > 1 && <button type="button" style={S.change} onClick={() => setPickBranch(true)}>เปลี่ยน</button>}
              </div>
            ) : (
              <>
                {branches.length > 5 && (
                  <input style={{ ...S.input, marginBottom: 10 }} type="search" placeholder="🔍 พิมพ์ชื่อสาขา เช่น ขอนแก่น"
                    value={branchQuery} onChange={(e) => setBranchQuery(e.target.value)} />
                )}
                {/* สาขาเยอะ = 2 คอลัมน์ ครึ่งความยาว */}
                <div style={branches.length > 5 ? { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 8px" } : undefined}>
                  {branches.filter((b) => matchesSearch(branchQuery, b.name)).map((b) => (
                    <button key={b.id} type="button"
                      style={branches.length > 5 ? { ...S.option(b.id === branchId), padding: "10px 10px", fontSize: 14 } : S.option(b.id === branchId)}
                      onClick={() => { setBranchId(b.id); setPickBranch(false); setBranchQuery(""); }}>{b.name}</button>
                  ))}
                </div>
                {!branches.some((b) => matchesSearch(branchQuery, b.name)) && <span style={S.muted}>ไม่พบสาขาที่ค้นหา</span>}
              </>
            )}
          </div>
        )}

        {branch && (
          <div style={S.card}>
            <div style={S.label}>2. บริการ</div>
            {services === null && <span style={S.muted}>กำลังโหลด…</span>}
            {services && services.length === 0 && <span style={S.muted}>สาขานี้ยังไม่มีบริการที่จองออนไลน์ได้</span>}
            {service && !pickService ? (
              <div style={S.chosen}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{service.name}</div>
                  <div style={{ ...S.muted, marginTop: 2 }}>{serviceDetail(service)}</div>
                </div>
                <button type="button" style={S.change} onClick={() => setPickService(true)}>เปลี่ยน</button>
              </div>
            ) : services && services.length > 0 && (
              <>
                {services.length > 6 && (
                  <input style={{ ...S.input, marginBottom: 10 }} type="search" placeholder="🔍 พิมพ์ชื่อโปร เช่น Botox"
                    value={serviceQuery} onChange={(e) => setServiceQuery(e.target.value)} />
                )}
                {(() => {
                  const choose = (id) => { setPromoId(id); setCouponCount(1); setPickService(false); setServiceQuery(""); };
                  const option = (sv) => (
                    <button key={sv.id} type="button" style={S.option(sv.id === promoId)} onClick={() => choose(sv.id)}>
                      <div style={{ fontWeight: 600 }}>{sv.name}</div>
                      <div style={{ ...S.muted, marginTop: 2 }}>{serviceDetail(sv)}</div>
                    </button>
                  );
                  // ค้นหาอยู่ หรือโปรไม่เยอะ = แสดงเรียงเลย; โปรเยอะ = จัดกลุ่มตามบริการ กดเปิดทีละกลุ่ม
                  if (serviceQuery.trim() || services.length <= 8) {
                    const found = services.filter((sv) => matchesSearch(serviceQuery, sv.name, sv.service));
                    return found.length ? found.map(option) : <div style={{ ...S.muted, marginBottom: 8 }}>ไม่พบโปรที่ค้นหา</div>;
                  }
                  return groupServices(services).map((g) => {
                    const open = openGroup === g.service;
                    return (
                      <div key={g.service}>
                        <button type="button" style={S.groupHead(open)} onClick={() => setOpenGroup(open ? "" : g.service)}>
                          <span>{g.service} <span style={{ ...S.muted, fontWeight: 400 }}>({g.items.length})</span></span>
                          <span style={{ color: "var(--text3)" }}>{open ? "▲" : "▼"}</span>
                        </button>
                        {open && <div style={{ paddingLeft: 8 }}>{g.items.map(option)}</div>}
                      </div>
                    );
                  });
                })()}
              </>
            )}
            {service && !pickService && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 14, marginBottom: 6 }}>ใช้คูปองกี่ใบ</div>
                <div style={{ display: "flex", gap: 8 }}>
                  {COUPON_COUNTS.map((n) => (
                    <button key={n} type="button" style={{ ...S.chip(n === couponCount, false), flex: 1, textAlign: "center" }}
                      onClick={() => setCouponCount(n)}>
                      <div style={{ fontWeight: 700 }}>{n} ใบ</div>
                      <div style={{ fontSize: 12, opacity: 0.85 }}>{couponMinutes(service, n)} นาที</div>
                    </button>
                  ))}
                </div>
                <div style={{ ...S.muted, marginTop: 8, lineHeight: 1.6 }}>
                  ระบบจะจองเวลาให้ตามจำนวนใบ · ใช้มากกว่า {MAX_COUPONS} ใบ กรุณาทัก LINE <LineLink>{LINE_ID}</LineLink> แอดมินจะจองให้
                </div>
              </div>
            )}
            {services && (pickService || !service) && (
              <div style={{ ...S.hint, marginTop: 4 }}>💬 หาโปรที่ต้องการไม่เจอ? ทักแอดมินทาง LINE <LineLink>{LINE_ID}</LineLink> แอดมินจะช่วยจองให้</div>
            )}
          </div>
        )}

        {service && (
          <div style={S.card}>
            <div style={S.label}>3. วันและเวลา</div>
            {/* จองไม่ผ่านเพราะเวลา (ถูกจองไป/ทับคิวเดิมของลูกค้า) ระบบล้างเวลาที่เลือก → การ์ดยืนยันหาย จึงแสดงเหตุผลตรงนี้แทน */}
            {submitError && !slot && <div style={S.error}>{submitError}</div>}
            {procedureOrderKind(service.service) && (
              <div style={{ ...S.hint, marginBottom: 8 }}>
                💡 ถ้าจะทำ Pico/Hifu/Ultraformer และหัตถการฉีด (Botox/Filler/Meso) ในวันเดียวกัน ต้องจองเวลา Pico/Hifu/Ultraformer ให้อยู่ก่อนเวลาฉีด
              </div>
            )}
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
                      style={S.chip(s.start_time === startTime, !s.available)} onClick={() => { setStartTime(s.start_time); setSubmitError(""); }}>
                      {s.time}
                    </button>
                  ))}
                </div>
              )}
              {slot && (
                <div style={{ ...S.hint, marginTop: 10 }}>
                  🕒 จองเวลา <b>{slot.time}–{addMinutes(slot.time, couponMinutes(service, couponCount))} น.</b> ({couponMinutes(service, couponCount)} นาที{couponCount > 1 ? ` สำหรับ ${couponCount} ใบ` : ""})
                </div>
              )}
              {slots && slots.some((s) => s.available) && !slot && (
                <div style={{ ...S.muted, marginTop: 10 }}>เวลาบนปุ่มคือเวลาเริ่ม · ช่องที่ขีดฆ่า = ไม่ว่างพอสำหรับ {couponMinutes(service, couponCount)} นาที</div>
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
            <textarea style={{ ...S.input, minHeight: 60, resize: "vertical" }} placeholder="หมายเหตุ (ถ้ามี) เช่น ชื่อคูปองที่จะใช้" value={note} maxLength={300}
              onChange={(e) => setNote(e.target.value)} />
            {/* เจ้าของสั่ง 14 พ.ย. 2569 — จำนวนใบเลือกด้านบนแล้ว (ล็อกเวลาตามจริง); หัตถการอื่นในหมายเหตุไม่ได้จองเวลาไว้ ทำให้คิวหมอล้น */}
            <div style={{ color: "var(--amber)", fontSize: 12.5, lineHeight: 1.6, marginTop: 6 }}>
              หมายเหตุใช้แจ้งรายละเอียดเท่านั้น หัตถการอื่นที่เขียนในหมายเหตุ ระบบไม่ได้จองเวลาไว้ให้ กรุณาจองแยกอีกคิว หรือทัก LINE {LINE_ID}
            </div>
            {/* กับดักบอท: คนจริงมองไม่เห็นและไม่กรอก */}
            <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" value={website}
              onChange={(e) => setWebsite(e.target.value)} style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }} />
          </div>
        )}

        {slot && (
          <div style={S.card}>
            <div style={{ fontSize: 14, lineHeight: 1.8, marginBottom: 12 }}>
              <div>📍 {branch.name}</div>
              <div>💆 {service.name}{couponCount > 1 ? ` · คูปอง ${couponCount} ใบ` : ""}</div>
              <div>📅 {thaiDateLabel(date)} เวลา {slot.time}–{addMinutes(slot.time, couponMinutes(service, couponCount))} น. ({couponMinutes(service, couponCount)} นาที)</div>
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
