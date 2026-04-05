import { useState, useMemo } from "react";
import { ModalHeader, ModalBody, ModalFooter } from "../Modal";
import { blockToTime, WORK_BLOCKS } from "../../utils/helpers";

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
  const [date, setDate] = useState(data?.date || "");
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

  function handleSave() {
    if (selectedRoomIds.length === 0) return;
    // ถ้า edit mode → อัปเดตทีละห้อง, ถ้า add mode → สร้างใหม่ทุกห้องที่เลือก
    onSave({
      id: data?.id,
      roomIds: selectedRoomIds,
      date,
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

          {/* วันที่ */}
          <div className="form-group">
            <label className="form-label">วันที่ (เว้นว่าง = ทุกวัน)</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

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
          disabled={selectedRoomIds.length === 0}
          style={{ opacity: selectedRoomIds.length === 0 ? 0.5 : 1 }}
        >
          💾 บันทึก {selectedRoomIds.length > 1 ? `(${selectedRoomIds.length} ห้อง)` : ""}
        </button>
      </div>
    </>
  );
}
