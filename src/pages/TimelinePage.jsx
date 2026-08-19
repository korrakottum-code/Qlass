import { useState, useMemo, useEffect } from "react";
import { getTodayStr, blockToTime, formatThaiDate, getEmptyBookingForm, isActiveQueueStatus, isOverdueUnconfirmed, isRoomBlockClosed, roleAtLeast } from "../utils/helpers";
import { getBedSwitchState } from "../utils/bedSwitch";
import HnLookup from "../components/HnLookup";
import { useSubmissionLock } from "../hooks/useSubmissionLock";
import { proceduresForRoom, roomLockLabel } from "../utils/roomProcedures";

// สถานะที่ยังถือว่า "ยังไม่ยืนยัน" — ปุ่มย้ายเข้าคิวรอใน popover ใช้ได้เฉพาะกลุ่มนี้
const UNCONFIRMED_STATUSES = ["pending", "follow1", "follow2", "follow3"];

export default function TimelinePage({ queues, branches, rooms, procedures, promos, roomSchedules = [], roomProcedureIndex, currentUser, onSubmitBooking, onAbandonDraft, onEditQueue, onMoveToWaitingQueue, onToggleBedSwitch, showToast, onRangeNeeded }) {
  const [date, setDate] = useState(getTodayStr());
  // เลื่อนไปวันเก่ากว่า 30 วัน → ขอให้ App โหลดวันนั้น
  useEffect(() => { if (date) onRangeNeeded?.(date, date); }, [date, onRangeNeeded]);
  // เลือกได้ทีละสาขา (ไม่มี "ทุกสาขา" — เรนเดอร์ทุกห้องทุกสาขาพร้อมกันทำให้หน้าช้ามาก)
  // ถ้ายังไม่เคยเลือก หรือสาขาที่เลือกไว้หายไป (branches โหลดเสร็จ/เปลี่ยน) ใช้สาขาแรกแทน
  const [filterBranchOverride, setFilterBranchOverride] = useState(null);
  const filterBranch = (filterBranchOverride && branches.some((b) => b.id === filterBranchOverride))
    ? filterBranchOverride
    : (branches[0]?.id || "");
  const [popup, setPopup] = useState(null); // { q, room, block, x, y }
  const [bookingForm, setBookingForm] = useState(null); // mini booking popup form
  const { isSaving: saving, run: runBookingSubmit } = useSubmissionLock();
  const isMobile = typeof window !== "undefined" && window.innerWidth <= 640;
  const [outsideTapHint, setOutsideTapHint] = useState(false);

  // Goal 13: closing the popup without a successful save abandons this draft —
  // a stale request ID left over from a failed attempt must not be reused for
  // the next customer's booking (see fix/goal13-request-id-reset-on-cancel).
  function closeBookingForm() {
    onAbandonDraft?.();
    setOutsideTapHint(false);
    setBookingForm(null);
  }

  // กรอกไปครึ่งทางแล้วนิ้วไปโดนนอกกรอบ = พิมพ์ใหม่หมด ซึ่งบนมือถือเกิดง่ายมาก
  // กดนอกกรอบเลยปิดให้เฉพาะตอนที่ยังไม่ได้กรอกอะไร ถ้ากรอกแล้วต้องตั้งใจกด ยกเลิก
  function isBookingFormDirty(f) {
    if (!f) return false;
    return Boolean(
      f.name?.trim() || f.phone?.trim() || f.procedureId || f.promoId ||
      f.note?.trim() || (f.price !== "" && f.price != null && Number(f.price) !== 0) ||
      f.customerType !== "new"
    );
  }

  function onBackdropClick() {
    if (isBookingFormDirty(bookingForm)) setOutsideTapHint(true);
    else closeBookingForm();
  }

  function navigate(dir) {
    const d = new Date(date);
    d.setDate(d.getDate() + dir);
    setDate(d.toISOString().slice(0, 10));
  }

  const filteredRooms = useMemo(() => {
    return rooms.filter((r) => r.branchId === filterBranch);
  }, [rooms, filterBranch]);

  const dayQueues = useMemo(() =>
    queues.filter((q) => q.date === date),
    [queues, date]
  );

  const roomScheduleNotesByRoomId = useMemo(() => {
    const notesByRoomId = {};
    filteredRooms.forEach((room) => {
      const exactNotes = (roomSchedules || [])
        .filter((s) => s.roomId === room.id && s.date === date && s.note)
        .map((s) => s.note);

      const fallbackNotes = (roomSchedules || [])
        .filter((s) => s.roomId === room.id && !s.date && s.note)
        .map((s) => s.note);

      const notes = exactNotes.length > 0 ? exactNotes : fallbackNotes;
      if (notes.length > 0) notesByRoomId[room.id] = notes;
    });
    return notesByRoomId;
  }, [filteredRooms, roomSchedules, date]);

  // สถานะปิด/เปิดเตียงต่อห้อง — memo ไว้ ไม่คำนวณในลูป render
  // roomSchedules มี ~17,000 แถว ถ้าเรียก getBedSwitchState ตรง ๆ ในหัวคอลัมน์ จะไล่อาร์เรย์
  // 17,000 × จำนวนห้อง ทุกครั้งที่ re-render (เปิด popup / hover / เลื่อน) — หน่วงบนมือถือแน่
  const bedSwitchStateByRoomId = useMemo(() => {
    const byRoomId = {};
    filteredRooms.forEach((room) => {
      byRoomId[room.id] = getBedSwitchState(roomSchedules, room.id, date);
    });
    return byRoomId;
  }, [filteredRooms, roomSchedules, date]);

  // หา time range จากทุกห้อง
  const { minBlock, maxBlock } = useMemo(() => {
    let mn = 132, mx = 240;
    filteredRooms.forEach((r) => {
      if ((r.openBlock ?? 132) < mn) mn = r.openBlock ?? 132;
      if ((r.closeBlock ?? 240) > mx) mx = r.closeBlock ?? 240;
    });
    return { minBlock: mn, maxBlock: mx };
  }, [filteredRooms]);

  // แสดงทุกชั่วโมง (12 บล็อค = 1 ชม.) เป็น row
  const hourBlocks = useMemo(() => {
    const arr = [];
    for (let b = minBlock; b < maxBlock; b += 12) arr.push(b);
    return arr;
  }, [minBlock, maxBlock]);

  // โปร/แพ็กเกจ — หน้าร้านอยากเห็นข้างชื่อหัตถการ เพราะหัตถการเดียวกันมีหลายแพ็กเกจ
  // ทำ Map ครั้งเดียวแทนการ .find ต่อคิว (คิววันละหลายร้อย × โปร 272 รายการ)
  const promoById = useMemo(() => new Map((promos || []).map((p) => [p.id, p.name])), [promos]);

  // map roomId → { block → queue }
  const roomOccupied = useMemo(() => {
    const map = {};
    filteredRooms.forEach((r) => { map[r.id] = {}; });
    // คิวที่ยกเลิก/ไม่มา/เลื่อนออกไปที่อื่นแล้ว ไม่ควรครองช่องเวลาเดิมอีกต่อไป — ต้องเปิดให้จองใหม่ได้
    dayQueues.filter((q) => isActiveQueueStatus(q.status)).forEach((q) => {
      if (!map[q.roomId] || q.timeBlock === null) return;
      const proc = procedures.find((p) => p.id === q.procedureId);
      const dur = q.durationBlocks ?? proc?.blocks ?? 1;
      for (let i = 0; i < dur; i++) {
        map[q.roomId][q.timeBlock + i] = { ...q, procName: proc?.name || "", promoName: promoById.get(q.promoId) || "", isStart: i === 0, dur };
      }
    });
    return map;
  }, [filteredRooms, dayQueues, procedures, promoById]);

  const totalQueues = dayQueues.length;

  // คิวในสาขาที่ดูอยู่ ที่ยังไม่ยืนยันและเลย 12:00 ของวันนัดแล้ว (นับเฉพาะตอนดูวันนี้)
  // นับเฉพาะคิวที่มีห้อง+เวลา ให้ตัวเลขตรงกับช่องสีเหลืองที่กดได้จริงบน grid
  const overdueCount = useMemo(() => {
    if (date !== getTodayStr()) return 0;
    return dayQueues.filter((q) => q.branchId === filterBranch && q.roomId && q.timeBlock !== null && isOverdueUnconfirmed(q)).length;
  }, [dayQueues, date, filterBranch]);
  // ปุ่มปิด/เปิดเตียงรายวัน — เฉพาะผู้จัดการสาขาขึ้นไป (แคชเชียร์เห็นสถานะ กดไม่ได้)
  // และไม่โชว์สำหรับวันที่ผ่านไปแล้ว: ปิดเตียงย้อนหลังไม่มีความหมาย ลดโอกาสกดพลาด
  const canToggleBed = roleAtLeast(currentUser, "branch_manager");
  const isPastDay = date < getTodayStr();

  const ROW_H = 30;  // ความสูงแต่ละ block 5 นาที (ลดจาก 40 ให้เห็นช่วงเวลาได้มากขึ้นโดยไม่ต้องเลื่อน)
  const TIME_COL = 72; // คอลัมน์เวลาซ้าย
  // ความกว้างขั้นต่ำต่อห้อง — บนมือถือคอลัมน์จะไม่ถูกบีบจนอ่านชื่อไม่ออก
  // แต่เลื่อนดูห้องถัดไปในแนวนอนแทน (คอลัมน์เวลา sticky ติดซ้ายไว้เสมอ)
  const ROOM_COL_MIN = 118;

  return (
    <>
      {/* Controls */}
      {isMobile ? (
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 6 }}>
            <button onClick={() => navigate(-1)} style={{ padding: "6px 12px", borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--surface2)", cursor: "pointer", fontSize: 16, flexShrink: 0 }}>‹</button>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ flex: 1, minWidth: 0 }} />
            <button onClick={() => navigate(1)} style={{ padding: "6px 12px", borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--surface2)", cursor: "pointer", fontSize: 16, flexShrink: 0 }}>›</button>
            <button onClick={() => setDate(getTodayStr())} style={{ padding: "6px 10px", borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--surface2)", cursor: "pointer", fontSize: 12, fontWeight: 700, color: "var(--accent)", flexShrink: 0 }}>วันนี้</button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <select value={filterBranch} onChange={(e) => setFilterBranchOverride(e.target.value)} style={{ flex: 1, minWidth: 0 }}>
              {branches.length === 0 && <option value="">-- ไม่มีสาขา --</option>}
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)", whiteSpace: "nowrap" }}>{formatThaiDate(date)}</span>
            <span style={{ background: "var(--surface3)", borderRadius: 20, padding: "3px 10px", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>{totalQueues} คิว</span>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", marginBottom: 16 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">วันที่</label>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button onClick={() => navigate(-1)} style={{ padding: "6px 12px", borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--surface2)", cursor: "pointer", fontSize: 16 }}>‹</button>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 140 }} />
              <button onClick={() => navigate(1)} style={{ padding: "6px 12px", borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--surface2)", cursor: "pointer", fontSize: 16 }}>›</button>
              <button onClick={() => setDate(getTodayStr())} style={{ padding: "6px 10px", borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--surface2)", cursor: "pointer", fontSize: 12, fontWeight: 700, color: "var(--accent)" }}>วันนี้</button>
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">สาขา</label>
            <select value={filterBranch} onChange={(e) => setFilterBranchOverride(e.target.value)}>
              {branches.length === 0 && <option value="">-- ไม่มีสาขา --</option>}
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)" }}>{formatThaiDate(date)}</span>
            <span style={{ background: "var(--surface3)", borderRadius: 20, padding: "3px 12px", fontSize: 12, fontWeight: 700 }}>{totalQueues} คิว</span>
          </div>
        </div>
      )}

      {overdueCount > 0 && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8, marginBottom: 12,
          padding: "8px 14px", borderRadius: "var(--radius-sm)",
          border: "1.5px solid #d97706", background: "rgba(217,119,6,0.12)",
          color: "#b45309", fontSize: 13, fontWeight: 700,
        }}>
          ⚠️ {overdueCount} คิวยังไม่ยืนยัน เลยเวลา 12:00 แล้ว — กดที่ช่องคิว (สีเหลือง) เพื่อย้ายเข้าคิวรอ
        </div>
      )}

      {filteredRooms.length === 0 ? (
        <div className="card"><div className="empty"><div className="e-icon">🚪</div><p>ไม่พบห้อง</p></div></div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {/* ความสูงตาราง — ค่าคงที่เท่านั้น ห้ามวัดด้วย JS
              เคยลองวัดเองแล้วพัง production (PR #156 → revert #157): สูตรอิง
              document.scrollHeight ซึ่งชนกับ .app { min-height:100vh } ใน index.css
              บน iOS Safari 100vh คือวิวพอร์ตตอนซ่อนแถบเครื่องมือ แต่ window.innerHeight
              คือตอนโชว์แถบ → scrollHeight มากกว่า innerHeight ตลอด ตารางเลยหดจนยุบ
              และหน้าต่างเบราว์เซอร์ย่อ ๆ ตรวจไม่เจอเพราะไม่มีแถบเครื่องมือยุบได้

              190px = แถบบนแอป ~60 + แถบตัวเลือก 2 แถว ~63 + คำอธิบายสี 2 บรรทัด ~51 + เผื่อ
              ถ้าแถบเตือนคิวเลยเวลาโผล่ ตารางจะเตี้ยกว่าที่ควรนิดหน่อย ซึ่งยอมได้ —
              เสียที่ดีกว่าเสี่ยงยุบ ส่วน dvh (ไม่ใช่ vh) ปรับตามแถบเครื่องมือให้เองอยู่แล้ว */}
          <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: isMobile ? "calc(100dvh - 190px)" : "calc(100dvh - 230px)" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed", minWidth: TIME_COL + filteredRooms.length * ROOM_COL_MIN }}>
              {/* Header: ชื่อห้องเป็น column */}
              <thead>
                {/* sticky ต้องอยู่บน th (เบราว์เซอร์ไม่รองรับ sticky บน tr) — หัวตารางถึงติดหัวจอจริงตอนเลื่อนลง */}
                <tr>
                  <th style={{ width: TIME_COL, padding: "8px 10px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text3)", borderBottom: "2px solid var(--border2)", borderRight: "2px solid var(--border2)", position: "sticky", top: 0, left: 0, zIndex: 5, background: "var(--surface2)" }}>
                    เวลา
                  </th>
                  {filteredRooms.map((room) => {
                    const branch = branches.find((b) => b.id === room.branchId);
                    const cnt = dayQueues.filter((q) => q.roomId === room.id).length;
                    const roomScheduleNotes = roomScheduleNotesByRoomId[room.id] || [];
                    // ป้ายจากตัวล็อกจริง — วางไว้เหนือโน้ตที่พิมพ์เอง จะได้ไม่มีวันขัดกัน
                    const lockLabel = roomLockLabel(roomProcedureIndex, room, procedures);
                    const bed = bedSwitchStateByRoomId[room.id] || { state: "open" };
                    return (
                      <th key={room.id} style={{
                        // height 1px + ลูกในสูง 100% = ทุกคอลัมน์ยืดเท่าความสูงแถวจริง
                        // ทำให้ดันก้อนล่าง (จำนวนคิว+ปุ่ม) ไปชิดล่างด้วย marginTop:auto ได้
                        padding: 0, height: 1, verticalAlign: "top", textAlign: "center",
                        borderBottom: "2px solid var(--border2)",
                        borderRight: "1px solid var(--border)",
                        position: "sticky", top: 0, zIndex: 3,
                        background: room.type === "M" ? "#eff6ff" : "#f0fdf4",
                      }}>
                        {/* ทุกคอลัมน์ใช้โครงเดียวกัน: ชื่อ → เครื่อง → สถานะ/โน้ต → (ดันลงล่าง) จำนวน+ปุ่ม
                            ป้ายทุกใบกว้างเต็มคอลัมน์ ขอบซ้ายขวาจะได้ตรงกันทุกใบทุกคอลัมน์
                            แทนที่จะเป็น pill ลอย ๆ กว้างไม่เท่ากันจัดกึ่งกลาง */}
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: 3, height: "100%", boxSizing: "border-box", padding: "6px 8px" }}>
                          <div style={{ fontSize: 12, fontWeight: 800, color: room.type === "M" ? "var(--blue)" : "var(--green)" }}>
                            {room.name}
                          </div>
                          <div style={{ fontSize: 10, color: "var(--text3)", fontWeight: 400 }}>
                            [{room.type}]{branch ? ` • ${branch.name}` : ""}
                          </div>
                          {lockLabel && (
                            <span title="เตียงนี้ลงได้เฉพาะหัตถการเหล่านี้ (ตั้งค่าที่หน้าจัดการห้อง)" style={{ display: "block", fontSize: 10.5, fontWeight: 800, color: "var(--accent)", background: "var(--accent-soft)", border: "1px solid var(--accent)", borderRadius: 6, padding: "1px 6px", lineHeight: 1.45, wordBreak: "break-word" }}>
                              🔒 {lockLabel}
                            </span>
                          )}
                        {/* ปุ่ม/ป้ายปิดเตียงรายวัน — เตียงที่ปิดจากหน้าตารางห้อง (hand) โชว์ป้ายอย่างเดียว */}
                        {/* ป้ายสถานะ "ปิดอยู่" — แยกจากปุ่มสั่งการชัดเจน เพราะป้ายกับปุ่มที่หน้าตา
                            เหมือนกันทำให้อ่านหัวคอลัมน์แล้วเข้าใจผิดว่าเตียงปิดอยู่ทั้งที่ยังเปิด */}
                          {bed.state !== "open" && (
                            <span
                              title={bed.state === "closed_by_hand" ? "ปิดไว้จากหน้าตารางห้อง/เครื่อง — เปิดคืนที่นั่น" : "เตียงนี้ปิดรับคิววันนี้"}
                              style={{ display: "block", fontSize: 11, fontWeight: 800, color: "#ffffff", background: "#b91c1c", border: "1px solid #7f1d1d", borderRadius: 6, padding: "2px 6px", lineHeight: 1.5 }}
                            >
                              ⛔ ปิดรับคิววันนี้
                            </span>
                          )}
                          {/* โน้ตเรียงบรรทัดละใบเสมอ — เดิมบนจอใหญ่ปล่อยให้ wrap เอง สองใบเลยบางที
                              อยู่ข้างกันบางทีตกบรรทัด คอลัมน์ข้าง ๆ จึงสูงไม่เท่ากันแบบเดาไม่ได้ */}
                          {roomScheduleNotes.map((note, idx) => (
                            <span key={`${note}_${idx}`} title={note} style={{ display: "block", fontSize: isMobile ? 9.5 : 11, fontWeight: 800, color: "#ffffff", lineHeight: 1.4, background: "#dc2626", border: "1px solid #b91c1c", borderRadius: 6, padding: isMobile ? "1px 5px" : "2px 6px", ...(isMobile ? { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } : { wordBreak: "break-word" }) }}>
                              📅 {note}
                            </span>
                          ))}
                          {/* ก้อนล่าง — marginTop:auto ดันไปชิดก้นเสมอ ปุ่มทุกคอลัมน์เลยอยู่ระดับเดียวกัน
                              จำนวนคิวโชว์ตลอดแม้เป็น 0 ไม่งั้นคอลัมน์ที่ยังไม่มีคิวจะสูงไม่เท่าเพื่อน */}
                          <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, paddingTop: 3 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: cnt > 0 ? "var(--accent)" : "var(--text3)" }}>{cnt} คิว</div>
                        {/* ปุ่มสั่งการ — ขึ้นต้นด้วยคำกริยา "กด" และทำหน้าตาให้เป็นปุ่มจริง
                            ไม่ใช่ป้ายแบน ๆ แบบ chip อื่นในหัวคอลัมน์ */}
                            {canToggleBed && !isPastDay && bed.state !== "closed_by_hand" && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); onToggleBedSwitch?.(room, date); }}
                                title={bed.state === "open" ? "กดเพื่อปิดเตียงนี้ทั้งวัน (เฉพาะวันที่ดูอยู่)" : "กดเพื่อเปิดเตียงคืน (ลบเฉพาะรายการที่ปุ่มนี้สร้าง)"}
                                style={{
                                  fontSize: 10.5, fontWeight: 700, lineHeight: 1.4, cursor: "pointer",
                                  padding: "3px 9px", borderRadius: 14,
                                  border: `1.5px solid ${bed.state === "open" ? "var(--text3)" : "#15803d"}`,
                                  background: bed.state === "open" ? "var(--surface2)" : "#dcfce7",
                                  color: bed.state === "open" ? "var(--text2)" : "#15803d",
                                  boxShadow: "0 1px 2px rgba(0,0,0,0.10)",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {bed.state === "open" ? "กดปิดเตียง" : "↩︎ กดเปิดคืน"}
                              </button>
                            )}
                            {bed.state === "closed_by_hand" && canToggleBed && !isPastDay && (
                              <div style={{ fontSize: 9.5, color: "var(--text3)", lineHeight: 1.4 }}>
                                เปิดคืนที่หน้าตารางห้อง/เครื่อง
                              </div>
                            )}
                          </div>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>

              {/* Body: แต่ละชั่วโมงเป็นกลุ่ม แต่ละ 5 นาทีเป็น row */}
              <tbody>
                {hourBlocks.map((hb) => {
                  // แต่ละชั่วโมงมี 12 block (= 12 เอ็น 5นาที = 60 นาที)
                  const rowBlocks = [];
                  for (let b = hb; b < hb + 12 && b < maxBlock; b++) rowBlocks.push(b);

                  return rowBlocks.map((b, bi) => {
                    const isHourStart = bi === 0;
                    const isHalfHour = b % 6 === 0;
                    return (
                      <tr key={b} style={{ borderBottom: isHourStart && bi === 0 ? "2px solid var(--border2)" : "1px solid var(--border)" }}>
                        {/* คอลัมน์เวลา */}
                        <td style={{
                          width: TIME_COL, padding: "0 8px",
                          height: ROW_H, verticalAlign: "middle",
                          borderRight: "2px solid var(--border2)",
                          position: "sticky", left: 0, zIndex: 2,
                          background: isHourStart ? "var(--surface2)" : isHalfHour ? "var(--surface3)" : "var(--surface)",
                          fontFamily: "var(--mono)", fontWeight: isHourStart ? 800 : isHalfHour ? 600 : 400,
                          fontSize: isHourStart ? 13 : isHalfHour ? 11 : 10,
                          color: isHourStart ? "var(--text1)" : "var(--text3)",
                          whiteSpace: "nowrap",
                        }}>
                          {(isHourStart || isHalfHour) ? blockToTime(b) : ""}
                        </td>

                        {/* เซลล์แต่ละห้อง */}
                        {filteredRooms.map((room) => {
                          const q = roomOccupied[room.id]?.[b];
                          const isBooked = !!q;
                          const isClosed = !isBooked && isRoomBlockClosed(roomSchedules, room.id, date, b, room);
                          const isCourse = q?.customerType === "course";
                          const isOverdue = isBooked && isOverdueUnconfirmed(q);
                          const isM = room.type === "M";
                          const bookedBg = isOverdue ? "rgba(217,119,6,0.2)" : isCourse ? "#fef9c3" : isM ? "#fde8e8" : "#dcfce7";
                          const closedBg = "var(--surface3)";
                          const emptyBg = isHourStart ? "rgba(0,0,0,0.02)" : "transparent";

                          return (
                            <td
                              key={room.id}
                              title={isBooked ? `คิวของคุณ ${q.name}` : isClosed ? "ห้องปิด/ไม่พร้อม" : "กดเพื่อจองคิว"}
                              onClick={(e) => {
                                if (q) {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setPopup({ q, room, block: b, x: rect.left, y: rect.bottom });
                                } else if (isClosed) {
                                  showToast?.("error", "⚠️ ห้องนี้ปิด/ไม่พร้อมในเวลานี้ ไม่สามารถลงคิวได้");
                                } else {
                                  setBookingForm({
                                    ...getEmptyBookingForm(),
                                    roomId: room.id,
                                    branchId: room.branchId,
                                    date,
                                    timeBlock: b,
                                  });
                                }
                              }}
                              style={{
                                height: ROW_H,
                                background: isBooked ? bookedBg : isClosed ? closedBg : emptyBg,
                                borderRight: "1px solid var(--border)",
                                borderTop: isHourStart ? "2px solid var(--border2)" : undefined,
                                position: "relative", overflow: "hidden",
                                transition: "background 0.1s",
                                cursor: isClosed ? "not-allowed" : "pointer",
                              }}
                            >
                              {/* สัญลักษณ์ปิด / ไม่พร้อม */}
                              {isClosed && isHourStart && (
                                <div style={{ fontSize: 9, color: "var(--text3)", opacity: 0.6, textAlign: "center", userSelect: "none" }}>
                                  ปิด
                                </div>
                              )}
                              {/* ชื่อ + หัตถการ — เฟ้นที่ขึ้นใน block เริ่มต้น */}
                              {q?.isStart && (
                                <div style={{
                                  position: "absolute", inset: "2px 4px",
                                  display: "flex", flexDirection: "column", justifyContent: "center",
                                  overflow: "hidden",
                                }}>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: isOverdue ? "#b45309" : isCourse ? "#92400e" : isM ? "#991b1b" : "#166534", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {isOverdue ? "⚠️ " : ""}{q.name}
                                  </div>
                                  {q.procName && (
                                    <div title={q.promoName ? `${q.procName} · ${q.promoName}` : q.procName} style={{ fontSize: 9, color: isCourse ? "#b45309" : isM ? "#b91c1c" : "#166534", opacity: 0.8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                      {q.procName}{q.promoName ? ` · ${q.promoName}` : ""}
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  });
                })}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          {/* มือถือ: ย่อชื่อให้สีทั้งหกอยู่บรรทัดเดียว แล้ววิธีใช้อีกบรรทัด = จบใน 2 บรรทัด
              (เดิมชื่อยาวทำให้ตกเป็น 3 บรรทัด กินที่ตารางไปเปล่า ๆ) */}
          <div style={{ display: "flex", gap: isMobile ? 8 : 12, padding: isMobile ? "6px 8px" : "8px 12px", borderTop: "1px solid var(--border)", background: "var(--surface2)", flexWrap: "wrap", alignItems: "center" }}>
            {(isMobile
              ? [["#fde8e8","M"],["#dcfce7","T"],["#fef9c3","คอร์ส"],["rgba(217,119,6,0.2)","เลยเวลา"],["var(--surface3)","ปิด"],["transparent","ว่าง"]]
              : [["#fde8e8","มีคิว (M)"],["#dcfce7","มีคิว (T)"],["#fef9c3","ใช้คอร์ส"],["rgba(217,119,6,0.2)","เลยเวลายืนยัน"],["var(--surface3)","ปิด / ไม่พร้อม"],["transparent","ว่าง"]]
            ).map(([c, l]) => (
              <span key={l} style={{ display: "flex", alignItems: "center", gap: isMobile ? 3 : 4, fontSize: isMobile ? 10 : 11, fontWeight: isMobile ? 700 : 400, color: "var(--text2)", whiteSpace: "nowrap" }}>
                <span style={{ width: isMobile ? 11 : 12, height: isMobile ? 11 : 12, borderRadius: 3, background: c, border: "1px solid var(--border2)", display: "inline-block", flexShrink: 0 }} />{l}
              </span>
            ))}
            <span style={{ fontSize: isMobile ? 10 : 11, color: "var(--text3)", ...(isMobile ? { width: "100%" } : { marginLeft: "auto" }) }}>
              {isMobile ? "กดช่องว่าง = ลงคิว · กดช่องคิว = ดูรายละเอียด" : "กดช่องว่าง = บันทึกคิว • กดช่องคิว = ดูรายละเอียด"}
            </span>
          </div>
        </div>
      )}

      {/* ─── Popup รายละเอียดคิว ─── */}
      {popup && (
        <>
          <div
            onClick={() => setPopup(null)}
            style={{ position: "fixed", inset: 0, zIndex: 999 }}
          />
          <div style={{
            position: "fixed",
            left: Math.max(8, Math.min(popup.x, window.innerWidth - 288)),
            top: Math.max(8, Math.min(popup.y + 4, window.innerHeight - 300)),
            zIndex: 1000,
            background: "var(--surface)",
            border: "1.5px solid var(--border2)",
            borderRadius: 12,
            boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
            padding: "16px 18px",
            minWidth: 240,
            maxWidth: "min(300px, calc(100vw - 16px))",
            maxHeight: "calc(100dvh - 16px)",
            overflowY: "auto",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>{popup.q.name}</div>
              <button
                onClick={() => setPopup(null)}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "var(--text3)", lineHeight: 1, padding: 0, marginLeft: 8 }}
              >✕</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
              {popup.q.phone && (
                <div style={{ display: "flex", gap: 8 }}>
                  <span style={{ color: "var(--text3)", minWidth: 56 }}>โทร</span>
                  <span style={{ fontWeight: 600 }}>{popup.q.phone}</span>
                </div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <span style={{ color: "var(--text3)", minWidth: 56 }}>ห้อง</span>
                <span style={{ fontWeight: 600, color: popup.room.type === "M" ? "var(--blue)" : "var(--green)" }}>
                  [{popup.room.type}] {popup.room.name}
                </span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <span style={{ color: "var(--text3)", minWidth: 56 }}>เวลา</span>
                <span style={{ fontWeight: 600, fontFamily: "var(--mono)" }}>
                  {blockToTime(popup.q.timeBlock)}
                  {popup.q.dur > 0 && ` — ${blockToTime(popup.q.timeBlock + popup.q.dur)}`}
                </span>
              </div>
              {popup.q.procName && (
                <div style={{ display: "flex", gap: 8 }}>
                  <span style={{ color: "var(--text3)", minWidth: 56 }}>หัตถการ</span>
                  <span style={{ fontWeight: 600 }}>{popup.q.procName}</span>
                </div>
              )}
              {popup.q.promoName && (
                <div style={{ display: "flex", gap: 8 }}>
                  <span style={{ color: "var(--text3)", minWidth: 56 }}>โปร/แพ็ก</span>
                  <span style={{ fontWeight: 600 }}>{popup.q.promoName}</span>
                </div>
              )}
              {popup.q.note && (
                <div style={{ display: "flex", gap: 8 }}>
                  <span style={{ color: "var(--text3)", minWidth: 56 }}>Note</span>
                  <span style={{ color: "var(--text2)" }}>{popup.q.note}</span>
                </div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <span style={{ color: "var(--text3)", minWidth: 56 }}>สถานะ</span>
                <span style={{
                  fontWeight: 700,
                  color: popup.q.status === "done" ? "var(--green)" : popup.q.status === "cancelled" ? "var(--red)" : "var(--amber,#d97706)",
                }}>
                  {popup.q.status === "done" ? "✅ เสร็จ" : popup.q.status === "cancelled" ? "❌ ยกเลิก" : "⏳ รอ"}
                </span>
              </div>
            </div>
            {onEditQueue && (
              <button
                className="btn btn-primary"
                style={{ width: "100%", marginTop: 10, fontSize: 13 }}
                onClick={() => { setPopup(null); onEditQueue(popup.q); }}
              >
                ✏️ แก้ไขคิวนี้
              </button>
            )}
            {onMoveToWaitingQueue && UNCONFIRMED_STATUSES.includes(popup.q.status || "pending") && popup.q.roomId && (
              <button
                title="ปล่อยห้อง/เวลานี้ให้ลงคิวอื่นได้ — ข้อมูลห้อง/เวลาเดิมจะถูกเก็บไว้ในหมายเหตุ"
                style={{
                  width: "100%", marginTop: 8, fontSize: 13, fontWeight: 700,
                  padding: "8px 12px", borderRadius: "var(--radius-sm)", cursor: "pointer",
                  background: "rgba(217,119,6,0.12)", border: "1.5px solid #d97706", color: "#b45309",
                }}
                onClick={() => {
                  // ตัดฟิลด์ enrich ที่เติมมาจาก roomOccupied ออก ให้เหลือคิวดิบแบบเดียวกับหน้าตารางคิว
                  const { procName: _procName, promoName: _promoName, isStart: _isStart, dur: _dur, ...rawQueue } = popup.q;
                  setPopup(null);
                  onMoveToWaitingQueue(rawQueue);
                }}
              >
                ➡️ ย้ายเข้าคิวรอ
              </button>
            )}
          </div>
        </>
      )}
      {/* ─── Mini Booking Popup ─── */}
      {bookingForm && (() => {
        const room = rooms.find((r) => r.id === bookingForm.roomId);
        const branch = branches.find((b) => b.id === bookingForm.branchId);
        // เตียงที่ตั้งค่าแล้วเหลือเฉพาะที่เตียงรับ ที่ยังไม่ตั้งค่าได้ผลเท่ากติกาเดิม M/T
        const roomProcs = room
          ? proceduresForRoom(roomProcedureIndex, room, procedures)
          : procedures;
        const selectedProc = procedures.find((p) => p.id === bookingForm.procedureId);
        const availablePromos = promos.filter((p) => !p.procedureId || p.procedureId === bookingForm.procedureId);
        // โน้ตรายวัน + ป้ายเครื่องของเตียงนี้ — หัวคอลัมน์โชว์ได้แค่บรรทัดเดียว ตรงนี้คือที่เดียวที่อ่านครบ
        const bookingRoomNotes = roomScheduleNotesByRoomId[bookingForm.roomId] || [];
        const bookingRoomLock = room ? roomLockLabel(roomProcedureIndex, room, procedures) : "";
        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }}
            onClick={onBackdropClick}>
            <div style={{ background: "var(--surface)", borderRadius: 16, padding: "22px 26px", minWidth: "min(340px, calc(100vw - 24px))", maxWidth: 440, width: "94%", maxHeight: "92dvh", overflowY: "auto", boxShadow: "0 8px 40px rgba(0,0,0,0.22)" }}
              onClick={(e) => e.stopPropagation()}>

              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: "var(--accent)" }}>📝 บันทึกคิว</div>
                <button onClick={closeBookingForm} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--text3)" }}>✕</button>
              </div>

              {/* Room + Time info */}
              <div style={{ background: "var(--surface2)", borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize: 12, display: "flex", gap: 12, flexWrap: "wrap" }}>
                <span style={{ color: room?.type === "M" ? "var(--blue)" : "var(--green)", fontWeight: 700 }}>
                  [{room?.type}] {room?.name}
                </span>
                <span style={{ color: "var(--text3)" }}>{branch?.name}</span>
                <span style={{ fontFamily: "var(--mono)", fontWeight: 700 }}>⏰ {blockToTime(bookingForm.timeBlock)}</span>
                <span style={{ color: "var(--text3)" }}>📅 {bookingForm.date}</span>
              </div>

              {bookingRoomLock && (
                <div style={{ background: "var(--accent-soft)", border: "1.5px solid var(--accent)", borderRadius: 8, padding: "9px 12px", marginBottom: 14, fontSize: 12.5, fontWeight: 700, color: "var(--accent)", lineHeight: 1.5 }}>
                  🔒 เตียงนี้ลงได้เฉพาะ: {bookingRoomLock}
                </div>
              )}

              {bookingRoomNotes.length > 0 && (
                <div style={{ background: "rgba(220,38,38,0.10)", border: "1.5px solid #dc2626", borderRadius: 8, padding: "9px 12px", marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#b91c1c", marginBottom: 5 }}>📅 โน้ตเตียงนี้วันนี้</div>
                  {bookingRoomNotes.map((note, idx) => (
                    <div key={`${note}_${idx}`} style={{ fontSize: 12.5, fontWeight: 700, color: "#991b1b", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                      • {note}
                    </div>
                  ))}
                </div>
              )}

              {/* Form fields */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, color: "var(--text3)", display: "block", marginBottom: 3 }}>ชื่อลูกค้า *</label>
                    <input style={{ width: "100%", fontSize: 13 }} value={bookingForm.name}
                      onChange={(e) => setBookingForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="ชื่อ-นามสกุล" autoFocus />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, color: "var(--text3)", display: "block", marginBottom: 3 }}>เบอร์โทร *</label>
                    <input style={{ width: "100%", fontSize: 13 }} value={bookingForm.phone}
                      onChange={(e) => setBookingForm((f) => ({ ...f, phone: e.target.value }))}
                      placeholder="0xxxxxxxxx" />
                    <HnLookup
                      phone={bookingForm.phone}
                      name={bookingForm.name}
                      onSelect={(c) => {
                        const fullName = `${c.firstname} ${c.lastname}`.trim();
                        setBookingForm((f) => ({
                          ...f,
                          name: fullName || f.name,
                          phone: c.telephone || f.phone,
                          customerType: "old",
                        }));
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: 11, color: "var(--text3)", display: "block", marginBottom: 3 }}>หัตถการ</label>
                  <select style={{ width: "100%", fontSize: 13 }} value={bookingForm.procedureId}
                    onChange={(e) => setBookingForm((f) => ({ ...f, procedureId: e.target.value, promoId: "", price: "" }))}>
                    <option value="">— เลือกหัตถการ —</option>
                    {roomProcs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>

                {availablePromos.length > 0 && (
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text3)", display: "block", marginBottom: 3 }}>โปร/แพ็กเกจ</label>
                    <select style={{ width: "100%", fontSize: 13 }} value={bookingForm.promoId}
                      onChange={(e) => {
                        const promo = promos.find((p) => p.id === e.target.value);
                        setBookingForm((f) => ({ ...f, promoId: e.target.value, price: promo?.price ?? f.price }));
                      }}>
                      <option value="">— ไม่ระบุ —</option>
                      {availablePromos.map((p) => <option key={p.id} value={p.id}>{p.name}{p.price ? ` (฿${p.price.toLocaleString()})` : ""}</option>)}
                    </select>
                  </div>
                )}

                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, color: "var(--text3)", display: "block", marginBottom: 3 }}>ราคา (บาท)</label>
                    <input type="number" style={{ width: "100%", fontSize: 13 }} value={bookingForm.price}
                      onChange={(e) => setBookingForm((f) => ({ ...f, price: e.target.value }))}
                      placeholder="0" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, color: "var(--text3)", display: "block", marginBottom: 3 }}>ประเภทลูกค้า</label>
                    <select style={{ width: "100%", fontSize: 13 }} value={bookingForm.customerType}
                      onChange={(e) => setBookingForm((f) => ({ ...f, customerType: e.target.value }))}>
                      <option value="new">ลูกค้าใหม่</option>
                      <option value="old">ลูกค้าเก่า</option>
                      <option value="course">ใช้คอร์ส</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: 11, color: "var(--text3)", display: "block", marginBottom: 3 }}>Note</label>
                  <input style={{ width: "100%", fontSize: 13 }} value={bookingForm.note}
                    onChange={(e) => setBookingForm((f) => ({ ...f, note: e.target.value }))}
                    placeholder="หมายเหตุ (ถ้ามี)" />
                </div>
              </div>

              {outsideTapHint && (
                <div style={{ marginTop: 12, padding: "8px 12px", borderRadius: 8, border: "1.5px solid #d97706", background: "rgba(217,119,6,0.12)", color: "#b45309", fontSize: 12, fontWeight: 700, lineHeight: 1.5 }}>
                  ข้อมูลที่กรอกไว้ยังอยู่ครบ — กดนอกกรอบไม่ปิดฟอร์มแล้ว ถ้าจะทิ้งให้กด ยกเลิก
                </div>
              )}

              {/* Actions */}
              <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
                <button className="btn btn-secondary" onClick={closeBookingForm}>ยกเลิก</button>
                <button
                  className="btn btn-primary"
                  disabled={saving || !bookingForm.name.trim() || !bookingForm.phone.trim()}
                  onClick={async () => {
                    if (!onSubmitBooking) return;
                    const submission = await runBookingSubmit(() => onSubmitBooking(bookingForm));
                    if (submission.started && submission.result) setBookingForm(null);
                  }}
                >
                  {saving ? "กำลังบันทึก..." : "✅ บันทึกคิว"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
