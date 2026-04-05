import { useState } from "react";

export default function ProceduresPage({
  procedures, categories,
  onAdd, onEdit, onDelete,
  onAddCategory, onDeleteCategory,
}) {
  const [newCat, setNewCat] = useState("");

  function handleAddCat() {
    if (newCat.trim()) {
      onAddCategory(newCat.trim());
      setNewCat("");
    }
  }

  return (
    <>
      {/* ─── จัดการหมวดหมู่ ─── */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-header">
          <h3>🗂️ จัดการหมวดหมู่</h3>
          <span style={{ fontSize: 12, color: "var(--text3)" }}>{categories.length} หมวด</span>
        </div>
        <div className="card-body" style={{ paddingBottom: 14 }}>
          {/* รายการหมวดที่มี */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
            {categories.map((cat) => {
              const count = procedures.filter((p) => p.category === cat).length;
              return (
                <div
                  key={cat}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "5px 10px 5px 12px",
                    borderRadius: 20,
                    border: "1.5px solid var(--border)",
                    background: "var(--surface2)",
                    fontSize: 13, fontWeight: 500,
                  }}
                >
                  <span>{cat}</span>
                  <span style={{
                    fontSize: 10, fontFamily: "var(--mono)", fontWeight: 700,
                    background: "var(--surface3)", borderRadius: 10,
                    padding: "1px 6px", color: "var(--text3)",
                  }}>
                    {count}
                  </span>
                  <button
                    onClick={() => onDeleteCategory(cat)}
                    title={count > 0 ? `หัตถการ ${count} รายการจะไม่มีหมวด` : "ลบหมวด"}
                    style={{
                      border: "none", background: "none", cursor: "pointer",
                      color: count > 0 ? "var(--amber)" : "var(--text3)",
                      fontSize: 14, lineHeight: 1, padding: "0 2px",
                      display: "flex", alignItems: "center",
                    }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
            {categories.length === 0 && (
              <span style={{ fontSize: 13, color: "var(--text3)" }}>ยังไม่มีหมวด</span>
            )}
          </div>

          {/* เพิ่มหมวดใหม่ */}
          <div style={{ display: "flex", gap: 8, maxWidth: 360 }}>
            <input
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddCat()}
              placeholder="ชื่อหมวดใหม่ เช่น Combo, Premium..."
              style={{ flex: 1 }}
            />
            <button
              className="btn btn-primary btn-sm"
              onClick={handleAddCat}
              disabled={!newCat.trim()}
              style={{ opacity: newCat.trim() ? 1 : 0.5 }}
            >
              ➕ เพิ่ม
            </button>
          </div>
        </div>
      </div>

      {/* ─── ตารางหัตถการ ─── */}
      <div style={{ marginBottom: 14, display: "flex", justifyContent: "flex-end" }}>
        <button className="btn btn-primary" onClick={onAdd}>➕ เพิ่มหัตถการ</button>
      </div>
      <div className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>ชื่อหัตถการ</th>
              <th>หมวด</th>
              <th>ห้อง</th>
              <th>จำนวนบล็อค</th>
              <th>เวลา (นาที)</th>
              <th style={{ textAlign: "center" }}>จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {procedures.map((p, i) => (
              <tr key={p.id}>
                <td style={{ fontFamily: "var(--mono)", color: "var(--text3)" }}>{i + 1}</td>
                <td style={{ fontWeight: 600 }}>{p.name}</td>
                <td>
                  {p.category
                    ? <span className="tag">{p.category}</span>
                    : <span style={{ fontSize: 11, color: "var(--red)", fontStyle: "italic" }}>ไม่มีหมวด</span>
                  }
                </td>
                <td>
                  <span
                    className="badge"
                    style={{
                      background: p.roomType === "M" ? "var(--blue-soft)" : "var(--green-soft)",
                      color: p.roomType === "M" ? "var(--blue)" : "var(--green)",
                      fontFamily: "var(--mono)", fontWeight: 700,
                    }}
                  >
                    {p.roomType}
                  </span>
                </td>
                <td style={{ fontFamily: "var(--mono)" }}>{p.blocks} บล็อค</td>
                <td style={{ fontFamily: "var(--mono)", fontWeight: 600 }}>{p.blocks * 5} นาที</td>
                <td>
                  <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                    <button className="btn btn-sm btn-secondary" onClick={() => onEdit(p)}>✏️</button>
                    <button className="btn btn-sm btn-danger" onClick={() => onDelete(p.id)}>🗑️</button>
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
