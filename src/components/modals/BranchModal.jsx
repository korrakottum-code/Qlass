import { useState } from "react";
import { ModalHeader, ModalBody, ModalFooter } from "../Modal";

// กติกาเดียวกับ check constraint ของ booking_api_branches และ bookingApiCode() ใน staff-session
const BOOKING_CODE_RE = /^[A-Z]{2,6}$/;

// booking: { code, active } ของสาขานี้ (undefined = ยังไม่เปิดให้บอท) — bookingEnabled=false คือโหมดที่เขียน
// ตรงจากเบราว์เซอร์ ซึ่งแตะตาราง booking_api_branches ไม่ได้ จึงไม่แสดงช่องนี้เลย
export default function BranchModal({ data, booking, bookingEnabled = false, onSave, onClose }) {
  const [name, setName] = useState(data?.name || "");
  const [code, setCode] = useState(booking?.code || "");
  const [active, setActive] = useState(booking ? booking.active === true : true);
  const [codeError, setCodeError] = useState("");

  function handleSave() {
    if (!name.trim()) return undefined;
    if (!bookingEnabled) return onSave({ id: data?.id, name: name.trim() });
    const trimmed = code.trim().toUpperCase();
    if (trimmed && !BOOKING_CODE_RE.test(trimmed)) {
      setCodeError("ต้องเป็นตัวอักษร A–Z 2–6 ตัว เช่น KK, UD");
      return undefined;
    }
    setCodeError("");
    return onSave({ id: data?.id, name: name.trim(), bookingApiCode: trimmed, bookingApiActive: active });
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

        {bookingEnabled && (
          <div className="form-group" style={{ marginTop: 14 }}>
            <label className="form-label">รหัสสาขาสำหรับน้องคลาส AI (Booking API)</label>
            <input
              value={code}
              onChange={(e) => { setCode(e.target.value.toUpperCase()); setCodeError(""); }}
              placeholder="เช่น KK, UD — เว้นว่าง = ไม่เปิดให้บอทจอง"
              maxLength={6}
              style={{ fontFamily: "var(--mono)", textTransform: "uppercase" }}
            />
            {codeError && <div style={{ color: "var(--red)", fontSize: 12, marginTop: 4 }}>{codeError}</div>}
            <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 6 }}>
              ตั้งแล้วสาขาจะโผล่ใน <code>GET /v1/branches</code> ให้บอทเห็นเอง — เปลี่ยนรหัสที่บอทใช้อยู่แล้วจะทำให้ฝั่งบอทต้องแก้ตาม
            </div>
            {code.trim() && (
              <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
                <label style={{ fontSize: 13, fontWeight: 600 }}>ให้บอทรับจองสาขานี้:</label>
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
                  {active ? "✅ เปิดรับจอง" : "⛔ ปิดรับชั่วคราว (ตั้งห้องให้เสร็จก่อน)"}
                </button>
              </div>
            )}
          </div>
        )}
      </ModalBody>
      <ModalFooter onClose={onClose} onSave={handleSave} />
    </>
  );
}
