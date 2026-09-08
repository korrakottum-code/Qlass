import { Fragment, useState } from "react";

export default function ProceduresPage({
  procedures, categories,
  onAdd, onEdit, onDelete,
  procedureAreas = [], onSaveArea, onDeleteArea, onDisableAreas,
  onAddCategory, onDeleteCategory,
}) {
  const [newCat, setNewCat] = useState("");
  // หัตถการที่กางแผงบริเวณอยู่ (ทีละตัว) + ฟอร์มเพิ่ม/แก้บริเวณของแผงนั้น
  const [areaPanelId, setAreaPanelId] = useState(null);
  const [areaDraft, setAreaDraft] = useState({ id: null, name: "", minutes: 15 });

  function openAreaPanel(procedureId) {
    const next = areaPanelId === procedureId ? null : procedureId;
    setAreaPanelId(next);
    setAreaDraft({ id: null, name: "", minutes: 15 });
  }

  async function submitArea(procedureId) {
    const minutes = Number(areaDraft.minutes);
    if (!areaDraft.name.trim() || !(minutes >= 5)) return;
    const saved = await onSaveArea?.({
      id: areaDraft.id,
      procedureId,
      name: areaDraft.name.trim(),
      blocks: Math.round(minutes / 5),
    });
    // ล้างฟอร์มเฉพาะตอนบันทึกผ่าน — บันทึกไม่ผ่านแล้วสิ่งที่พิมพ์หายคือต้องพิมพ์ใหม่ทั้งหมด
    if (saved) setAreaDraft({ id: null, name: "", minutes: 15 });
  }

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
              <th>บริเวณ</th>
              <th style={{ textAlign: "center" }}>จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {procedures.map((p, i) => {
              const areas = procedureAreas.filter((a) => a.procedureId === p.id);
              const panelOpen = areaPanelId === p.id;
              return (
              <Fragment key={p.id}>
              <tr>
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
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => openAreaPanel(p.id)}
                    title="บริเวณที่ทำได้ และเวลาของแต่ละบริเวณ"
                    style={{ whiteSpace: "nowrap" }}
                  >
                    {areas.length > 0 ? `📍 ${areas.length} บริเวณ` : "＋ ตั้งบริเวณ"}
                  </button>
                </td>
                <td>
                  <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                    <button className="btn btn-sm btn-secondary" onClick={() => onEdit(p)}>✏️</button>
                    <button className="btn btn-sm btn-danger" onClick={() => onDelete(p.id)}>🗑️</button>
                  </div>
                </td>
              </tr>

              {panelOpen && (
              <tr>
                <td colSpan={8} style={{ background: "var(--surface2)", padding: "12px 16px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
                    📍 บริเวณของ {p.name}
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                    {areas.map((a) => (
                      <span key={a.id} style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        padding: "5px 8px 5px 12px", borderRadius: 20,
                        border: "1.5px solid var(--border)", background: "var(--surface)",
                        fontSize: 13, fontWeight: 500,
                      }}>
                        {a.name}
                        <span style={{
                          fontSize: 10, fontFamily: "var(--mono)", fontWeight: 700,
                          background: "var(--surface3)", borderRadius: 10,
                          padding: "1px 6px", color: "var(--text3)",
                        }}>
                          {a.blocks * 5} นาที
                        </span>
                        <button
                          onClick={() => setAreaDraft({ id: a.id, name: a.name, minutes: a.blocks * 5 })}
                          title="แก้ไข"
                          style={{ border: "none", background: "none", cursor: "pointer", fontSize: 12, padding: "0 2px" }}
                        >✏️</button>
                        <button
                          onClick={() => {
                            if (window.confirm(`ลบบริเวณ "${a.name}" (${a.blocks * 5} นาที) ออกจาก ${p.name}?\n\nคิวที่ลงไปแล้วไม่เปลี่ยน มีผลกับคิวที่ลงใหม่เท่านั้น`)) {
                              onDeleteArea?.(a.id);
                            }
                          }}
                          title="ลบบริเวณนี้"
                          style={{ border: "none", background: "none", cursor: "pointer", color: "var(--text3)", fontSize: 14, lineHeight: 1, padding: "0 2px" }}
                        >×</button>
                      </span>
                    ))}
                    {areas.length === 0 && (
                      <span style={{ fontSize: 13, color: "var(--text3)" }}>ยังไม่มีบริเวณ</span>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <input
                      value={areaDraft.name}
                      onChange={(e) => setAreaDraft((d) => ({ ...d, name: e.target.value }))}
                      onKeyDown={(e) => e.key === "Enter" && submitArea(p.id)}
                      placeholder="ชื่อบริเวณ เช่น รักแร้, ขา, Hollywood"
                      style={{ flex: "2 1 220px", minWidth: 0 }}
                    />
                    <input
                      type="number"
                      min={5}
                      max={240}
                      step={5}
                      value={areaDraft.minutes}
                      onChange={(e) => setAreaDraft((d) => ({ ...d, minutes: e.target.value }))}
                      onKeyDown={(e) => e.key === "Enter" && submitArea(p.id)}
                      style={{ flex: "0 0 90px", width: 90 }}
                    />
                    <span style={{ fontSize: 12, color: "var(--text3)" }}>นาที</span>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => submitArea(p.id)}
                      disabled={!areaDraft.name.trim()}
                      style={{ opacity: areaDraft.name.trim() ? 1 : 0.5 }}
                    >
                      {areaDraft.id ? "💾 บันทึก" : "➕ เพิ่ม"}
                    </button>
                    {areaDraft.id && (
                      <button className="btn btn-sm btn-secondary" onClick={() => setAreaDraft({ id: null, name: "", minutes: 15 })}>
                        ยกเลิก
                      </button>
                    )}
                  </div>

                  {areas.length > 0 && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed var(--border)" }}>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => {
                          if (window.confirm(
                            `ปิดบริเวณทั้งหมดของ ${p.name} (${areas.length} บริเวณ)?\n\n` +
                            `ปุ่มบริเวณจะหายจากหน้าลงคิวทันทีทุกเครื่อง และกลับไปใช้เวลาปกติ ${p.blocks * 5} นาที\n` +
                            `คิวที่ลงไปแล้วไม่ขยับ\n\n` +
                            `ตั้งกลับได้ตลอด แต่ต้องพิมพ์ใหม่ทั้ง ${areas.length} บริเวณ`
                          )) {
                            onDisableAreas?.(p.id);
                          }
                        }}
                      >
                        🚨 ปิดบริเวณทั้งหมด (สวิตช์ฉุกเฉิน)
                      </button>
                      <span style={{ fontSize: 11, color: "var(--text3)", marginLeft: 8 }}>
                        ใช้ตอนหน้าร้านมีปัญหาแล้วต้องรีบกลับไปเป็นแบบเดิม
                      </span>
                    </div>
                  )}

                  <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 8, lineHeight: 1.6 }}>
                    หัตถการที่ยังไม่มีบริเวณ หน้าลงคิวจะเหมือนเดิมทุกอย่าง — ปุ่มบริเวณจะโผล่เฉพาะหัตถการที่ตั้งไว้แล้ว<br />
                    เลือกได้หลายบริเวณในคิวเดียว ระบบจะบวกเวลาให้เอง และแอดมินยังกด +/– แก้รายคิวได้เหมือนเดิม<br />
                    ลบบริเวณทั้งหมด = ปิดกลับเป็นแบบเดิมทันที คิวที่ลงไปแล้วไม่ขยับ
                  </div>
                </td>
              </tr>
              )}
              </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
