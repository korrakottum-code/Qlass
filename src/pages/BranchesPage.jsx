export default function BranchesPage({ branches, rooms, onAdd, onEdit, onDelete }) {
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
              <th style={{ textAlign: "center" }}>จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {branches.map((b, i) => (
              <tr key={b.id}>
                <td style={{ fontFamily: "var(--mono)", color: "var(--text3)" }}>{i + 1}</td>
                <td style={{ fontWeight: 600 }}>{b.name}</td>
                <td>{rooms.filter((r) => r.branchId === b.id).length} ห้อง</td>
                <td>
                  <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                    <button className="btn btn-sm btn-secondary" onClick={() => onEdit(b)}>✏️</button>
                    <button className="btn btn-sm btn-danger" onClick={() => onDelete(b.id)}>🗑️</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
