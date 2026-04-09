import { useState, useMemo } from "react";
import { formatThaiDate, blockToTime, getTodayStr } from "../utils/helpers";

export default function RoomSchedulePage({ roomSchedules, rooms, branches, onAdd, onEdit, onDelete }) {
  const todayYM = getTodayStr().slice(0, 7);
  const [filterMonth, setFilterMonth] = useState(todayYM);
  const [filterBranch, setFilterBranch] = useState("all");

  const filtered = useMemo(() => {
    return roomSchedules.filter((s) => {
      if (filterMonth && s.date && !s.date.startsWith(filterMonth)) return false;
      if (filterBranch !== "all") {
        const room = rooms.find((r) => r.id === s.roomId);
        if (room?.branchId !== filterBranch) return false;
      }
      return true;
    }).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  }, [roomSchedules, filterMonth, filterBranch, rooms]);

  return (
    <>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", marginBottom: 14, flexWrap: "wrap" }}>
        <button className="btn btn-primary" onClick={onAdd}>➕ เพิ่มตารางพิเศษ</button>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" style={{ fontSize: 11 }}>เดือน</label>
          <input type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} style={{ width: 150 }} />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" style={{ fontSize: 11 }}>สาขา</label>
          <select value={filterBranch} onChange={(e) => setFilterBranch(e.target.value)} style={{ width: 160 }}>
            <option value="all">ทุกสาขา</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        {(filterMonth !== todayYM || filterBranch !== "all") && (
          <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => { setFilterMonth(todayYM); setFilterBranch("all"); }}>
            รีเซ็ต
          </button>
        )}
      </div>
      <div className="card">
        <div className="card-header">
          <h3>📅 ตารางห้อง/เครื่องวันพิเศษ</h3>
          <span style={{ fontSize: 12, color: "var(--text3)", fontWeight: 400 }}>{filtered.length} รายการ</span>
        </div>
        <div className="card-body">
          <p style={{ fontSize: 13, color: "var(--text2)", marginBottom: 14 }}>
            ใช้สำหรับจัดการกรณี: หมอเข้าเฉพาะบางช่วงเวลา, เครื่อง Diode/HIFU เสีย ใช้ไม่ได้, ปิดห้องซ่อม ฯลฯ
          </p>
          {filtered.length === 0 ? (
            <div className="empty"><p>ไม่พบรายการที่ตรงกัน</p></div>
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
                {filtered.map((s) => {
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
                        {s.noteOnly
                          ? <span className="sched-tag" style={{ background: "var(--amber-soft,#fef9c3)", color: "var(--amber,#b45309)" }}>📝 Note เท่านั้น</span>
                          : s.available
                          ? <span className="sched-tag sched-on">✓ เปิดให้บริการ</span>
                          : <span className="sched-tag sched-off">✕ ปิด/ไม่พร้อม</span>
                        }
                      </td>
                      <td style={{ fontFamily: "var(--mono)", fontSize: 12 }}>
                        {s.noteOnly ? "—" : `${blockToTime(s.startBlock)} - ${blockToTime(s.endBlock)}`}
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
