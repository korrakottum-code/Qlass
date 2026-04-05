import { blockToTime } from "../utils/helpers";

export default function RoomsPage({ branches, rooms, onAdd, onEdit, onDelete }) {
  return (
    <>
      {branches.map((branch) => {
        const bRooms = rooms.filter((r) => r.branchId === branch.id);
        const mCount = bRooms.filter((r) => r.type === "M").length;
        const tCount = bRooms.filter((r) => r.type === "T").length;
        return (
          <div className="card" key={branch.id} style={{ marginBottom: 14 }}>
            <div className="card-header">
              <h3>🏢 {branch.name}</h3>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 12, color: "var(--text3)" }}>
                  {bRooms.length} ห้อง
                  <span style={{ color: "var(--blue)", marginLeft: 6, fontWeight: 600 }}>M:{mCount}</span>
                  <span style={{ color: "var(--green)", marginLeft: 4, fontWeight: 600 }}>T:{tCount}</span>
                </span>
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => onAdd(branch.id)}
                >
                  ➕ เพิ่มห้อง
                </button>
              </div>
            </div>
            {bRooms.length === 0 ? (
              <div className="card-body">
                <div style={{ textAlign: "center", padding: "20px 0", color: "var(--text3)", fontSize: 13 }}>
                  ยังไม่มีห้องในสาขานี้
                </div>
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ชื่อห้อง</th>
                    <th>ประเภท</th>
                    <th>เวลาทำการ</th>
                    <th>หมายเหตุ</th>
                    <th style={{ textAlign: "center" }}>จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {bRooms.map((r) => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 600, fontFamily: "var(--mono)" }}>{r.name}</td>
                      <td>
                        <span
                          className="badge"
                          style={{
                            background: r.type === "M" ? "var(--blue-soft)" : "var(--green-soft)",
                            color: r.type === "M" ? "var(--blue)" : "var(--green)",
                            fontFamily: "var(--mono)",
                            fontWeight: 700,
                          }}
                        >
                          {r.type} — {r.type === "M" ? "ห้องหมอ" : "ห้องเครื่อง/ทรีตเมนต์"}
                        </span>
                      </td>
                      <td>
                        {r.openBlock !== undefined && r.closeBlock !== undefined ? (
                          <span style={{
                            fontFamily: "var(--mono)", fontSize: 12, fontWeight: 600,
                            color: "var(--text2)",
                            background: "var(--surface2)", borderRadius: 6,
                            padding: "2px 8px", display: "inline-block",
                          }}>
                            {blockToTime(r.openBlock)} – {blockToTime(r.closeBlock)}
                          </span>
                        ) : (
                          <span style={{ fontSize: 12, color: "var(--text3)" }}>—</span>
                        )}
                      </td>
                      <td style={{ fontSize: 12, color: "var(--text2)" }}>{r.notes || "—"}</td>
                      <td>
                        <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                          <button className="btn btn-sm btn-secondary" onClick={() => onEdit(r)}>✏️</button>
                          <button className="btn btn-sm btn-danger" onClick={() => onDelete(r.id)}>🗑️</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
    </>
  );
}
