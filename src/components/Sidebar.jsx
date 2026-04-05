import { useState } from "react";
import { NAV_ITEMS, ROLES } from "../utils/constants";

export default function Sidebar({ currentPage, onNavigate, branchCount, queueCount, currentUser, onLogout }) {
  const [collapsed, setCollapsed] = useState(false);
  const allowedPages = currentUser
    ? (ROLES.find((r) => r.value === currentUser.role)?.pages || [])
    : [];

  const roleInfo = currentUser ? ROLES.find((r) => r.value === currentUser.role) : null;

  // Filter NAV_ITEMS: keep sections only if they have at least one visible child
  const visibleItems = [];
  let pendingSection = null;
  let sectionHasChild = false;

  NAV_ITEMS.forEach((item) => {
    if (item.section) {
      if (pendingSection && sectionHasChild) visibleItems.push(pendingSection);
      pendingSection = item;
      sectionHasChild = false;
    } else {
      if (allowedPages.includes(item.id)) {
        if (pendingSection) { visibleItems.push(pendingSection); pendingSection = null; }
        visibleItems.push(item);
        sectionHasChild = true;
      }
    }
  });
  if (pendingSection && sectionHasChild) visibleItems.push(pendingSection);

  return (
    <div className="sidebar" style={{ display: "flex", flexDirection: "column", width: collapsed ? "70px" : "240px", transition: "width 0.3s ease" }}>
      <div className="sidebar-brand" style={{ position: "relative" }}>
        {!collapsed && (
          <>
            <h1>Qlass</h1>
            <p>{branchCount} สาขา</p>
          </>
        )}
        {collapsed && (
          <div style={{ textAlign: "center", fontSize: 24, fontWeight: 800, color: "var(--accent)" }}>Q</div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          style={{
            position: "absolute",
            right: collapsed ? "50%" : "10px",
            top: "50%",
            transform: collapsed ? "translate(50%, -50%)" : "translateY(-50%)",
            background: "var(--surface2)",
            border: "1.5px solid var(--border)",
            borderRadius: 8,
            width: 28,
            height: 28,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            color: "var(--text2)",
            transition: "all 0.3s ease",
          }}
          title={collapsed ? "ขยาย" : "หุบ"}
        >
          {collapsed ? "→" : "←"}
        </button>
      </div>

      <div className="sidebar-nav" style={{ flex: 1, overflowY: "auto" }}>
        {visibleItems.map((item, i) =>
          item.section ? (
            <div className="nav-section" key={i}>{item.section}</div>
          ) : (
            <button
              key={item.id}
              className={`nav-item ${currentPage === item.id ? "active" : ""}`}
              onClick={() => onNavigate(item.id)}
              title={collapsed ? item.label : ""}
              style={{
                justifyContent: collapsed ? "center" : "flex-start",
                padding: collapsed ? "10px" : "10px 14px",
              }}
            >
              <span className="icon">{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
              {!collapsed && item.id === "queue-table" && queueCount > 0 && (
                <span className="nav-badge">{queueCount}</span>
              )}
            </button>
          )
        )}
      </div>

      {/* Current user footer */}
      {currentUser && (
        <div style={{
          borderTop: "1px solid var(--border)",
          padding: collapsed ? "12px 8px" : "12px 14px",
          background: "var(--surface2)",
        }}>
          {collapsed ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <div style={{
                width: 36, height: 36, borderRadius: "50%",
                background: roleInfo ? roleInfo.color + "22" : "var(--surface3)",
                border: `2px solid ${roleInfo?.color || "var(--border)"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 800, fontSize: 15, color: roleInfo?.color || "var(--text)",
              }}
              title={currentUser.nickname || currentUser.name}
              >
                {(currentUser.nickname || currentUser.name).charAt(0)}
              </div>
              <button
                onClick={onLogout}
                title="ออกจากระบบ"
                style={{
                  background: "none", border: "1px solid var(--border)",
                  borderRadius: 8, cursor: "pointer", padding: "4px",
                  fontSize: 11, color: "var(--text2)", width: "100%",
                }}
              >
                ⎋
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                background: roleInfo ? roleInfo.color + "22" : "var(--surface3)",
                border: `2px solid ${roleInfo?.color || "var(--border)"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 800, fontSize: 15, color: roleInfo?.color || "var(--text)",
              }}>
                {(currentUser.nickname || currentUser.name).charAt(0)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {currentUser.nickname || currentUser.name}
                </div>
                {roleInfo && (
                  <div style={{ fontSize: 11, fontWeight: 600, color: roleInfo.color }}>{roleInfo.label}</div>
                )}
              </div>
              <button
                onClick={onLogout}
                title="ออกจากระบบ"
                style={{
                  background: "none", border: "1px solid var(--border)",
                  borderRadius: 8, cursor: "pointer", padding: "4px 8px",
                  fontSize: 13, color: "var(--text2)",
                }}
              >
                ออก
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
