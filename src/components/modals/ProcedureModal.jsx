import { useState } from "react";
import { ModalHeader, ModalBody, ModalFooter } from "../Modal";
import { ROOM_TYPES, roomTypeMeta } from "../../utils/constants";
import { procedureRoomTypes, encodeProcedureRoomTypes } from "../../utils/roomProcedures";

export default function ProcedureModal({ data, categories = [], onSave, onClose }) {
  const [name, setName] = useState(data?.name || "");
  const [blocks, setBlocks] = useState(data?.blocks || 3);
  const [category, setCategory] = useState(data?.category || "");
  // เลือกได้ห้องเดียวหรือหลายห้อง — เก็บเป็นตัวอักษรเรียงกัน เช่น "M", "MT", "MTN"
  const [roomTypes, setRoomTypes] = useState(() => {
    const initial = procedureRoomTypes(data);
    return initial.length ? initial : ["M"];
  });
  const roomType = encodeProcedureRoomTypes(roomTypes);
  const originalRoomType = data?.roomType || "";
  const roomTypeSummary = roomTypes.length
    ? encodeProcedureRoomTypes(roomTypes).split("").map((t) => roomTypeMeta(t).short).join(" + ")
    : "";

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
      // ปุ่มประเภทห้องเดิมเป็นแบบเลือกได้อันเดียว กด T = เปลี่ยนเป็น T — ตอนนี้กด T = เพิ่ม T
      // แอดมินที่ติดมือแบบเดิมจะได้หลายห้องโดยไม่ตั้งใจ แล้วหัตถการนั้นลงได้ทุกเตียงที่ยังไม่ล็อกของประเภทใหม่ทั้งเครือ
      // จึงถามยืนยันทุกครั้งที่ผลลัพธ์เป็นหลายห้องและไม่เหมือนค่าเดิม
      if (roomType.length > 1 && roomType !== originalRoomType) {
        const ok = window.confirm(`หัตถการนี้จะลงได้ ${roomType.length} ประเภทห้อง: ${roomTypeSummary}\n\nถ้าตั้งใจเปลี่ยนเป็นห้องเดียว ให้กดยกเลิก แล้วกดปุ่มห้องที่ไม่ต้องการออก`);
        if (!ok) return;
      }
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
            <div style={{ fontSize: 12, color: roomTypes.length > 1 ? "var(--accent)" : "var(--text3)", marginTop: 6, fontWeight: roomTypes.length > 1 ? 700 : 400 }}>
              ลงได้ที่: {roomTypeSummary}
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
