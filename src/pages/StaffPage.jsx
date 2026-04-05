import { ROLES } from "../utils/constants";

function RoleBadge({ role }) {
  const r = ROLES.find((x) => x.value === role);
  if (!r) return null;
  return (
    <span style={{
      padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
      background: r.bg, color: r.color, whiteSpace: "nowrap",
    }}>
      {r.label}
    </span>
  );
}

function CommRate({ rates }) {
  return (
    <div style={{ display: "flex", gap: 6, fontSize: 11, flexWrap: "wrap" }}>
      <span style={{ color: "#059669", fontWeight: 600 }}>ใหม่ ฿{(rates?.new ?? 0).toLocaleString()}</span>
      <span style={{ color: "#2563eb", fontWeight: 600 }}>เก่า ฿{(rates?.old ?? 0).toLocaleString()}</span>
      <span style={{ color: "#d97706", fontWeight: 600 }}>คอร์ส ฿{(rates?.course ?? 0).toLocaleString()}</span>
    </div>
  );
}

export default function StaffPage({ staff, branches, onAdd, onEdit, onToggleActive, onDelete }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>👥 จัดการพนักงาน</h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text2)" }}>
            {staff.filter((s) => s.active).length} คนที่ใช้งานอยู่ / {staff.length} คนทั้งหมด
          </p>
        </div>
        <button className="btn btn-primary" onClick={onAdd}>➕ เพิ่มพนักงาน</button>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "var(--surface2)", textAlign: "left" }}>
              {["ชื่อ", "ชื่อเล่น", "สาขา", "บทบาท / สิทธิ์", "ค่าคอม (ใหม่/เก่า/คอร์ส)", "เบอร์", "สถานะ", ""].map((h, i) => (
                <th key={i} style={{ padding: "8px 12px", fontWeight: 700, color: "var(--text2)", borderBottom: "2px solid var(--border)", whiteSpace: "nowrap" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => {
              const branch = branches.find((b) => b.id === s.branchId);
              return (
                <tr
                  key={s.id}
                  style={{
                    borderBottom: "1px solid var(--border)",
                    opacity: s.active ? 1 : 0.45,
                    background: "var(--surface)",
                  }}
                >
                  <td style={{ padding: "10px 12px", fontWeight: 700 }}>{s.name}</td>
                  <td style={{ padding: "10px 12px", color: "var(--text2)" }}>{s.nickname || "—"}</td>
                  <td style={{ padding: "10px 12px", color: "var(--text2)" }}>
                    {branch ? branch.name : <span style={{ color: "var(--text3)", fontSize: 11 }}>ทุกสาขา</span>}
                  </td>
                  <td style={{ padding: "10px 12px" }}><RoleBadge role={s.role} /></td>
                  <td style={{ padding: "10px 12px" }}><CommRate rates={s.commissionRates} /></td>
                  <td style={{ padding: "10px 12px", color: "var(--text2)", fontFamily: "monospace" }}>{s.phone || "—"}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <button
                      onClick={() => onToggleActive(s.id)}
                      style={{
                        padding: "3px 12px", borderRadius: 20, border: "none", cursor: "pointer",
                        fontWeight: 700, fontSize: 11,
                        background: s.active ? "rgba(5,150,105,0.12)" : "rgba(107,114,128,0.12)",
                        color: s.active ? "#059669" : "#6b7280",
                      }}
                    >
                      {s.active ? "✅ ใช้งาน" : "⛔ ปิด"}
                    </button>
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="btn btn-sm btn-secondary" onClick={() => onEdit(s)}>✏️</button>
                      <button
                        className="btn btn-sm"
                        style={{ background: "rgba(220,38,38,0.1)", color: "#dc2626", border: "1px solid rgba(220,38,38,0.2)" }}
                        onClick={() => {
                          if (window.confirm(`ลบพนักงาน "${s.name}" ออกจากระบบ?`)) onDelete(s.id);
                        }}
                      >
                        🗑
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {staff.length === 0 && (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", padding: 32, color: "var(--text3)" }}>
                  ยังไม่มีพนักงานในระบบ
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Permission legend */}
      <div style={{
        marginTop: 24, padding: "14px 16px", borderRadius: "var(--radius-sm)",
        background: "var(--surface2)", border: "1px solid var(--border)",
      }}>
        <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 10, color: "var(--text2)" }}>
          📋 สิทธิ์การเข้าถึงของแต่ละบทบาท
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {ROLES.map((r) => (
            <div key={r.value} style={{ minWidth: 180 }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: r.color, marginBottom: 4 }}>{r.label}</div>
              <div style={{ fontSize: 11, color: "var(--text2)", lineHeight: 1.6 }}>
                {r.pages.join(", ")}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
