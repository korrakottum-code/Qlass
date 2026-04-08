import { useState, useEffect } from "react";
import { fetchActivityLogs } from "../utils/supabaseService";
import { blockToTime, formatThaiDate } from "../utils/helpers";

export default function ActivityLogPage({ rooms, procedures }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchActivityLogs({ limit: 200 })
      .then(setLogs)
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, []);

  function getDetail(log) {
    try { return JSON.parse(log.detail); } catch { return null; }
  }

  return (
    <>
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>🔍 ประวัติการลบคิว</h2>
        <span style={{ fontSize: 12, color: "var(--text3)" }}>{logs.length} รายการ</span>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text3)" }}>กำลังโหลด...</div>
      ) : logs.length === 0 ? (
        <div className="card">
          <div className="empty"><div className="e-icon">📭</div><p>ยังไม่มีประวัติการลบ</p></div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--surface2)", borderBottom: "2px solid var(--border2)" }}>
                <th style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text3)" }}>วันเวลาที่ลบ</th>
                <th style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text3)" }}>ชื่อลูกค้า</th>
                <th style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text3)" }}>เบอร์</th>
                <th style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text3)" }}>วันที่นัด</th>
                <th style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text3)" }}>เวลา</th>
                <th style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text3)" }}>ห้อง</th>
                <th style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text3)" }}>ลบโดย</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const d = getDetail(log);
                const room = rooms?.find((r) => r.id === d?.roomId);
                const proc = procedures?.find((p) => p.id === d?.procedureId);
                const deletedAt = log.createdAt ? new Date(log.createdAt) : null;
                return (
                  <tr key={log.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "8px 12px", fontSize: 12, fontFamily: "var(--mono)", color: "var(--text2)", whiteSpace: "nowrap" }}>
                      {deletedAt
                        ? `${formatThaiDate(deletedAt.toISOString().slice(0, 10))} ${deletedAt.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}`
                        : "—"}
                    </td>
                    <td style={{ padding: "8px 12px", fontSize: 13, fontWeight: 700 }}>{d?.name || "—"}</td>
                    <td style={{ padding: "8px 12px", fontSize: 12, color: "var(--text2)", fontFamily: "var(--mono)" }}>{d?.phone || "—"}</td>
                    <td style={{ padding: "8px 12px", fontSize: 12, color: "var(--text2)" }}>
                      {d?.date ? formatThaiDate(d.date) : "—"}
                    </td>
                    <td style={{ padding: "8px 12px", fontSize: 12, fontFamily: "var(--mono)", color: "var(--text2)" }}>
                      {d?.timeBlock != null ? blockToTime(d.timeBlock) : "—"}
                    </td>
                    <td style={{ padding: "8px 12px", fontSize: 12 }}>
                      {room ? (
                        <span style={{ fontWeight: 600, color: room.type === "M" ? "var(--blue)" : "var(--green)" }}>
                          [{room.type}] {room.name}
                        </span>
                      ) : d?.roomId ? (
                        <span style={{ color: "var(--text3)" }}>id: {d.roomId.slice(0, 8)}</span>
                      ) : "—"}
                    </td>
                    <td style={{ padding: "8px 12px", fontSize: 12, color: "var(--accent)", fontWeight: 600 }}>
                      {log.performedByName || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
