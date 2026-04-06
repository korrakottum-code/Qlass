import { useState, useMemo } from "react";
import { ModalHeader, ModalBody, ModalFooter } from "../Modal";
import { blockToTime, WORK_BLOCKS } from "../../utils/helpers";

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
          const isToday = ds === today.toISOString().split("T")[0];
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
    const start = new Date(weekStart);
    const monday = new Date(start);
    monday.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      dates.push(d.toISOString().split("T")[0]);
    }
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

function TimeSpinner({ label, value, onChange }) {
  const atMin = value <= WORK_BLOCKS[0].block;
  const atMax = value >= WORK_BLOCKS[WORK_BLOCKS.length - 1].block;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label className="form-label">{label}</label>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => !atMin && onChange(Math.max(WORK_BLOCKS[0].block, value - STEP))}
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
          onClick={() => !atMax && onChange(Math.min(WORK_BLOCKS[WORK_BLOCKS.length - 1].block, value + STEP))}
          disabled={atMax}
          style={{ fontSize: 16, padding: "4px 10px", lineHeight: 1 }}
        >+</button>
      </div>
    </div>
  );
}

export default function ScheduleModal({ data, rooms, branches, onSave, onClose }) {
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
  const todayYM = new Date().toISOString().slice(0, 7);
  const [monthYear, setMonthYear] = useState(todayYM);
  const [weekdays, setWeekdays] = useState([]);
  const [pickedDates, setPickedDates] = useState([]); // สำหรับ calendar mode
  const [available, setAvailable] = useState(data?.available !== undefined ? data.available : false);
  const [startBlock, setStartBlock] = useState(data?.startBlock ?? 108); // 09:00
  const [endBlock, setEndBlock] = useState(data?.endBlock ?? 132);       // 11:00
  const [note, setNote] = useState(data?.note || "");

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

  function handleSave() {
    if (selectedRoomIds.length === 0) return;
    if (generatedDates.length === 0 && !isEdit) return;
    onSave({
      id: data?.id,
      roomIds: selectedRoomIds,
      dates: isEdit ? [date] : generatedDates,
      available,
      startBlock,
      endBlock,
      note: note.trim(),
    });
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
                const isM = r.type === "M";
                return (
                  <label
                    key={r.id}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      padding: "5px 10px", borderRadius: 20, cursor: "pointer",
                      border: `1.5px solid ${checked ? (isM ? "var(--blue)" : "var(--green)") : "var(--border)"}`,
                      background: checked ? (isM ? "var(--blue-soft)" : "var(--green-soft)") : "var(--surface)",
                      fontSize: 12, fontWeight: checked ? 700 : 500,
                      color: checked ? (isM ? "var(--blue)" : "var(--green)") : "var(--text2)",
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
                className={`type-option ${!available ? "selected" : ""}`}
                onClick={() => setAvailable(false)}
                style={!available ? { borderColor: "var(--red)", background: "var(--red)", color: "#fff" } : {}}
              >
                ⛔ ปิด / ไม่พร้อม
              </button>
              <button
                className={`type-option ${available ? "selected" : ""}`}
                onClick={() => setAvailable(true)}
                style={available ? { borderColor: "var(--green)", background: "var(--green)", color: "#fff" } : {}}
              >
                ✅ เปิด (กำหนดช่วงเวลา)
              </button>
            </div>
          </div>

          {/* Time spinner */}
          <div className="form-group">
            <TimeSpinner
              label={available ? "เวลาเปิดเริ่ม" : "ปิดตั้งแต่"}
              value={startBlock}
              onChange={(v) => { setStartBlock(v); if (v >= endBlock) setEndBlock(v + STEP); }}
            />
          </div>
          <div className="form-group">
            <TimeSpinner
              label={available ? "เวลาปิด" : "ปิดถึง"}
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
                <span>{available ? "✅ เปิด" : "⛔ ปิด"}</span>
                <span style={{ fontFamily: "var(--mono)" }}>
                  {blockToTime(startBlock)} — {blockToTime(endBlock)}
                </span>
                <span style={{ color: "var(--text3)", fontWeight: 500 }}>
                  ({duration * 5} นาที / {duration / STEP} ชั่วโมง)
                </span>
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
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose}>ยกเลิก</button>
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={selectedRoomIds.length === 0 || (!isEdit && generatedDates.length === 0)}
          style={{ opacity: (selectedRoomIds.length === 0 || (!isEdit && generatedDates.length === 0)) ? 0.5 : 1 }}
        >
          💾 บันทึก {!isEdit && generatedDates.length > 1 ? `(${generatedDates.length} วัน × ${selectedRoomIds.length} ห้อง = ${generatedDates.length * selectedRoomIds.length} รายการ)` : selectedRoomIds.length > 1 ? `(${selectedRoomIds.length} ห้อง)` : ""}
        </button>
      </div>
    </>
  );
}
