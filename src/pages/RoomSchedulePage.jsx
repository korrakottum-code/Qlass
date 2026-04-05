import { formatThaiDate, blockToTime } from "../utils/helpers";

export default function RoomSchedulePage({ roomSchedules, rooms, branches, onAdd, onEdit, onDelete }) {
  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <button className="btn btn-primary" onClick={onAdd}>➕ เพิ่มตารางพิเศษ</button>
      </div>
      <div className="card">
        <div className="card-header">
          <h3>📅 ตารางห้อง/เครื่องวันพิเศษ</h3>
        </div>
        <div className="card-body">
          <p style={{ fontSize: 13, color: "var(--text2)", marginBottom: 14 }}>
            ใช้สำหรับจัดการกรณี: หมอเข้าเฉพาะบางช่วงเวลา, เครื่อง Diode/HIFU เสีย ใช้ไม่ได้, ปิดห้องซ่อม ฯลฯ
          </p>
          {roomSchedules.length === 0 ? (
            <div className="empty"><p>ยังไม่มีตารางพิเศษ</p></div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>ห้อง</th>
                  <th>สาขา</th>
                  <th>วันที่</th>
                  <th>สถานะ</th>
                  <th>เวลา</th>
                  <th>หมายเหตุ</th>
                  <th style={{ textAlign: "center" }}>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {roomSchedules.map((s) => {
                  const room = rooms.find((r) => r.id === s.roomId);
                  const branch = branches.find((b) => b.id === room?.branchId);
                  return (
                    <tr key={s.id}>
                      <td>
                        <span style={{
                          fontFamily: "var(--mono)", fontWeight: 700, fontSize: 13,
                          color: room?.type === "M" ? "var(--blue)" : "var(--green)",
                        }}>
                          {room?.name || "—"}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: "var(--text2)" }}>{branch?.name || "—"}</td>
                      <td>{s.date ? formatThaiDate(s.date) : "ทุกวัน"}</td>
                      <td>
                        {s.available
                          ? <span className="sched-tag sched-on">✓ เปิดให้บริการ</span>
                          : <span className="sched-tag sched-off">✕ ปิด/ไม่พร้อม</span>
                        }
                      </td>
                      <td style={{ fontFamily: "var(--mono)", fontSize: 12 }}>
                        {blockToTime(s.startBlock)} - {blockToTime(s.endBlock)}
                      </td>
                      <td style={{ fontSize: 12 }}>{s.note || "—"}</td>
                      <td>
                        <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                          <button className="btn btn-sm btn-secondary" onClick={() => onEdit(s)}>✏️</button>
                          <button className="btn btn-sm btn-danger" onClick={() => onDelete(s.id)}>🗑️</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
