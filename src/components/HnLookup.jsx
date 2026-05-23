import { useState, useEffect, useRef } from "react";
import { searchHnCustomers } from "../utils/supabaseService";

export default function HnLookup({ phone, name, onSelect }) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(false);
  const [source, setSource] = useState("proclinic"); // "proclinic" | "supabase"
  const [cookiesExpired, setCookiesExpired] = useState(false);
  const debounceRef = useRef(null);
  const containerRef = useRef(null);

  // Determine search query: prefer phone (digits only), fallback to name
  const rawPhone = (phone || "").replace(/[^0-9]/g, "");
  const rawName = (name || "").trim();
  const query = rawPhone.length >= 4 ? rawPhone : rawName.length >= 2 ? rawName : "";

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query) {
      setResults([]);
      setShow(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      const res = await searchHnCustomers(query);
      setResults(res);
      setShow(res.length > 0);
      // ตรวจ source จาก record แรก
      if (res.length > 0) {
        setSource(res[0].source || "proclinic");
        setCookiesExpired(res[0].cookiesExpired || false);
      }
      setLoading(false);
    }, 400);

    return () => clearTimeout(debounceRef.current);
  }, [query]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShow(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (!show && !loading) return null;

  const isExpired = source === "supabase" && cookiesExpired;

  return (
    <div ref={containerRef}>
      {loading && (
        <div style={{
          fontSize: 11, color: "var(--text3)", padding: "4px 0",
          display: "flex", alignItems: "center", gap: 4,
        }}>
          <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⏳</span>
          ค้นหา HN...
        </div>
      )}
      {show && (
        <div style={{
          background: "var(--surface)", border: "1.5px solid var(--accent)",
          borderRadius: 8, boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
          maxHeight: 220, overflowY: "auto",
        }}>
          {/* Header + badge */}
          <div style={{
            padding: "6px 10px", fontSize: 11, fontWeight: 700,
            color: "var(--accent)", borderBottom: "1px solid var(--border2)",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <span>🔍 พบลูกค้าเก่าใน Pro Clinic ({results.length} รายการ)</span>
            {isExpired && (
              <span style={{
                fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4,
                background: "rgba(234,179,8,0.15)", color: "#ca8a04",
                border: "1px solid rgba(234,179,8,0.3)",
              }}>
                🟡 ข้อมูลบางส่วน
              </span>
            )}
          </div>
          {/* Expired warning */}
          {isExpired && (
            <div style={{
              padding: "5px 10px", fontSize: 10, color: "#92400e",
              background: "rgba(234,179,8,0.08)", borderBottom: "1px solid rgba(234,179,8,0.2)",
            }}>
              ⚠️ ค้นหาจาก HN sync (อาจไม่ครบทุกสาขา) — รัน Refresh HN Cookies เพื่อข้อมูลครบ
            </div>
          )}
          {results.map((c) => (
            <div
              key={c.hnId}
              onClick={() => { onSelect(c); setShow(false); }}
              style={{
                padding: "8px 10px", cursor: "pointer",
                borderBottom: "1px solid var(--border1)",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = "var(--surface2)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
            >
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {c.firstname} {c.lastname}
                {c.nickname && <span style={{ color: "var(--text3)", fontWeight: 400 }}> ({c.nickname})</span>}
              </div>
              <div style={{ fontSize: 11, color: "var(--text2)", display: "flex", gap: 12 }}>
                <span>📞 {c.telephone}</span>
                <span style={{ color: "var(--text3)" }}>HN: {c.hnId}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
