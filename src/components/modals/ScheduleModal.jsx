import { useState, useMemo } from "react";
import { ModalHeader, ModalBody, ModalFooter } from "../Modal";
import { blockToTime, getTodayStr, formatThaiDate, isActiveQueueStatus } from "../../utils/helpers";
import { addDays } from "../../utils/queueRanges";
import { roomTypeMeta } from "../../utils/constants";
import {
  buildScheduleTiming, findQueuesInClosure, formatBlockDuration,
  DEFAULT_CLOSE_START_BLOCK, DEFAULT_CLOSE_END_BLOCK,
} from "../../utils/scheduleClosure";
import { planOpenOnly, summarizeOpenOnlyPlan, findQueuesOutsideOpenWindow, describeOpenOnlyBed } from "../../utils/scheduleOpenOnly";

// ค่าเริ่มต้นตอนเลือก "เปิดเฉพาะช่วงเวลา" ครั้งแรก: 13:00–18:00 (หมอเข้าบ่าย ที่เจอบ่อย)
const DEFAULT_OPEN_ONLY_START = 156;
const DEFAULT_OPEN_ONLY_END = 216;

const DAY_NAMES = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const DAY_NAMES_FULL = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์", "เสาร์"];
const MONTH_NAMES_TH = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];

function MiniCalendar({ selectedDates, onChange }) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-indexed

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  function toDateStr(d) {
    return `${viewYear}-${String(viewMonth + 1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
  }

  function toggleDay(d) {
    const s = toDateStr(d);
    onChange(selectedDates.includes(s) ? selectedDates.filter(x => x !== s) : [...selectedDates, s]);
  }

  function selectAll() {
    const all = [];
    for (let d = 1; d <= daysInMonth; d++) all.push(toDateStr(d));
    const existing = selectedDates.filter(s => !s.startsWith(`${viewYear}-${String(viewMonth+1).padStart(2,"0")}`));
    onChange([...existing, ...all]);
  }

  function clearMonth() {
    onChange(selectedDates.filter(s => !s.startsWith(`${viewYear}-${String(viewMonth+1).padStart(2,"0")}`)));
  }

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }

  const monthSelectedCount = selectedDates.filter(s => s.startsWith(`${viewYear}-${String(viewMonth+1).padStart(2,"0")}`)).length;

  return (
    <div style={{ userSelect: "none" }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <button onClick={prevMonth} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "var(--accent)", padding: "0 6px" }}>‹</button>
        <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>
          {MONTH_NAMES_TH[viewMonth]} {viewYear + 543}
        </span>
        <button onClick={nextMonth} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "var(--accent)", padding: "0 6px" }}>›</button>
      </div>
      {/* quick actions */}
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <button onClick={selectAll} className="btn btn-sm btn-secondary" style={{ fontSize: 11, padding: "2px 8px" }}>เลือกทั้งเดือน</button>
        <button onClick={clearMonth} className="btn btn-sm btn-secondary" style={{ fontSize: 11, padding: "2px 8px" }}>ล้างเดือนนี้</button>
        {monthSelectedCount > 0 && (
          <span style={{ fontSize: 11, color: "var(--accent)", fontWeight: 700, alignSelf: "center" }}>
            เลือก {monthSelectedCount} วัน
          </span>
        )}
      </div>
      {/* day headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 2 }}>
        {DAY_NAMES.map((n, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: i === 0 ? "#dc2626" : i === 6 ? "var(--blue)" : "var(--text3)", padding: "2px 0" }}>{n}</div>
        ))}
      </div>
      {/* cells */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
        {cells.map((d, idx) => {
          if (!d) return <div key={idx} />;
          const ds = toDateStr(d);
          const selected = selectedDates.includes(ds);
          // เทียบ "วันนี้" ด้วยเวลาไทย — toISOString() เป็น UTC ช่วงเที่ยงคืนถึงเจ็ดโมงเช้า
          // ปฏิทินจะไฮไลต์ผิดวัน (ไปเน้นเมื่อวานแทน)
          const isToday = ds === getTodayStr();
          const isSun = (idx % 7) === 0;
          const isSat = (idx % 7) === 6;
          return (
            <button
              key={idx}
              onClick={() => toggleDay(d)}
              style={{
                aspectRatio: "1", width: "100%", minWidth: 0,
                borderRadius: 6, border: selected ? "2px solid var(--accent)" : isToday ? "2px solid var(--accent)" : "1.5px solid var(--border)",
                background: selected ? "var(--accent)" : isToday ? "var(--accent-soft)" : "var(--surface)",
                color: selected ? "#fff" : isSun ? "#dc2626" : isSat ? "var(--blue)" : "var(--text)",
                fontWeight: selected || isToday ? 700 : 400,
                fontSize: 12, cursor: "pointer", padding: 0,
                transition: "all 0.1s",
              }}
            >
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function generateDates(repeatMode, singleDate, weekStart, monthYear, weekdays) {
  if (repeatMode === "single") return singleDate ? [singleDate] : [];
  if (repeatMode === "weekly") {
    if (!weekStart) return [];
    // คิดวันบนสตริง "YYYY-MM-DD" ล้วน — เดิมอ่านกลับด้วย toISOString() (UTC) ซึ่งได้ผล
    // ถูกเฉพาะโซนเวลาบวกอย่างไทย ย้ายมาใช้ addDays ที่คิดด้วยเวลาเครื่อง ไม่ต้องลุ้น
    const [wy, wm, wd] = weekStart.split("-").map(Number);
    const start = new Date(wy, wm - 1, wd); // เวลาเครื่องล้วน — new Date("YYYY-MM-DD") ตีเป็น UTC
    const mondayStr = addDays(weekStart, -((start.getDay() + 6) % 7));
    const dates = [];
    for (let i = 0; i < 7; i++) dates.push(addDays(mondayStr, i));
    return dates;
  }
  if (repeatMode === "monthly") {
    if (!monthYear) return [];
    const [y, m] = monthYear.split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const dates = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dd = String(d).padStart(2, "0");
      const mm = String(m).padStart(2, "0");
      dates.push(`${y}-${mm}-${dd}`);
    }
    return dates;
  }
  if (repeatMode === "weekdays") {
    if (!monthYear || weekdays.length === 0) return [];
    const [y, m] = monthYear.split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const dates = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(y, m - 1, d);
      if (weekdays.includes(date.getDay())) {
        const dd = String(d).padStart(2, "0");
        const mm = String(m).padStart(2, "0");
        dates.push(`${y}-${mm}-${dd}`);
      }
    }
    return dates;
  }
  return [];
}

const STEP = 6; // 30 นาที = 6 บล็อค
const SPINNER_MIN_BLOCK = 0;   // 00:00
const SPINNER_MAX_BLOCK = 288; // 24:00

function TimeSpinner({ label, value, onChange }) {
  const atMin = value <= SPINNER_MIN_BLOCK;
  const atMax = value >= SPINNER_MAX_BLOCK;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label className="form-label">{label}</label>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => !atMin && onChange(Math.max(SPINNER_MIN_BLOCK, value - STEP))}
          disabled={atMin}
          style={{ fontSize: 16, padding: "4px 10px", lineHeight: 1 }}
        >−</button>
        <div style={{
          fontFamily: "var(--mono)", fontWeight: 700, fontSize: 18,
          minWidth: 64, textAlign: "center", color: "var(--text)",
          background: "var(--surface2)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)", padding: "6px 8px",
        }}>
          {blockToTime(value)}
        </div>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => !atMax && onChange(Math.min(SPINNER_MAX_BLOCK, value + STEP))}
          disabled={atMax}
          style={{ fontSize: 16, padding: "4px 10px", lineHeight: 1 }}
        >+</button>
      </div>
    </div>
  );
}

export default function ScheduleModal({ data, rooms, branches, queues = [], procedures = [], roomSchedules = [], onSave, onApplyOpenOnly, onClose }) {
  const [filterBranchId, setFilterBranchId] = useState(
    data?.roomId ? (rooms.find((r) => r.id === data.roomId)?.branchId || "") : ""
  );
  const [selectedRoomIds, setSelectedRoomIds] = useState(
    data?.roomId ? [data.roomId] : []
  );
  // repeat mode
  const isEdit = !!data?.id;
  const [repeatMode, setRepeatMode] = useState("single");
  const [date, setDate] = useState(data?.date || "");
  const [weekStart, setWeekStart] = useState("");
  // เดือนเริ่มต้นของโหมดรายเดือน — เวลาไทยเช่นกัน ไม่งั้นเช้าวันที่ 1 จะเปิดมาเป็นเดือนก่อน
  const todayYM = getTodayStr().slice(0, 7);
  const [monthYear, setMonthYear] = useState(todayYM);
  const [weekdays, setWeekdays] = useState([]);
  const [pickedDates, setPickedDates] = useState([]); // สำหรับ calendar mode
  const [available, setAvailable] = useState(data?.available !== undefined ? data.available : false);
  const [noteOnly, setNoteOnly] = useState(data?.noteOnly || false);
  // ปิดเฉพาะช่วงเวลา (เช่น ปิด 11:00–17:00 ช่วงที่หมอยังไม่มา) — เวลาเปิดปกติของเตียงไม่เปลี่ยน
  const [closeRange, setCloseRange] = useState(
    !!data && data.available === false && data.startBlock !== null && data.startBlock !== undefined
  );
  const [startBlock, setStartBlock] = useState(data?.startBlock ?? 108); // 09:00
  const [endBlock, setEndBlock] = useState(data?.endBlock ?? 132);       // 11:00
  const [note, setNote] = useState(data?.note || "");
  // 🕐 เปิดเฉพาะช่วงเวลา = ปุ่มสถานะแยก (นอกช่วงปิดให้เอง แทนที่ช่วงเดิมของเตียงวันนั้น)
  // ไม่เป็นค่าเริ่มต้นของอะไรเลย — ⛔ / ✅ / 📝 และการแก้แถวเดิม ทำงานเหมือนก่อนมีปุ่มนี้ทุกอย่าง
  const [openOnly, setOpenOnly] = useState(false);
  // แก้แถว "ใช้ทุกวัน" (ไม่มีวันที่) → เปิดเฉพาะช่วงต้องมีวันจริง จึงไม่ให้เลือก
  const canOpenOnly = !!onApplyOpenOnly && !(isEdit && !date);

  const filteredRooms = useMemo(() => {
    if (!filterBranchId) return rooms;
    return rooms.filter((r) => r.branchId === filterBranchId);
  }, [filterBranchId, rooms]);

  function toggleRoom(roomId) {
    setSelectedRoomIds((prev) =>
      prev.includes(roomId) ? prev.filter((id) => id !== roomId) : [...prev, roomId]
    );
  }

  function selectAll() {
    setSelectedRoomIds(filteredRooms.map((r) => r.id));
  }

  const generatedDates = useMemo(() => {
    if (repeatMode === "calendar") return [...pickedDates].sort();
    return generateDates(repeatMode, date, weekStart, monthYear, weekdays);
  }, [repeatMode, date, weekStart, monthYear, weekdays, pickedDates]);

  function toggleWeekday(d) {
    setWeekdays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]);
  }

  const isClosing = !noteOnly && !available;
  const showTimeRange = !noteOnly && (available || closeRange);
  const isOpenOnly = !noteOnly && available && openOnly && canOpenOnly;
  const saveDates = useMemo(() => (isEdit ? [date] : generatedDates), [isEdit, date, generatedDates]);

  const openOnlyPlan = useMemo(() => {
    if (!isOpenOnly) return null;
    return planOpenOnly({ rooms, roomSchedules, roomIds: selectedRoomIds, dates: saveDates, startBlock, endBlock, note, editingId: data?.id ?? null });
  }, [isOpenOnly, rooms, roomSchedules, selectedRoomIds, saveDates, startBlock, endBlock, note, data?.id]);
  const openOnlySummary = useMemo(() => (openOnlyPlan ? summarizeOpenOnlyPlan(openOnlyPlan) : null), [openOnlyPlan]);

  // คิวที่ยังค้างอยู่ในช่วงที่จะปิด — ปิดได้ แต่คิวไม่ถูกย้าย ต้องให้หน้าร้านจัดการเอง
  const affectedQueues = useMemo(() => {
    if (isOpenOnly) {
      return findQueuesOutsideOpenWindow({ plan: openOnlyPlan, queues, procedures, startBlock, endBlock, isActiveQueueStatus });
    }
    if (!isClosing) return [];
    return findQueuesInClosure({
      queues, procedures, roomIds: selectedRoomIds, dates: saveDates,
      startBlock: closeRange ? startBlock : null,
      endBlock: closeRange ? endBlock : null,
      isActiveQueueStatus,
    });
  }, [isOpenOnly, openOnlyPlan, isClosing, queues, procedures, selectedRoomIds, saveDates, closeRange, startBlock, endBlock]);

  function handleSave() {
    if (selectedRoomIds.length === 0) return;
    if (generatedDates.length === 0 && !isEdit) return;
    if (isOpenOnly) {
      const sum = openOnlySummary;
      if (!sum || sum.bedDays === 0) {
        window.alert(sum?.blocked?.length ? "ทุกเตียง-วันที่เลือกเปิดไม่ได้ — ดูเหตุผลในกล่อง \"ข้าม\" ในฟอร์ม" : "ยังไม่ได้เลือกเตียง/วันที่");
        return;
      }
      const lines = [`เปิดเฉพาะ ${blockToTime(startBlock)}–${blockToTime(endBlock)} · ${sum.bedDays} เตียง-วัน`];
      const results = [...new Set(openOnlyPlan.beds.filter((b) => !b.blocked).map(describeOpenOnlyBed))];
      lines.push(`ผล: ${results.slice(0, 3).join(" / ")}${results.length > 3 ? " ..." : ""}`);
      if (sum.removeCount > 0) lines.push(`จะแทนที่ช่วงปิด/เปิดเดิม ${sum.removeCount} รายการ (ลบของเดิมออก)`);
      if (sum.blocked.length > 0) lines.push(`ข้าม ${sum.blocked.length} เตียง-วัน (ดูเหตุผลในฟอร์ม)`);
      if (affectedQueues.length > 0) lines.push(`มีคิว ${affectedQueues.length} คิวอยู่นอกช่วงที่เปิด — คิวไม่ถูกย้าย ต้องไปเลื่อน/ย้ายเอง`);
      if (!window.confirm(`${lines.join("\n")}\n\nยืนยันหรือไม่?`)) return;
      return onApplyOpenOnly(openOnlyPlan);
    }
    if (affectedQueues.length > 0) {
      const ok = window.confirm(
        `มีคิว ${affectedQueues.length} คิวอยู่ในช่วงที่จะปิด\n` +
        "ปิดแล้วคิวเหล่านี้ไม่ถูกย้ายหรือยกเลิกให้ ต้องไปเลื่อน/ย้ายเอง\n\nยืนยันปิดหรือไม่?"
      );
      if (!ok) return;
    }
    return onSave({
      id: data?.id,
      roomIds: selectedRoomIds,
      dates: saveDates,
      ...buildScheduleTiming({ noteOnly, available, closeRange, startBlock, endBlock }),
      noteOnly,
      note: note.trim(),
    });
  }

  function chooseOpenOnly() {
    const already = isOpenOnly;
    setNoteOnly(false);
    setAvailable(true);
    setOpenOnly(true);
    // เข้าโหมดนี้ครั้งแรก — ตั้ง 13:00–18:00 (กดซ้ำไม่ล้างเวลาที่กรอกไว้)
    // แก้แถว "เปิด" ที่มีช่วงเวลา → ใช้เวลาเดิม; แก้แถว "ปิดช่วง" → ไม่ใช้ เพราะช่วงปิดคือเวลาที่หมอ "ไม่อยู่"
    if (!already && !(data?.available === true && data?.startBlock != null)) {
      setStartBlock(DEFAULT_OPEN_ONLY_START);
      setEndBlock(DEFAULT_OPEN_ONLY_END);
    }
  }

  function chooseCloseRange(next) {
    setCloseRange(next);
    // เปิดโหมดช่วงเวลาครั้งแรก — ตั้งค่าเริ่มต้นเป็นช่วงที่หมอเข้าเย็นบ่อยสุด (11:00–17:00)
    if (next && !(data?.startBlock != null && data?.available === false)) {
      setStartBlock(DEFAULT_CLOSE_START_BLOCK);
      setEndBlock(DEFAULT_CLOSE_END_BLOCK);
    }
  }

  const duration = endBlock - startBlock;

  return (
    <>
      <ModalHeader title={data ? "✏️ แก้ไขตาราง" : "➕ เพิ่มตารางพิเศษ"} onClose={onClose} />
      <ModalBody>
        <div className="form-grid">

          {/* กรองสาขา */}
          <div className="form-group">
            <label className="form-label">กรองสาขา</label>
            <select
              value={filterBranchId}
              onChange={(e) => { setFilterBranchId(e.target.value); setSelectedRoomIds([]); }}
            >
              <option value="">ทุกสาขา</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>

          {/* repeat mode */}
          {!isEdit && (
            <div className="form-group full">
              <label className="form-label">รูปแบบวันที่</label>
              <div className="type-options">
                {[
                  { value: "single", label: "📅 ทีละวัน" },
                  { value: "calendar", label: "🗓 เลือกในปฏิทิน" },
                  { value: "weekly", label: "📆 ทั้งสัปดาห์" },
                  { value: "monthly", label: "ทั้งเดือน" },
                  { value: "weekdays", label: "🔁 ทุกวัน X" },
                ].map((m) => (
                  <button
                    key={m.value}
                    className={`type-option ${repeatMode === m.value ? "selected" : ""}`}
                    onClick={() => setRepeatMode(m.value)}
                    style={repeatMode === m.value ? { borderColor: "var(--accent)", background: "var(--accent)", color: "#fff" } : {}}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* calendar picker */}
          {!isEdit && repeatMode === "calendar" && (
            <div className="form-group full">
              <label className="form-label">
                เลือกวันที่ต้องการ
                {pickedDates.length > 0 && (
                  <span style={{ marginLeft: 8, fontSize: 11, color: "var(--accent)", fontWeight: 700 }}>
                    เลือกแล้ว {pickedDates.length} วัน
                  </span>
                )}
                {pickedDates.length > 0 && (
                  <button
                    onClick={() => setPickedDates([])}
                    style={{ marginLeft: 8, fontSize: 11, padding: "1px 7px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface2)", cursor: "pointer", color: "var(--text2)" }}
                  >
                    ล้างทั้งหมด
                  </button>
                )}
              </label>
              <MiniCalendar selectedDates={pickedDates} onChange={setPickedDates} />
            </div>
          )}

          {/* วันที่ */}
          {(isEdit || repeatMode === "single") && (
            <div className="form-group">
              <label className="form-label">วันที่ (เว้นว่าง = ทุกวัน)</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          )}
          {!isEdit && repeatMode === "weekly" && (
            <div className="form-group">
              <label className="form-label">เลือกวันในสัปดาห์ที่ต้องการ</label>
              <input type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} />
              {weekStart && (
                <span style={{ fontSize: 11, color: "var(--text3)", marginTop: 4, display: "block" }}>
                  จะสร้างตาราง {generatedDates.length} วัน ({generatedDates[0]} ถึง {generatedDates[generatedDates.length - 1]})
                </span>
              )}
            </div>
          )}
          {!isEdit && (repeatMode === "monthly" || repeatMode === "weekdays") && (
            <div className="form-group">
              <label className="form-label">เดือน</label>
              <input type="month" value={monthYear} onChange={(e) => setMonthYear(e.target.value)} />
            </div>
          )}
          {!isEdit && repeatMode === "weekdays" && (
            <div className="form-group full">
              <label className="form-label">เลือกวัน</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {DAY_NAMES.map((name, i) => (
                  <button
                    key={i}
                    onClick={() => toggleWeekday(i)}
                    style={{
                      padding: "5px 12px", borderRadius: 20, fontSize: 13, fontWeight: 700,
                      border: `1.5px solid ${weekdays.includes(i) ? "var(--accent)" : "var(--border)"}`,
                      background: weekdays.includes(i) ? "var(--accent)" : "var(--surface2)",
                      color: weekdays.includes(i) ? "#fff" : "var(--text2)",
                      cursor: "pointer",
                    }}
                  >
                    {name}
                  </button>
                ))}
              </div>
              {generatedDates.length > 0 && (
                <span style={{ fontSize: 11, color: "var(--accent)", marginTop: 4, display: "block", fontWeight: 600 }}>
                  จะสร้าง {generatedDates.length} วัน ทุกวัน{weekdays.map((d) => DAY_NAMES_FULL[d]).join(", ")} ในเดือนที่เลือก
                </span>
              )}
            </div>
          )}
          {!isEdit && repeatMode === "monthly" && monthYear && (
            <div className="form-group">
              <span style={{ fontSize: 11, color: "var(--accent)", fontWeight: 600 }}>
                จะสร้างตาราง {generatedDates.length} วัน ครอบทั้งเดือน
              </span>
            </div>
          )}

          {/* เลือกห้อง (multi-select checkboxes) */}
          <div className="form-group full">
            <label className="form-label" style={{ marginBottom: 6 }}>
              เลือกห้อง
              <button
                className="btn btn-sm btn-secondary"
                onClick={selectAll}
                style={{ marginLeft: 10, padding: "2px 8px", fontSize: 11 }}
              >
                เลือกทั้งหมด
              </button>
              <span style={{ marginLeft: 8, fontSize: 11, color: "var(--text3)" }}>
                เลือก {selectedRoomIds.length}/{filteredRooms.length} ห้อง
              </span>
            </label>
            <div style={{
              display: "flex", flexWrap: "wrap", gap: 6,
              background: "var(--surface2)", borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)", padding: "10px 12px",
              maxHeight: 160, overflowY: "auto",
            }}>
              {filteredRooms.length === 0 && (
                <span style={{ fontSize: 12, color: "var(--text3)" }}>กรุณาเลือกสาขาก่อน</span>
              )}
              {filteredRooms.map((r) => {
                const br = branches.find((b) => b.id === r.branchId);
                const checked = selectedRoomIds.includes(r.id);
                const typeMeta = roomTypeMeta(r.type);
                return (
                  <label
                    key={r.id}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      padding: "5px 10px", borderRadius: 20, cursor: "pointer",
                      border: `1.5px solid ${checked ? typeMeta.color : "var(--border)"}`,
                      background: checked ? typeMeta.soft : "var(--surface)",
                      fontSize: 12, fontWeight: checked ? 700 : 500,
                      color: checked ? typeMeta.color : "var(--text2)",
                      transition: "all 0.15s",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleRoom(r.id)}
                      style={{ display: "none" }}
                    />
                    <span style={{ fontFamily: "var(--mono)", fontWeight: 700 }}>{r.name}</span>
                    <span style={{ fontSize: 10, color: "inherit", opacity: 0.7 }}>{br?.name}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* สถานะ */}
          <div className="form-group full">
            <label className="form-label">สถานะ</label>
            <div className="type-options">
              <button
                className={`type-option ${!noteOnly && !available ? "selected" : ""}`}
                onClick={() => { setNoteOnly(false); setAvailable(false); setOpenOnly(false); }}
                style={!noteOnly && !available ? { borderColor: "var(--red)", background: "var(--red)", color: "#fff" } : {}}
              >
                ⛔ ปิด / ไม่พร้อม
              </button>
              <button
                className={`type-option ${!noteOnly && available && !isOpenOnly ? "selected" : ""}`}
                onClick={() => { setNoteOnly(false); setAvailable(true); setOpenOnly(false); }}
                style={!noteOnly && available && !isOpenOnly ? { borderColor: "var(--green)", background: "var(--green)", color: "#fff" } : {}}
              >
                ✅ เปิด (กำหนดช่วงเวลา)
              </button>
              {canOpenOnly && (
                <button
                  className={`type-option ${isOpenOnly ? "selected" : ""}`}
                  onClick={chooseOpenOnly}
                  style={isOpenOnly ? { borderColor: "var(--green)", background: "var(--green)", color: "#fff" } : {}}
                >
                  🕐 เปิดเฉพาะช่วงเวลา
                </button>
              )}
              <button
                className={`type-option ${noteOnly ? "selected" : ""}`}
                onClick={() => { setNoteOnly(true); setOpenOnly(false); }}
                style={noteOnly ? { borderColor: "#b45309", background: "#b45309", color: "#fff" } : {}}
              >
                📝 Note เท่านั้น
              </button>
            </div>
            {noteOnly && (
              <div style={{ marginTop: 6, fontSize: 11, color: "#b45309", fontWeight: 600 }}>
                ไม่เปลี่ยนช่วงเวลารับคิว — แค่แสดงหมายเหตุในหน้าบันทึกคิว
              </div>
            )}
            {isOpenOnly && (
              <div style={{ marginTop: 6, fontSize: 11, color: "var(--green)", fontWeight: 600, lineHeight: 1.5 }}>
                💡 เตียงเปิดรับคิวเฉพาะช่วงที่เลือก นอกช่วงปิดให้เอง (เลยเวลาปกติก็ต่อเวลาให้)<br />
                ตัวอย่าง: หมอเข้า 13:00–18:00 → ตั้ง <b>13:00–18:00</b> ครั้งเดียว ไม่ต้องปิดเช้า/ปิดเย็นแยก<br />
                ช่วงปิด/เปิดที่เคยกรอกไว้ของเตียงวันนั้นจะถูกแทนที่ (ไม่แตะ ปิดเตียง พนักงานหยุด / ปิดทั้งวัน)
              </div>
            )}
            {!noteOnly && available && !isOpenOnly && (
              <div style={{ marginTop: 6, fontSize: 11, color: "var(--green)", fontWeight: 600, lineHeight: 1.5 }}>
                💡 ใช้ต่อเวลาเปิดให้ยาวกว่าปกติเท่านั้น (ย่นเวลาไม่ได้)<br />
                ตัวอย่าง: ห้องเปิดปกติ 11:00–20:00 อยากต่อเวลาเป็น 22:00 → ตั้ง <b>11:00–22:00</b><br />
                หมอมาช้า/กลับก่อน → ใช้ <b>เปิดเฉพาะช่วงเวลา</b> หรือ <b>⛔ ปิด / ไม่พร้อม → ปิดเฉพาะช่วงเวลา</b>
              </div>
            )}
            {isClosing && (
              <div className="type-options" style={{ marginTop: 8 }}>
                <button
                  className={`type-option ${!closeRange ? "selected" : ""}`}
                  onClick={() => chooseCloseRange(false)}
                  style={!closeRange ? { borderColor: "var(--red)", background: "var(--red-soft)", color: "var(--red)" } : {}}
                >
                  ปิดทั้งวัน
                </button>
                <button
                  className={`type-option ${closeRange ? "selected" : ""}`}
                  onClick={() => chooseCloseRange(true)}
                  style={closeRange ? { borderColor: "var(--red)", background: "var(--red-soft)", color: "var(--red)" } : {}}
                >
                  ปิดเฉพาะช่วงเวลา
                </button>
              </div>
            )}
            {isClosing && closeRange && (
              <div style={{ marginTop: 6, fontSize: 11, color: "var(--red)", fontWeight: 600, lineHeight: 1.5 }}>
                💡 เวลาเปิดปกติของห้องไม่เปลี่ยน ปิดเฉพาะช่วงที่เลือก<br />
                ตัวอย่าง: หมอเข้า 17:00 → ปิด <b>11:00–17:00</b>
              </div>
            )}
          </div>

          {/* Time spinner — ซ่อนเมื่อ noteOnly หรือ ปิดทั้งวัน */}
          {showTimeRange && (
            <>
              <div className="form-group">
                <TimeSpinner
                  label={isOpenOnly ? "เปิดตั้งแต่" : available ? "เวลาเปิดเริ่ม" : "ปิดตั้งแต่"}
                  value={startBlock}
                  onChange={(v) => { setStartBlock(v); if (v >= endBlock) setEndBlock(v + STEP); }}
                />
              </div>
              <div className="form-group">
                <TimeSpinner
                  label={isOpenOnly ? "เปิดถึง" : available ? "เวลาปิด" : "ปิดถึง"}
                  value={endBlock}
                  onChange={(v) => { setEndBlock(v); if (v <= startBlock) setStartBlock(v - STEP); }}
                />
              </div>
              {/* Duration summary */}
              {duration > 0 && (
                <div className="form-group full">
                  <div style={{
                    padding: "8px 12px", borderRadius: "var(--radius-sm)",
                    background: available ? "var(--green-soft)" : "var(--red-soft)",
                    border: `1px solid ${available ? "rgba(58,125,92,0.2)" : "rgba(192,57,43,0.2)"}`,
                    fontSize: 12, fontWeight: 600,
                    color: available ? "var(--green)" : "var(--red)",
                    display: "flex", gap: 12, alignItems: "center",
                  }}>
                    <span>{isOpenOnly ? "✅ เปิดเฉพาะ" : available ? "✅ เปิด" : "⛔ ปิด"}</span>
                    <span style={{ fontFamily: "var(--mono)" }}>
                      {blockToTime(startBlock)} — {blockToTime(endBlock)}
                    </span>
                    <span style={{ color: "var(--text3)", fontWeight: 500 }}>
                      ({formatBlockDuration(duration)})
                    </span>
                  </div>
                </div>
              )}
            </>
          )}

          {/* คิวที่ค้างในช่วงที่จะปิด */}
          {affectedQueues.length > 0 && (
            <div className="form-group full">
              <div style={{
                padding: "8px 12px", borderRadius: "var(--radius-sm)",
                background: "var(--red-soft)", border: "1px solid rgba(192,57,43,0.25)",
                fontSize: 12, color: "var(--red)", lineHeight: 1.6,
              }}>
                <div style={{ fontWeight: 700 }}>
                  ⚠️ มีคิว {affectedQueues.length} คิว{isOpenOnly ? "อยู่นอกช่วงที่เปิด — บันทึกได้" : "อยู่ในช่วงที่จะปิด — ปิดได้"} แต่คิวไม่ถูกย้ายให้
                </div>
                {affectedQueues.slice(0, 8).map((q) => {
                  const room = rooms.find((r) => r.id === q.roomId);
                  return (
                    <div key={q.id} style={{ color: "var(--text2)" }}>
                      {formatThaiDate(q.date)} {q.timeBlock != null ? blockToTime(q.timeBlock) : ""} · {room?.name || ""} · {q.name || "-"}
                    </div>
                  );
                })}
                {affectedQueues.length > 8 && (
                  <div style={{ color: "var(--text3)" }}>และอีก {affectedQueues.length - 8} คิว</div>
                )}
              </div>
            </div>
          )}

          {/* เปิดเฉพาะช่วง: สิ่งที่จะถูกแทนที่ / เตียงที่ข้าม */}
          {isOpenOnly && openOnlySummary && openOnlyPlan.beds.length > 0 && (
            <div className="form-group full">
              <div style={{
                padding: "8px 12px", borderRadius: "var(--radius-sm)",
                background: "var(--surface2, #f7f5f2)", border: "1px solid var(--border, #e5e0d8)",
                fontSize: 12, color: "var(--text2)", lineHeight: 1.6,
              }}>
                <div style={{ fontWeight: 700, color: "var(--green)" }}>📋 ผลที่จะได้</div>
                {openOnlyPlan.beds.filter((b) => !b.blocked).slice(0, 8).map((b) => {
                  const room = rooms.find((r) => r.id === b.roomId);
                  return (
                    <div key={`r|${b.roomId}|${b.date}`}>
                      {formatThaiDate(b.date)} · {room?.name || ""} · เปิด {blockToTime(startBlock)}–{blockToTime(endBlock)} ({describeOpenOnlyBed(b)})
                    </div>
                  );
                })}
                {openOnlySummary.bedDays > 8 && (
                  <div style={{ color: "var(--text3)" }}>และอีก {openOnlySummary.bedDays - 8} เตียง-วัน</div>
                )}
                {openOnlySummary.removeCount > 0 && (
                  <>
                    <div style={{ fontWeight: 700, color: "var(--text)", marginTop: 6 }}>
                      🔁 จะแทนที่ช่วงเวลาเดิม {openOnlySummary.removeCount} รายการ
                    </div>
                    {openOnlySummary.replaced.slice(0, 8).map((s) => {
                      const room = rooms.find((r) => r.id === s.roomId);
                      return (
                        <div key={s.id}>
                          {formatThaiDate(s.date)} · {room?.name || ""} · {s.startBlock == null ? "ปิดทั้งวัน" : `${s.available ? "เปิด" : "ปิด"} ${blockToTime(s.startBlock)}–${blockToTime(s.endBlock)}`}{s.note ? ` · ${s.note}` : ""}
                        </div>
                      );
                    })}
                    {openOnlySummary.replaced.length > 8 && (
                      <div style={{ color: "var(--text3)" }}>และอีก {openOnlySummary.replaced.length - 8} รายการ</div>
                    )}
                  </>
                )}
                {openOnlySummary.blocked.length > 0 && (
                  <>
                    <div style={{ fontWeight: 700, color: "var(--red)", marginTop: 6 }}>
                      ⛔ ข้าม {openOnlySummary.blocked.length} เตียง-วัน
                    </div>
                    {openOnlySummary.blocked.slice(0, 8).map((b) => {
                      const room = rooms.find((r) => r.id === b.roomId);
                      return (
                        <div key={`${b.roomId}|${b.date}`}>
                          {formatThaiDate(b.date)} · {room?.name || ""} · {b.blocked}
                        </div>
                      );
                    })}
                    {openOnlySummary.blocked.length > 8 && (
                      <div style={{ color: "var(--text3)" }}>และอีก {openOnlySummary.blocked.length - 8} เตียง-วัน</div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* หมายเหตุ */}
          <div className="form-group full">
            <label className="form-label">หมายเหตุ</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="เช่น หมอเข้า 10:00-14:00 / เครื่อง HIFU ส่งซ่อม"
            />
          </div>
        </div>
      </ModalBody>
      <ModalFooter
        onClose={onClose}
        onSave={handleSave}
        disabled={selectedRoomIds.length === 0 || (!isEdit && generatedDates.length === 0)}
        saveLabel={isOpenOnly ? `💾 บันทึก (${openOnlySummary?.bedDays ?? 0} เตียง-วัน)` : `💾 บันทึก ${!isEdit && generatedDates.length > 1 ? `(${generatedDates.length} วัน × ${selectedRoomIds.length} ห้อง = ${generatedDates.length * selectedRoomIds.length} รายการ)` : selectedRoomIds.length > 1 ? `(${selectedRoomIds.length} ห้อง)` : ""}`}
      />
    </>
  );
}
