import { useState, useEffect, useRef } from "react";
import { searchHnCustomers } from "../utils/supabaseService";

export default function HnLookup({ phone, onSelect }) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(false);
  const debounceRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const q = (phone || "").replace(/[^0-9]/g, "");
    if (q.length < 4) {
      setResults([]);
      setShow(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      const res = await searchHnCustomers(q);
      setResults(res);
      setShow(res.length > 0);
      setLoading(false);
    }, 400);

    return () => clearTimeout(debounceRef.current);
  }, [phone]);

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

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
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
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
          background: "var(--surface)", border: "1.5px solid var(--accent)",
          borderRadius: 8, boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
          maxHeight: 220, overflowY: "auto",
        }}>
          <div style={{ padding: "6px 10px", fontSize: 11, fontWeight: 700, color: "var(--accent)", borderBottom: "1px solid var(--border2)" }}>
            🔍 พบลูกค้าเก่าใน Pro Clinic ({results.length} รายการ)
          </div>
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
