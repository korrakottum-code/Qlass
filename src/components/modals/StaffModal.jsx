import { useState } from "react";
import { ROLES } from "../../utils/constants";
import { ModalHeader, ModalBody, ModalFooter } from "../Modal";

export default function StaffModal({ data, branches, onSave, onClose }) {
  const isEdit = !!data?.id;
  const [name, setName] = useState(data?.name || "");
  const [nickname, setNickname] = useState(data?.nickname || "");
  const [phone, setPhone] = useState(data?.phone || "");
  const [branchId, setBranchId] = useState(data?.branchId ?? null);
  const [role, setRole] = useState(data?.role || "cashier");
  const [pin, setPin] = useState(data?.pin || "");
  const [showPin, setShowPin] = useState(false);
  const [active, setActive] = useState(data?.active ?? true);
  const [commNew, setCommNew] = useState(data?.commissionRates?.new ?? 0);
  const [commOld, setCommOld] = useState(data?.commissionRates?.old ?? 0);
  const [commCourse, setCommCourse] = useState(data?.commissionRates?.course ?? 0);

  const roleInfo = ROLES.find((r) => r.value === role);

  function handleSave() {
    if (!name.trim()) return;
    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      alert("PIN ต้องเป็นตัวเลข 4 หลัก");
      return;
    }
    onSave({
      id: data?.id,
      name: name.trim(),
      nickname: nickname.trim(),
      phone: phone.trim(),
      branchId: branchId || null,
      role,
      pin,
      active,
      commissionRates: {
        new: Number(commNew) || 0,
        old: Number(commOld) || 0,
        course: Number(commCourse) || 0,
      },
    });
  }

  const inputSm = { width: 72, textAlign: "center" };

  return (
    <>
      <ModalHeader title={isEdit ? "✏️ แก้ไขพนักงาน" : "➕ เพิ่มพนักงาน"} onClose={onClose} />
      <ModalBody>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 16px" }}>

          {/* ชื่อ */}
          <div className="form-group">
            <label className="form-label">ชื่อ-นามสกุล *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น น้องแนน สมใจ" autoFocus />
          </div>

          {/* ชื่อเล่น */}
          <div className="form-group">
            <label className="form-label">ชื่อเล่น / ชื่อย่อ</label>
            <input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="เช่น แนน" />
          </div>

          {/* เบอร์ */}
          <div className="form-group">
            <label className="form-label">เบอร์โทร</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08xxxxxxxx" />
          </div>

          {/* สาขา */}
          <div className="form-group">
            <label className="form-label">สาขาประจำ</label>
            <select value={branchId || ""} onChange={(e) => setBranchId(e.target.value || null)}>
              <option value="">ทุกสาขา</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>

          {/* บทบาท */}
          <div className="form-group">
            <label className="form-label">บทบาท / สิทธิ์</label>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            {roleInfo && (
              <div style={{ fontSize: 11, marginTop: 4, color: roleInfo.color, fontWeight: 600 }}>
                เข้าถึงได้: {roleInfo.pages.length} หน้า
              </div>
            )}
          </div>

          {/* PIN */}
          <div className="form-group">
            <label className="form-label">PIN (4 หลัก) *</label>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type={showPin ? "text" : "password"}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="เช่น 1234"
                maxLength={4}
                style={{ fontFamily: "monospace", letterSpacing: 4, fontSize: 18, width: 80, textAlign: "center" }}
              />
              <button
                type="button"
                onClick={() => setShowPin((v) => !v)}
                style={{ background: "none", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", padding: "4px 8px", fontSize: 12 }}
              >
                {showPin ? "ซ่อน" : "แสดง"}
              </button>
            </div>
          </div>
        </div>

        {/* Commission rates */}
        <div style={{
          marginTop: 16, padding: "14px 16px", borderRadius: "var(--radius-sm)",
          background: "var(--surface2)", border: "1.5px solid var(--border)",
        }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12, color: "var(--accent)" }}>
            💰 ค่าคอมมิชชั่น (฿ ต่อคิว)
          </div>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            {[
              { key: "new", label: "ลูกค้าใหม่", val: commNew, set: setCommNew, color: "#059669" },
              { key: "old", label: "ลูกค้าเก่า", val: commOld, set: setCommOld, color: "#2563eb" },
              { key: "course", label: "ใช้คอร์ส", val: commCourse, set: setCommCourse, color: "#d97706" },
            ].map(({ key, label, val, set, color }) => (
              <div key={key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color }}>{label}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 13, color: "var(--text2)" }}>฿</span>
                  <input
                    type="number" min={0} step={1}
                    value={val}
                    onChange={(e) => set(e.target.value)}
                    style={{ ...inputSm }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* สถานะ */}
        {isEdit && (
          <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10 }}>
            <label style={{ fontSize: 13, fontWeight: 600 }}>สถานะบัญชี:</label>
            <button
              type="button"
              onClick={() => setActive((v) => !v)}
              style={{
                padding: "4px 14px", borderRadius: 20, border: "none", cursor: "pointer",
                fontWeight: 700, fontSize: 12,
                background: active ? "rgba(5,150,105,0.15)" : "rgba(107,114,128,0.15)",
                color: active ? "#059669" : "#6b7280",
              }}
            >
              {active ? "✅ ใช้งานอยู่" : "⛔ ปิดการใช้งาน"}
            </button>
          </div>
        )}
      </ModalBody>
      <ModalFooter onClose={onClose} onSave={handleSave} disabled={!name.trim() || pin.length !== 4} />
    </>
  );
}
