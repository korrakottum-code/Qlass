import { useState } from "react";
import { ModalHeader, ModalBody, ModalFooter } from "../Modal";

export default function PromoModal({ data, procedures, onSave, onClose }) {
  const [name, setName] = useState(data?.name || "");
  const [procedureId, setProcedureId] = useState(data?.procedureId || "");
  const [price, setPrice] = useState(data?.price || 0);
  const [active, setActive] = useState(data?.active !== undefined ? data.active : true);

  function handleSave() {
    if (name.trim()) onSave({ id: data?.id, name: name.trim(), procedureId, price, active });
  }

  return (
    <>
      <ModalHeader title={data ? "✏️ แก้ไขโปร" : "➕ เพิ่มโปร"} onClose={onClose} />
      <ModalBody>
        <div className="form-grid">
          <div className="form-group full">
            <label className="form-label">ชื่อโปร/แพ็กเกจ</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="เช่น Botox 50u Special"
              autoFocus
            />
          </div>
          <div className="form-group">
            <label className="form-label">หัตถการ</label>
            <select value={procedureId} onChange={(e) => setProcedureId(e.target.value)}>
              <option value="">-- เลือก --</option>
              {procedures.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">ราคา (บาท)</label>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(parseInt(e.target.value) || 0)}
            />
          </div>
          <div className="form-group full">
            <label className="form-label">สถานะ</label>
            <div className="type-options">
              <button
                className={`type-option ${active ? "selected" : ""}`}
                onClick={() => setActive(true)}
              >
                ✅ เปิดใช้
              </button>
              <button
                className={`type-option ${!active ? "selected" : ""}`}
                onClick={() => setActive(false)}
              >
                ⛔ ปิด
              </button>
            </div>
          </div>
        </div>
      </ModalBody>
      <ModalFooter onClose={onClose} onSave={handleSave} />
    </>
  );
}
