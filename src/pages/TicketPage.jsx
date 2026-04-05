import { useState, useMemo } from "react";
import { formatThaiDate } from "../utils/helpers";

export default function TicketPage({ tickets, branches, staff, currentUser, onCreateTicket, onUpdateTicket, onDeleteTicket }) {
  const [showForm, setShowForm] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "bug",
    priority: "medium",
    images: [],
  });

  const isAdmin = ["superadmin", "head_admin"].includes(currentUser?.role);

  const filteredTickets = useMemo(() => {
    let result = tickets;
    if (filterStatus !== "all") {
      result = result.filter(t => t.status === filterStatus);
    }
    return result;
  }, [tickets, filterStatus]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.description.trim()) return;

    const ticketData = {
      title: form.title,
      description: form.description,
      category: form.category,
      priority: form.priority,
      branchId: currentUser?.branchId,
      reportedBy: currentUser?.id,
      imageUrls: [], // Images will be handled separately
    };

    await onCreateTicket(ticketData, form.images);
    setForm({ title: "", description: "", category: "bug", priority: "medium", images: [] });
    setShowForm(false);
  };

  const handleImageChange = (e) => {
    const files = Array.from(e.target.files);
    setForm({ ...form, images: files });
  };

  const categoryLabels = {
    bug: "🐛 Bug/ข้อผิดพลาด",
    feature: "✨ ขอฟีเจอร์ใหม่",
    question: "❓ สอบถาม",
    other: "📝 อื่นๆ",
  };

  const priorityLabels = {
    low: "ต่ำ",
    medium: "ปานกลาง",
    high: "สูง",
    urgent: "เร่งด่วน",
  };

  const statusLabels = {
    open: "เปิด",
    in_progress: "กำลังดำเนินการ",
    resolved: "แก้ไขแล้ว",
    closed: "ปิด",
  };

  const statusColors = {
    open: "#f59e0b",
    in_progress: "#3b82f6",
    resolved: "#10b981",
    closed: "#6b7280",
  };

  const priorityColors = {
    low: "#6b7280",
    medium: "#f59e0b",
    high: "#ef4444",
    urgent: "#dc2626",
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#1a1a2e", margin: 0 }}>
          🎫 แจ้งปัญหาระบบ
        </h1>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{
            padding: "10px 20px",
            borderRadius: 8,
            border: "none",
            background: "#2563eb",
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {showForm ? "ยกเลิก" : "+ แจ้งปัญหาใหม่"}
        </button>
      </div>

      {/* Create Ticket Form */}
      {showForm && (
        <div style={{
          background: "#fff",
          borderRadius: 12,
          padding: 24,
          marginBottom: 24,
          border: "1px solid #e5e7eb",
        }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: "#374151" }}>
            แจ้งปัญหาใหม่
          </h3>
          <form onSubmit={handleSubmit}>
            <div style={{ display: "grid", gap: 16 }}>
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: "#6b7280" }}>
                  หัวข้อ *
                </label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="สรุปปัญหาสั้นๆ"
                  required
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "1.5px solid #d1d5db",
                    fontSize: 14,
                    outline: "none",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: "#6b7280" }}>
                  รายละเอียด *
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="อธิบายปัญหาโดยละเอียด..."
                  required
                  rows={4}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "1.5px solid #d1d5db",
                    fontSize: 14,
                    outline: "none",
                    resize: "vertical",
                  }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: "#6b7280" }}>
                    ประเภท
                  </label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: "1.5px solid #d1d5db",
                      fontSize: 14,
                      outline: "none",
                    }}
                  >
                    {Object.entries(categoryLabels).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: "#6b7280" }}>
                    ความสำคัญ
                  </label>
                  <select
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: "1.5px solid #d1d5db",
                      fontSize: 14,
                      outline: "none",
                    }}
                  >
                    {Object.entries(priorityLabels).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: "#6b7280" }}>
                  แนบรูปภาพ (ถ้ามี)
                </label>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleImageChange}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "1.5px solid #d1d5db",
                    fontSize: 14,
                    outline: "none",
                  }}
                />
                {form.images.length > 0 && (
                  <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>
                    เลือกแล้ว {form.images.length} ไฟล์
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  style={{
                    padding: "10px 20px",
                    borderRadius: 8,
                    border: "1.5px solid #d1d5db",
                    background: "#fff",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                    color: "#374151",
                  }}
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  style={{
                    padding: "10px 20px",
                    borderRadius: 8,
                    border: "none",
                    background: "#2563eb",
                    color: "#fff",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  ส่งคำร้อง
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Filter Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {[
          { value: "all", label: "ทั้งหมด" },
          { value: "open", label: "เปิด" },
          { value: "in_progress", label: "กำลังดำเนินการ" },
          { value: "resolved", label: "แก้ไขแล้ว" },
          { value: "closed", label: "ปิด" },
        ].map((tab) => (
          <button
            key={tab.value}
            onClick={() => setFilterStatus(tab.value)}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "1.5px solid #d1d5db",
              background: filterStatus === tab.value ? "#2563eb" : "#fff",
              color: filterStatus === tab.value ? "#fff" : "#374151",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tickets List */}
      <div style={{ display: "grid", gap: 16 }}>
        {filteredTickets.length === 0 ? (
          <div style={{
            background: "#fff",
            borderRadius: 12,
            padding: 40,
            textAlign: "center",
            border: "1px solid #e5e7eb",
            color: "#6b7280",
          }}>
            ไม่มีคำร้องในขณะนี้
          </div>
        ) : (
          filteredTickets.map((ticket) => {
            const reporter = staff.find(s => s.id === ticket.reportedBy);
            const branch = branches.find(b => b.id === ticket.branchId);
            
            return (
              <div
                key={ticket.id}
                onClick={() => setSelectedTicket(selectedTicket?.id === ticket.id ? null : ticket)}
                style={{
                  background: "#fff",
                  borderRadius: 12,
                  padding: 20,
                  border: "1px solid #e5e7eb",
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)"}
                onMouseLeave={(e) => e.currentTarget.style.boxShadow = "none"}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 12 }}>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 700, color: "#1a1a2e", margin: "0 0 8px 0" }}>
                      {ticket.title}
                    </h3>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <span style={{
                        padding: "4px 10px",
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 600,
                        background: statusColors[ticket.status] + "20",
                        color: statusColors[ticket.status],
                      }}>
                        {statusLabels[ticket.status]}
                      </span>
                      <span style={{
                        padding: "4px 10px",
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 600,
                        background: priorityColors[ticket.priority] + "20",
                        color: priorityColors[ticket.priority],
                      }}>
                        {priorityLabels[ticket.priority]}
                      </span>
                      <span style={{ fontSize: 12, color: "#6b7280" }}>
                        {categoryLabels[ticket.category]}
                      </span>
                    </div>
                  </div>
                  <div style={{ textAlign: "right", fontSize: 12, color: "#6b7280" }}>
                    <div>{formatThaiDate(ticket.createdAt?.split('T')[0])}</div>
                    <div style={{ marginTop: 4 }}>
                      {reporter ? (reporter.nickname || reporter.name) : "-"}
                      {branch && ` • ${branch.name}`}
                    </div>
                  </div>
                </div>

                {selectedTicket?.id === ticket.id && (
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #e5e7eb" }}>
                    <div style={{ fontSize: 14, color: "#374151", marginBottom: 12, whiteSpace: "pre-wrap" }}>
                      {ticket.description}
                    </div>

                    {ticket.imageUrls && ticket.imageUrls.length > 0 && (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                        {ticket.imageUrls.map((url, idx) => (
                          <img
                            key={idx}
                            src={url}
                            alt={`Screenshot ${idx + 1}`}
                            style={{
                              width: 120,
                              height: 120,
                              objectFit: "cover",
                              borderRadius: 8,
                              border: "1px solid #e5e7eb",
                            }}
                          />
                        ))}
                      </div>
                    )}

                    {ticket.adminNotes && (
                      <div style={{
                        background: "#f3f4f6",
                        padding: 12,
                        borderRadius: 8,
                        marginBottom: 12,
                      }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>
                          หมายเหตุจากแอดมิน:
                        </div>
                        <div style={{ fontSize: 13, color: "#374151" }}>
                          {ticket.adminNotes}
                        </div>
                      </div>
                    )}

                    {isAdmin && (
                      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                        {ticket.status !== "resolved" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onUpdateTicket(ticket.id, { status: "resolved" });
                            }}
                            style={{
                              padding: "8px 16px",
                              borderRadius: 6,
                              border: "none",
                              background: "#10b981",
                              color: "#fff",
                              fontSize: 13,
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            ✓ แก้ไขแล้ว
                          </button>
                        )}
                        {ticket.status !== "in_progress" && ticket.status !== "resolved" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onUpdateTicket(ticket.id, { status: "in_progress" });
                            }}
                            style={{
                              padding: "8px 16px",
                              borderRadius: 6,
                              border: "1.5px solid #3b82f6",
                              background: "#fff",
                              color: "#3b82f6",
                              fontSize: 13,
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            กำลังดำเนินการ
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm("ต้องการลบคำร้องนี้?")) {
                              onDeleteTicket(ticket.id);
                            }
                          }}
                          style={{
                            padding: "8px 16px",
                            borderRadius: 6,
                            border: "1.5px solid #ef4444",
                            background: "#fff",
                            color: "#ef4444",
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: "pointer",
                            marginLeft: "auto",
                          }}
                        >
                          ลบ
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
