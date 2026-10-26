// bookingCodes: { [branchId]: { code, active } } จากตาราง booking_api_branches (null = โหมดที่ไม่มีเซิร์ฟเวอร์เซสชัน → ซ่อนคอลัมน์)
export default function BranchesPage({ branches, rooms, bookingCodes = null, onAdd, onEdit, onDelete }) {
  const showBooking = bookingCodes !== null;
  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <button className="btn btn-primary" onClick={onAdd}>➕ เพิ่มสาขา</button>
      </div>
      <div className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>ชื่อสาขา</th>
              <th>จำนวนห้อง</th>
              {showBooking && <th>น้องคลาส AI (รหัส)</th>}
              <th style={{ textAlign: "center" }}>จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {branches.map((b, i) => {
              const booking = showBooking ? bookingCodes[b.id] : null;
              return (
                <tr key={b.id}>
                  <td style={{ fontFamily: "var(--mono)", color: "var(--text3)" }}>{i + 1}</td>
                  <td style={{ fontWeight: 600 }}>{b.name}</td>
                  <td>{rooms.filter((r) => r.branchId === b.id).length} ห้อง</td>
                  {showBooking && (
                    <td>
                      {booking ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontFamily: "var(--mono)", fontWeight: 700 }}>{booking.code}</span>
                          <span style={{
                            padding: "2px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                            background: booking.active ? "rgba(5,150,105,0.15)" : "rgba(107,114,128,0.15)",
                            color: booking.active ? "#059669" : "#6b7280",
                          }}>
                            {booking.active ? "รับจอง" : "ปิดรับ"}
                          </span>
                        </span>
                      ) : (
                        <span style={{ color: "var(--text3)" }}>— ไม่เปิดให้บอท</span>
                      )}
                    </td>
                  )}
                  <td>
                    <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                      <button className="btn btn-sm btn-secondary" onClick={() => onEdit(b)}>✏️</button>
                      {/* เดิมกดปุ่มนี้ = ลบทันที ไม่มีจังหวะให้ทบทวน พลาดนิ้วครั้งเดียวก็หายได้
                          ตอนนี้สาขาทุกอันมีคิวผูกอยู่ ฐานข้อมูลเลยกันไว้ให้ (FK RESTRICT) แต่สาขา
                          ที่เพิ่งสร้างยังไม่มีคิว จะลบหลุดได้จริง ๆ — ต้องถามก่อนเหมือนหน้าพนักงาน */}
                      <button className="btn btn-sm btn-danger" onClick={() => {
                        if (window.confirm(`ลบสาขา "${b.name}" ออกจากระบบ?`)) onDelete(b.id);
                      }}>🗑️</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
