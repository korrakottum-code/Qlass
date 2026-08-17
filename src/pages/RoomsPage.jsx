import { useState } from "react";
import { blockToTime } from "../utils/helpers";
import { isRoomConfigured, unservedProcedures } from "../utils/roomProcedures";

export default function RoomsPage({
  branches, rooms, onAdd, onBulkAdd, onEdit, onDelete, onReorder,
  procedures = [], roomProcedureIndex = new Map(),
}) {
  // หุบทุกสาขาไว้ก่อน (default) — กดหัวข้อสาขาเพื่อขยายดูรายละเอียด
  const [expanded, setExpanded] = useState({});
  const toggleExpanded = (branchId) => setExpanded((prev) => ({ ...prev, [branchId]: !prev[branchId] }));

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button className="btn btn-primary" onClick={onBulkAdd}>
          🚀 เพิ่มห้องทุกสาขาพร้อมกัน
        </button>
      </div>
      {branches.map((branch) => {
        const bRooms = rooms.filter((r) => r.branchId === branch.id);
        const mCount = bRooms.filter((r) => r.type === "M").length;
        const tCount = bRooms.filter((r) => r.type === "T").length;
        const isOpen = !!expanded[branch.id];
        // เตียงที่ล็อกหัตถการไว้แล้วกี่เตียง — ที่ยังไม่ตั้งค่าจะรับทุกอย่างตามประเภทห้องเหมือนเดิม
        const lockedCount = bRooms.filter((r) => isRoomConfigured(roomProcedureIndex, r.id)).length;
        // หัตถการที่ไม่มีเตียงไหนในสาขานี้รองรับเลย — กับดักหลักของการตั้งค่าเอง
        // ติ๊กพลาดช่องเดียวแล้วหัตถการนั้นลงคิวไม่ได้ทั้งสาขาโดยไม่มีใครรู้จนลูกค้าโทรมา
        const unserved = unservedProcedures(roomProcedureIndex, rooms, procedures, branch.id);
        return (
          <div className="card" key={branch.id} style={{ marginBottom: 14 }}>
            <div
              className="card-header"
              onClick={() => toggleExpanded(branch.id)}
              style={{ cursor: "pointer", userSelect: "none" }}
            >
              <h3>{isOpen ? "▾" : "▸"} 🏢 {branch.name}</h3>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 12, color: "var(--text3)" }}>
                  {bRooms.length} ห้อง
                  <span style={{ color: "var(--blue)", marginLeft: 6, fontWeight: 600 }}>M:{mCount}</span>
                  <span style={{ color: "var(--green)", marginLeft: 4, fontWeight: 600 }}>T:{tCount}</span>
                  {lockedCount > 0 && (
                    <span style={{ color: "var(--accent)", marginLeft: 6, fontWeight: 600 }}>
                      🔒 {lockedCount}/{bRooms.length}
                    </span>
                  )}
                  {unserved.length > 0 && (
                    <span style={{ color: "var(--red)", marginLeft: 6, fontWeight: 700 }}>
                      ⚠️ {unserved.length}
                    </span>
                  )}
                </span>
                <button
                  className="btn btn-sm btn-primary"
                  onClick={(e) => { e.stopPropagation(); onAdd(branch.id); }}
                >
                  ➕ เพิ่มห้อง
                </button>
              </div>
            </div>
            {isOpen && unserved.length > 0 && (
              <div style={{
                margin: "0 14px 12px", padding: "10px 14px",
                borderRadius: "var(--radius-sm)", border: "1.5px solid var(--red)",
                background: "rgba(220,38,38,0.08)", fontSize: 12.5, lineHeight: 1.6,
                color: "var(--red)", fontWeight: 600,
              }}>
                ⚠️ สาขานี้ยังไม่มีเตียงไหนรับ: {unserved.map((p) => p.name).join(", ")}
                <div style={{ fontWeight: 400, marginTop: 3 }}>
                  หัตถการเหล่านี้จะลงคิวที่สาขานี้ไม่ได้เลย — เปิดเตียงที่ควรรับแล้วติ๊กเพิ่ม
                </div>
              </div>
            )}
            {!isOpen ? null : bRooms.length === 0 ? (
              <div className="card-body">
                <div style={{ textAlign: "center", padding: "20px 0", color: "var(--text3)", fontSize: 13 }}>
                  ยังไม่มีห้องในสาขานี้
                </div>
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 48, textAlign: "center" }}>ลำดับ</th>
                    <th>ชื่อห้อง</th>
                    <th>ประเภท</th>
                    <th>เวลาทำการ</th>
                    <th>หัตถการที่รับ</th>
                    <th>หมายเหตุ</th>
                    <th style={{ textAlign: "center" }}>จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {bRooms.map((r, idx) => (
                    <tr key={r.id}>
                      <td style={{ textAlign: "center", padding: "4px 2px" }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                          <button
                            onClick={() => onReorder && onReorder(r.id, "up")}
                            disabled={idx === 0}
                            style={{
                              background: "none", border: "1px solid var(--border)",
                              borderRadius: 4, cursor: idx === 0 ? "not-allowed" : "pointer",
                              padding: "1px 6px", fontSize: 11, lineHeight: 1.2,
                              color: idx === 0 ? "var(--text3)" : "var(--text1)",
                              opacity: idx === 0 ? 0.4 : 1,
                              transition: "all 0.15s",
                            }}
                            title="เลื่อนขึ้น"
                          >▲</button>
                          <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text3)", fontFamily: "var(--mono)" }}>
                            {idx + 1}
                          </span>
                          <button
                            onClick={() => onReorder && onReorder(r.id, "down")}
                            disabled={idx === bRooms.length - 1}
                            style={{
                              background: "none", border: "1px solid var(--border)",
                              borderRadius: 4, cursor: idx === bRooms.length - 1 ? "not-allowed" : "pointer",
                              padding: "1px 6px", fontSize: 11, lineHeight: 1.2,
                              color: idx === bRooms.length - 1 ? "var(--text3)" : "var(--text1)",
                              opacity: idx === bRooms.length - 1 ? 0.4 : 1,
                              transition: "all 0.15s",
                            }}
                            title="เลื่อนลง"
                          >▼</button>
                        </div>
                      </td>
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
                      <td>
                        {(() => {
                          const set = roomProcedureIndex.get(r.id);
                          if (!set || set.size === 0) {
                            return (
                              <span style={{ fontSize: 11.5, color: "var(--text3)", fontStyle: "italic" }}>
                                ยังไม่ตั้งค่า — รับทุกหัตถการ {r.type}
                              </span>
                            );
                          }
                          const names = procedures.filter((p) => set.has(p.id)).map((p) => p.name);
                          return (
                            <span
                              title={names.join(", ")}
                              style={{
                                fontSize: 11.5, fontWeight: 700, color: "var(--accent)",
                                background: "var(--accent-soft)", borderRadius: 5,
                                padding: "2px 8px", display: "inline-block",
                              }}
                            >
                              🔒 {names.length} รายการ
                            </span>
                          );
                        })()}
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
