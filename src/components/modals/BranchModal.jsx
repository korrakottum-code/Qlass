import { useState } from "react";
import { ModalHeader, ModalBody, ModalFooter } from "../Modal";

export default function BranchModal({ data, onSave, onClose }) {
  const [name, setName] = useState(data?.name || "");

  function handleSave() {
    if (name.trim()) onSave({ id: data?.id, name: name.trim() });
  }

  return (
    <>
      <ModalHeader title={data ? "✏️ แก้ไขสาขา" : "➕ เพิ่มสาขา"} onClose={onClose} />
      <ModalBody>
        <div className="form-group">
          <label className="form-label">ชื่อสาขา</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="เช่น สาขาเซ็นทรัลเวิลด์"
            autoFocus
          />
        </div>
      </ModalBody>
      <ModalFooter onClose={onClose} onSave={handleSave} />
    </>
  );
}
