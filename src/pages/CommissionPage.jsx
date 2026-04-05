import { useState, useMemo } from "react";
import { ROLES, CUSTOMER_TYPES } from "../utils/constants";
import { getTodayStr, calcCommission } from "../utils/helpers";

function getMonthRange() {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  return {
    from: `${y}-${m}-01`,
    to: getTodayStr(),
  };
}

function RoleBadge({ role }) {
  const r = ROLES.find((x) => x.value === role);
  if (!r) return null;
  return (
    <span style={{
      padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700,
      background: r.bg, color: r.color,
    }}>{r.label}</span>
  );
}

export default function CommissionPage({ queues, staff, branches, procedures, promos }) {
  const { from: defaultFrom, to: defaultTo } = getMonthRange();
  const [fromDate, setFromDate] = useState(defaultFrom);
  const [toDate, setToDate] = useState(defaultTo);
  const [filterBranch, setFilterBranch] = useState("all");
  const [expandedStaff, setExpandedStaff] = useState(null);

  // คิวที่เสร็จแล้ว (done) ในช่วงเวลาที่เลือก
  const doneQueues = useMemo(() => {
    return queues.filter((q) => {
      if ((q.status || "pending") !== "done") return false;
      const d = q.statusUpdatedAt || q.date;
      if (fromDate && d < fromDate) return false;
      if (toDate && d > toDate) return false;
      if (filterBranch !== "all" && q.branchId !== filterBranch) return false;
      return true;
    });
  }, [queues, fromDate, toDate, filterBranch]);

  // สรุปรายพนักงาน
  const staffSummary = useMemo(() => {
    return staff
      .filter((s) => s.active)
      .map((s) => {
        const myQueues = doneQueues.filter((q) => q.recordedBy === s.id);
        const { total, breakdown } = calcCommission(myQueues, s);
        const revenue = myQueues.reduce((sum, q) => sum + (Number(q.price) || 0), 0);
        return { ...s, myQueues, revenue, commission: total, breakdown };
      })
      .sort((a, b) => b.commission - a.commission);
  }, [staff, doneQueues]);

  const totalRevenue = staffSummary.reduce((s, x) => s + x.revenue, 0);
  const totalCommission = staffSummary.reduce((s, x) => s + x.commission, 0);

  // คิวที่ไม่มี recordedBy (ไม่ได้ assign ให้ใคร)
  const unassignedQueues = doneQueues.filter((q) => !q.recordedBy || !staff.find((s) => s.id === q.recordedBy));
  const unassignedRevenue = unassignedQueues.reduce((s, q) => s + (Number(q.price) || 0), 0);

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>💰 ค่าคอมมิชชั่น</h2>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text2)" }}>
          คำนวณจากคิวสถานะ "มาแล้ว / เสร็จ" ตามช่วงวันที่
        </p>
      </div>

      {/* Filter bar */}
      <div className="filter-bar" style={{ marginBottom: 20 }}>
        <div className="form-group">
          <label className="form-label">จาก</label>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">ถึง</label>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">สาขา</label>
          <select value={filterBranch} onChange={(e) => setFilterBranch(e.target.value)}>
            <option value="all">ทุกสาขา</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 24 }}>
        {[
          { label: "คิวที่เสร็จ", value: doneQueues.length, unit: "คิว", color: "#059669" },
          { label: "ยอดรวม", value: `฿${totalRevenue.toLocaleString()}`, color: "#2563eb" },
          { label: "ค่าคอมรวม", value: `฿${Math.round(totalCommission).toLocaleString()}`, color: "#d97706" },
          { label: "คิวไม่ระบุผู้บันทึก", value: unassignedQueues.length, unit: "คิว", color: "#6b7280" },
        ].map((c, i) => (
          <div key={i} style={{
            background: "var(--surface2)", border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)", padding: "14px 16px",
          }}>
            <div style={{ fontSize: 11, color: "var(--text2)", fontWeight: 600 }}>{c.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: c.color, marginTop: 4 }}>
              {c.value}{c.unit ? <span style={{ fontSize: 13 }}> {c.unit}</span> : ""}
            </div>
          </div>
        ))}
      </div>

      {/* Staff table */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "var(--surface2)", textAlign: "left" }}>
              {["พนักงาน", "บทบาท", "จำนวนคิว", "ยอดขาย", "คอม ใหม่", "คอม เก่า", "คอม คอร์ส", "รวมค่าคอม", "฿/คิว"].map((h, i) => (
                <th key={i} style={{ padding: "8px 12px", fontWeight: 700, color: "var(--text2)", borderBottom: "2px solid var(--border)", whiteSpace: "nowrap" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {staffSummary.map((s) => {
              const isExpanded = expandedStaff === s.id;
              return [
                <tr
                  key={s.id}
                  style={{
                    borderBottom: isExpanded ? "none" : "1px solid var(--border)",
                    background: "var(--surface)",
                    cursor: s.myQueues.length > 0 ? "pointer" : "default",
                  }}
                  onClick={() => s.myQueues.length > 0 && setExpandedStaff(isExpanded ? null : s.id)}
                >
                  <td style={{ padding: "10px 12px", fontWeight: 700 }}>
                    {s.myQueues.length > 0 && (
                      <span style={{ marginRight: 6, color: "var(--text3)" }}>{isExpanded ? "▼" : "▶"}</span>
                    )}
                    {s.nickname || s.name}
                    {s.nickname && s.nickname !== s.name && (
                      <span style={{ fontSize: 11, color: "var(--text3)", marginLeft: 4 }}>({s.name})</span>
                    )}
                  </td>
                  <td style={{ padding: "10px 12px" }}><RoleBadge role={s.role} /></td>
                  <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700 }}>{s.myQueues.length}</td>
                  <td style={{ padding: "10px 12px", textAlign: "right", color: "#2563eb", fontWeight: 700 }}>
                    {s.revenue > 0 ? `฿${s.revenue.toLocaleString()}` : "—"}
                  </td>
                  <td style={{ padding: "10px 12px", textAlign: "right", color: "#059669" }}>
                    {s.breakdown.new > 0 ? `฿${Math.round(s.breakdown.new).toLocaleString()}` : "—"}
                  </td>
                  <td style={{ padding: "10px 12px", textAlign: "right", color: "#2563eb" }}>
                    {s.breakdown.old > 0 ? `฿${Math.round(s.breakdown.old).toLocaleString()}` : "—"}
                  </td>
                  <td style={{ padding: "10px 12px", textAlign: "right", color: "#d97706" }}>
                    {s.breakdown.course > 0 ? `฿${Math.round(s.breakdown.course).toLocaleString()}` : "—"}
                  </td>
                  <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 800, fontSize: 15 }}>
                    {s.commission > 0 ? (
                      <span style={{ color: "#d97706" }}>฿{Math.round(s.commission).toLocaleString()}</span>
                    ) : "—"}
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <div style={{ fontSize: 10, color: "var(--text3)", lineHeight: 1.6 }}>
                      <span style={{ color: "#059669" }}>ใหม่ ฿{(s.commissionRates?.new ?? 0).toLocaleString()}</span>{" / "}
                      <span style={{ color: "#2563eb" }}>เก่า ฿{(s.commissionRates?.old ?? 0).toLocaleString()}</span>{" / "}
                      <span style={{ color: "#d97706" }}>คอร์ส ฿{(s.commissionRates?.course ?? 0).toLocaleString()}</span>
                    </div>
                  </td>
                </tr>,
                isExpanded && (
                  <tr key={s.id + "_detail"} style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
                    <td colSpan={9} style={{ padding: "0 12px 12px 36px" }}>
                      <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 6, fontWeight: 600 }}>
                        รายละเอียดคิวที่เสร็จแล้ว
                      </div>
                      <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                        <thead>
                          <tr>
                            {["ลูกค้า", "หัตถการ", "ประเภท", "ราคา", "ค่าคอม/คิว", "ค่าคอม"].map((h, i) => (
                              <th key={i} style={{ padding: "4px 8px", textAlign: "left", fontWeight: 600, color: "var(--text3)", borderBottom: "1px solid var(--border)" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {s.myQueues.map((q) => {
                            const proc = procedures.find((p) => p.id === q.procedureId);
                            const ctype = CUSTOMER_TYPES.find((c) => c.value === q.customerType);
                            const rate = s.commissionRates?.[q.customerType || "new"] || 0;
                            const comm = rate;
                            return (
                              <tr key={q.id} style={{ borderBottom: "1px solid var(--border)" }}>
                                <td style={{ padding: "4px 8px" }}>{q.name}</td>
                                <td style={{ padding: "4px 8px", color: "var(--text2)" }}>{proc?.name || "—"}</td>
                                <td style={{ padding: "4px 8px" }}>{ctype?.emoji} {ctype?.label || q.customerType}</td>
                                <td style={{ padding: "4px 8px", textAlign: "right" }}>฿{Number(q.price || 0).toLocaleString()}</td>
                                <td style={{ padding: "4px 8px", textAlign: "right", color: "var(--text2)" }}>฿{rate.toLocaleString()}</td>
                                <td style={{ padding: "4px 8px", textAlign: "right", color: "#d97706", fontWeight: 700 }}>
                                  ฿{comm.toLocaleString()}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                ),
              ];
            })}

            {/* Total row */}
            <tr style={{ background: "var(--surface2)", fontWeight: 800, borderTop: "2px solid var(--border)" }}>
              <td style={{ padding: "10px 12px" }} colSpan={2}>รวมทั้งหมด</td>
              <td style={{ padding: "10px 12px", textAlign: "right" }}>{doneQueues.length - unassignedQueues.length}</td>
              <td style={{ padding: "10px 12px", textAlign: "right", color: "#2563eb" }}>฿{totalRevenue.toLocaleString()}</td>
              <td colSpan={3} />
              <td style={{ padding: "10px 12px", textAlign: "right", color: "#d97706", fontSize: 16 }}>
                ฿{Math.round(totalCommission).toLocaleString()}
              </td>
              <td />
            </tr>

            {unassignedQueues.length > 0 && (
              <tr style={{ background: "rgba(107,114,128,0.05)", fontStyle: "italic" }}>
                <td style={{ padding: "8px 12px", color: "var(--text3)" }} colSpan={2}>ไม่ระบุผู้บันทึก</td>
                <td style={{ padding: "8px 12px", textAlign: "right", color: "var(--text3)" }}>{unassignedQueues.length}</td>
                <td style={{ padding: "8px 12px", textAlign: "right", color: "var(--text3)" }}>฿{unassignedRevenue.toLocaleString()}</td>
                <td colSpan={5} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
