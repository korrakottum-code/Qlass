import { useState } from "react";
import { ModalHeader, ModalBody, ModalFooter } from "../Modal";
import { ROOM_TYPES } from "../../utils/constants";

export default function ProcedureModal({ data, categories = [], onSave, onClose }) {
  const [name, setName] = useState(data?.name || "");
  const [blocks, setBlocks] = useState(data?.blocks || 3);
  const [category, setCategory] = useState(data?.category || "");
  const [roomType, setRoomType] = useState(data?.roomType || "M");

  function handleSave() {
    if (name.trim() && category) {
      onSave({ id: data?.id, name: name.trim(), blocks, category, roomType });
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
            <label className="form-label"><span className="req">*</span> ประเภทห้อง</label>
            <div className="type-options">
              {ROOM_TYPES.map((rt) => (
                <button
                  key={rt.value}
                  className={`type-option ${roomType === rt.value ? "selected" : ""}`}
                  onClick={() => setRoomType(rt.value)}
                  style={roomType === rt.value ? { borderColor: rt.color, background: rt.color, color: "#fff" } : {}}
                >
                  <span style={{ fontFamily: "var(--mono)", fontWeight: 700 }}>{rt.value}</span>
                  {" "}{rt.label.split("—")[1]?.trim()}
                </button>
              ))}
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
