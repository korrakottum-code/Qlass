import { useState } from "react";
import { ModalHeader, ModalBody, ModalFooter } from "../Modal";
import { ROOM_TYPES } from "../../utils/constants";
import { procedureRoomTypes, encodeProcedureRoomTypes } from "../../utils/roomProcedures";

export default function ProcedureModal({ data, categories = [], onSave, onClose }) {
  const [name, setName] = useState(data?.name || "");
  const [blocks, setBlocks] = useState(data?.blocks || 3);
  const [category, setCategory] = useState(data?.category || "");
  // เลือกได้ห้องเดียวหรือทั้งสองห้อง — เก็บเป็น "M", "T" หรือ "MT"
  const [roomTypes, setRoomTypes] = useState(() => {
    const initial = procedureRoomTypes(data);
    return initial.length ? initial : ["M"];
  });
  const roomType = encodeProcedureRoomTypes(roomTypes);

  function toggleRoomType(value) {
    setRoomTypes((current) => {
      if (current.includes(value)) {
        // ต้องเหลืออย่างน้อยหนึ่งห้อง ไม่งั้นหัตถการนี้จะลงคิวไม่ได้เลย
        return current.length > 1 ? current.filter((v) => v !== value) : current;
      }
      return [...current, value];
    });
  }

  function handleSave() {
    if (name.trim() && category && roomType) {
      return onSave({ id: data?.id, name: name.trim(), blocks, category, roomType });
    }
  }

  return (
    <>
      <ModalHeader title={data ? "✏️ แก้ไขหัตถการ" : "➕ เพิ่มหัตถการ"} onClose={onClose} />
      <ModalBody>
        <div className="form-grid">
          <div className="form-group full">
            <label className="form-label"><span className="req">*</span> ชื่อหัตถการ</label>
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="เช่น Botox, Filler, HIFU" />
          </div>

          <div className="form-group">
            <label className="form-label"><span className="req">*</span> หมวดหมู่</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">-- เลือกหมวด --</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label"><span className="req">*</span> ประเภทห้อง <span style={{ fontWeight: 400, color: "var(--text3)" }}>(เลือกได้มากกว่า 1)</span></label>
            <div className="type-options">
              {ROOM_TYPES.map((rt) => {
                const selected = roomTypes.includes(rt.value);
                return (
                  <button
                    key={rt.value}
                    type="button"
                    aria-pressed={selected}
                    className={`type-option ${selected ? "selected" : ""}`}
                    onClick={() => toggleRoomType(rt.value)}
                    style={selected ? { borderColor: rt.color, background: rt.color, color: "#fff" } : {}}
                  >
                    <span style={{ fontFamily: "var(--mono)", fontWeight: 700 }}>{selected ? "✓ " : ""}{rt.value}</span>
                    {" "}{rt.label.split("—")[1]?.trim()}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="form-group full">
            <label className="form-label">ระยะเวลา (บล็อคละ 5 นาที)</label>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setBlocks((b) => Math.max(1, b - 1))}
                style={{ fontSize: 18, padding: "4px 12px", lineHeight: 1 }}
              >−</button>
              <div style={{
                fontFamily: "var(--mono)", fontWeight: 700, fontSize: 20,
                minWidth: 80, textAlign: "center",
                color: "var(--accent)",
              }}>
                {blocks * 5} นาที
              </div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setBlocks((b) => Math.min(100, b + 1))}
                style={{ fontSize: 18, padding: "4px 12px", lineHeight: 1 }}
              >+</button>
              <span style={{ fontSize: 12, color: "var(--text3)" }}>
                ({blocks} บล็อค)
              </span>
            </div>
          </div>
        </div>
      </ModalBody>
      <ModalFooter onClose={onClose} onSave={handleSave} />
    </>
  );
}
