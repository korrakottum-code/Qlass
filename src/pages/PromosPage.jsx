import { useState, useMemo } from "react";

export default function PromosPage({ promos, procedures, onAdd, onEdit, onDelete }) {
  const [filterProcedure, setFilterProcedure] = useState("all");

  const filteredPromos = useMemo(() => {
    if (filterProcedure === "all") return promos;
    return promos.filter(p => p.procedureId === filterProcedure);
  }, [promos, filterProcedure]);

  return (
    <>
      <div style={{ display: "flex", gap: 12, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn btn-primary" onClick={onAdd}>➕ เพิ่มโปร/แพ็กเกจ</button>
        <div className="form-group" style={{ margin: 0, minWidth: 200 }}>
          <label className="form-label" style={{ marginBottom: 4 }}>กรองตามหัตถการ</label>
          <select value={filterProcedure} onChange={(e) => setFilterProcedure(e.target.value)}>
            <option value="all">ทั้งหมด ({promos.length})</option>
            {procedures.map(proc => {
              const count = promos.filter(p => p.procedureId === proc.id).length;
              return (
                <option key={proc.id} value={proc.id}>
                  {proc.name} ({count})
                </option>
              );
            })}
          </select>
        </div>
      </div>
      <div className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>ชื่อโปร</th>
              <th>หัตถการ</th>
              <th>ราคา</th>
              <th>สถานะ</th>
              <th style={{ textAlign: "center" }}>จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {filteredPromos.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ textAlign: "center", padding: "40px", color: "var(--text3)" }}>
                  ไม่มีโปร/แพ็กเกจ
                </td>
              </tr>
            ) : (
              filteredPromos.map((p, i) => {
              const proc = procedures.find((x) => x.id === p.procedureId);
              return (
                <tr key={p.id}>
                  <td style={{ fontFamily: "var(--mono)", color: "var(--text3)" }}>{i + 1}</td>
                  <td style={{ fontWeight: 600 }}>{p.name}</td>
                  <td>{proc?.name || "—"}</td>
                  <td style={{ fontFamily: "var(--mono)", fontWeight: 700, color: "var(--accent)" }}>
                    ฿{p.price.toLocaleString()}
                  </td>
                  <td>
                    {p.active
                      ? <span className="badge badge-new">เปิดใช้</span>
                      : <span className="badge badge-unknown">ปิด</span>
                    }
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                      <button className="btn btn-sm btn-secondary" onClick={() => onEdit(p)}>✏️</button>
                      <button className="btn btn-sm btn-danger" onClick={() => onDelete(p.id)}>🗑️</button>
                    </div>
                  </td>
                </tr>
              );
            })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
