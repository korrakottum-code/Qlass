import { useState, useRef, useEffect } from "react";
import { ROLES } from "../utils/constants";
import qlassLogo from "../assets/qlass-logo.svg";

export default function LoginScreen({ staff, onLogin, supabaseError }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const inputRef = useRef(null);
  const loginBackground = "linear-gradient(135deg, #020617 0%, #052e16 45%, #065f46 100%)";

  const safeStaff = Array.isArray(staff) ? staff : [];
  const activeStaff = safeStaff.filter((s) => s?.active);

  // hooks ต้องอยู่ก่อน early return เสมอ (Rules of Hooks)
  useEffect(() => {
    if (!selected) setTimeout(() => inputRef.current?.focus(), 50);
  }, [selected]);

  // Show message if no staff data
  if (safeStaff.length === 0) {
    return (
      <div style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: loginBackground,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        fontFamily: "var(--font, sans-serif)", color: "#fff", textAlign: "center", padding: 20,
      }}>
        {supabaseError && (
          <div style={{
            position: "absolute", top: 20, left: 20, right: 20,
            background: "rgba(34, 197, 94, 0.2)", border: "1px solid rgba(34, 197, 94, 0.5)",
            borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#86efac",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span>🎯</span>
            <span>โหมดตัวอย่าง: ใช้ข้อมูลสาธิต (ไม่ต้องตั้งค่า Supabase)</span>
          </div>
        )}
        <img src={qlassLogo} alt="Qlass Logo" style={{ width: 80, height: 80, marginBottom: 16 }} />
        <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 16 }}>Qlass</h1>
        <div style={{ maxWidth: 400, background: "rgba(255,255,255,0.1)", padding: 24, borderRadius: 12 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ fontSize: 18, marginBottom: 12 }}>ไม่พบข้อมูลพนักงาน</h2>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.8)", marginBottom: 16 }}>
            กรุณาตรวจสอบ:
          </p>
          <ul style={{ textAlign: "left", fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.8 }}>
            <li>Supabase มีข้อมูลในตาราง <code>staff</code> หรือไม่</li>
            <li>Environment Variables ถูกต้องหรือไม่</li>
            <li>รัน SQL schema ใน Supabase แล้วหรือยัง</li>
          </ul>
          {supabaseError && (
            <div style={{ 
              marginTop: 16, 
              padding: 12, 
              background: "rgba(220,38,38,0.2)", 
              borderRadius: 8, 
              fontSize: 12,
              color: "#fca5a5"
            }}>
              <strong>ข้อผิดพลาด:</strong> {supabaseError}
            </div>
          )}
        </div>
      </div>
    );
  }

  const results = query.trim()
    ? activeStaff.filter((s) => {
        const q = query.trim().toLowerCase();
        return (
          s.name.toLowerCase().includes(q) ||
          (s.nickname && s.nickname.toLowerCase().includes(q))
        );
      })
    : [];

  function handleSelectStaff(s) {
    setSelected(s);
    setPin("");
    setError(false);
    setQuery("");
  }

  function handlePinDigit(d) {
    if (pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    setError(false);
    if (next.length === 4) {
      setTimeout(() => {
        if (next === selected.pin) {
          onLogin(selected);
        } else {
          setError(true);
          setPin("");
        }
      }, 150);
    }
  }

  function handlePinBack() {
    setPin((p) => p.slice(0, -1));
    setError(false);
  }

  const role = selected ? ROLES.find((r) => r.value === selected.role) : null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: loginBackground,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      fontFamily: "var(--font, sans-serif)",
    }}>
      {/* Branding */}
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <img src={qlassLogo} alt="Qlass Logo" style={{ width: 80, height: 80, marginBottom: 8 }} />
        <h1 style={{ color: "#fff", fontSize: 26, fontWeight: 800, margin: 0 }}>Qlass</h1>
      </div>

      {/* Demo mode indicator */}
      {supabaseError && (
        <div style={{
          background: "rgba(34, 197, 94, 0.2)", border: "1px solid rgba(34, 197, 94, 0.5)",
          borderRadius: 8, padding: "8px 16px", fontSize: 12, color: "#86efac",
          display: "flex", alignItems: "center", gap: 8, marginBottom: 20,
        }}>
          <span>🎯</span>
          <span>โหมดตัวอย่าง: ใช้ข้อมูลสาธิต (ไม่ต้องตั้งค่า Supabase)</span>
        </div>
      )}

      {!selected ? (
        /* Search + list */
        <div style={{ width: "min(420px, 90vw)" }}>
          {/* Search input */}
          <div style={{ position: "relative", marginBottom: 12 }}>
            <span style={{
              position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)",
              fontSize: 18, pointerEvents: "none",
            }}>🔍</span>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="พิมพ์ชื่อหรือชื่อเล่น..."
              autoComplete="off"
              style={{
                width: "100%", boxSizing: "border-box",
                padding: "14px 14px 14px 44px",
                borderRadius: 14, border: "1.5px solid rgba(255,255,255,0.2)",
                background: "rgba(255,255,255,0.1)", backdropFilter: "blur(8px)",
                color: "#fff", fontSize: 16, outline: "none",
              }}
            />
          </div>

          {/* Results list */}
          {results.length > 0 && (
            <div style={{
              background: "rgba(255,255,255,0.07)", backdropFilter: "blur(12px)",
              border: "1.5px solid rgba(255,255,255,0.15)",
              borderRadius: 14, overflow: "hidden", maxHeight: 320, overflowY: "auto",
            }}>
              {results.map((s, i) => {
                const r = ROLES.find((x) => x.value === s.role);
                return (
                  <button
                    key={s.id}
                    onClick={() => handleSelectStaff(s)}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", gap: 14,
                      padding: "12px 16px", background: "none", border: "none",
                      borderBottom: i < results.length - 1 ? "1px solid rgba(255,255,255,0.08)" : "none",
                      cursor: "pointer", textAlign: "left", color: "#fff",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "none"}
                  >
                    <div style={{
                      width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
                      background: r ? r.color + "33" : "rgba(255,255,255,0.1)",
                      border: `2px solid ${r?.color || "rgba(255,255,255,0.3)"}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontWeight: 800, fontSize: 16, color: r?.color || "#fff",
                    }}>
                      {(s.nickname || s.name).charAt(0)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>
                        {s.nickname || s.name}
                        {s.nickname && s.nickname !== s.name && (
                          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginLeft: 6 }}>
                            {s.name}
                          </span>
                        )}
                      </div>
                      <div style={{
                        fontSize: 11, fontWeight: 600, marginTop: 2,
                        color: r?.color || "rgba(255,255,255,0.5)",
                      }}>
                        {r?.label || s.role}
                        {s.branchId === null && <span style={{ color: "rgba(255,255,255,0.3)", marginLeft: 6 }}>· ทุกสาขา</span>}
                      </div>
                    </div>
                    <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 18 }}>›</span>
                  </button>
                );
              })}
            </div>
          )}

          {query.trim() && results.length === 0 && (
            <div style={{ textAlign: "center", color: "rgba(255,255,255,0.4)", padding: "20px 0", fontSize: 14 }}>
              ไม่พบพนักงานชื่อ "{query}"
            </div>
          )}

          {!query.trim() && (
            <div style={{ textAlign: "center", color: "rgba(255,255,255,0.35)", padding: "16px 0", fontSize: 13 }}>
              {activeStaff.length} บัญชีที่ใช้งานได้
            </div>
          )}
        </div>
      ) : (
        /* PIN entry */
        <div style={{
          background: "rgba(255,255,255,0.08)", backdropFilter: "blur(16px)",
          border: "1.5px solid rgba(255,255,255,0.15)",
          borderRadius: 20, padding: "28px 36px",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 18,
          minWidth: 280,
        }}>
          <button
            onClick={() => { setSelected(null); setPin(""); setError(false); }}
            style={{
              alignSelf: "flex-start", background: "none", border: "none",
              color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 13,
              display: "flex", alignItems: "center", gap: 4, padding: 0,
            }}
          >
            ← กลับ
          </button>

          <div style={{
            width: 60, height: 60, borderRadius: "50%",
            background: role ? role.color + "33" : "rgba(255,255,255,0.1)",
            border: `2.5px solid ${role?.color || "rgba(255,255,255,0.3)"}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 26, fontWeight: 800, color: role?.color || "#fff",
          }}>
            {(selected.nickname || selected.name).charAt(0)}
          </div>

          <div style={{ textAlign: "center", color: "#fff" }}>
            <div style={{ fontWeight: 700, fontSize: 18 }}>{selected.nickname || selected.name}</div>
            <div style={{
              fontSize: 11, fontWeight: 600, marginTop: 4,
              padding: "2px 10px", borderRadius: 20, display: "inline-block",
              background: role ? role.color + "33" : "rgba(255,255,255,0.1)",
              color: role?.color || "#fff",
            }}>{role?.label || selected.role}</div>
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            {[0,1,2,3].map((i) => (
              <div key={i} style={{
                width: 16, height: 16, borderRadius: "50%",
                border: `2px solid ${error ? "#ef4444" : "rgba(255,255,255,0.4)"}`,
                background: pin.length > i ? (error ? "#ef4444" : (role?.color || "#fff")) : "transparent",
                transition: "all 0.15s",
              }} />
            ))}
          </div>

          {error && (
            <div style={{ color: "#ef4444", fontSize: 13, fontWeight: 600, marginTop: -8 }}>
              PIN ไม่ถูกต้อง ลองใหม่
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            {[1,2,3,4,5,6,7,8,9,"",0,"⌫"].map((d, i) => (
              <button
                key={i}
                onClick={() => d === "⌫" ? handlePinBack() : d !== "" ? handlePinDigit(String(d)) : null}
                disabled={d === ""}
                style={{
                  width: 60, height: 60, borderRadius: 12,
                  fontSize: d === "⌫" ? 20 : 22, fontWeight: 700,
                  background: d === "" ? "transparent" : "rgba(255,255,255,0.1)",
                  border: d === "" ? "none" : "1.5px solid rgba(255,255,255,0.15)",
                  color: "#fff", cursor: d === "" ? "default" : "pointer",
                }}
                onMouseEnter={(e) => { if (d !== "") e.currentTarget.style.background = "rgba(255,255,255,0.2)"; }}
                onMouseLeave={(e) => { if (d !== "") e.currentTarget.style.background = "rgba(255,255,255,0.1)"; }}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
