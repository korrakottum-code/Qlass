import { useState, useEffect, useMemo, useCallback } from "react";

// Public Google Sheet — sheet "Data รวมทุกสาขา"
const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1BSFAgdJHgIQ90TyNe3KAMB_vHJLpj9GwbJTQvZLfsbc/export?format=csv&gid=2109402447";

const REFRESH_MS = 60 * 60 * 1000; // 1 hour

// ─── tiny CSV parser (handles quoted commas) ───
function parseCSVLine(line) {
  const out = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (c === "," && !inQuote) {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

// Parse CSV → [{ day: "YYYY-MM-DD", amount: number }]
// Uses only column A (Day) + column C (Amount Spent)
function parseSheet(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length < 3) continue;
    const day = (cols[0] || "").trim();
    const amount = parseFloat((cols[2] || "").replace(/,/g, ""));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || isNaN(amount)) continue;
    rows.push({ day, amount });
  }
  return rows;
}

const fmtBaht = (n) =>
  "฿" + Math.round(n).toLocaleString("en-US");

export default function AdSpendCard({ dateRange, rangeLabel, selectedDate }) {
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastFetched, setLastFetched] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(SHEET_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const parsed = parseSheet(text);
      setRows(parsed);
      setLastFetched(new Date());
    } catch (e) {
      setError(e.message || "โหลดข้อมูลไม่ได้");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  // ─── aggregate by day ───
  const byDate = useMemo(() => {
    const m = {};
    (rows || []).forEach((r) => {
      m[r.day] = (m[r.day] || 0) + r.amount;
    });
    return m;
  }, [rows]);

  const rangeTotal = useMemo(() => {
    if (!dateRange) return 0;
    let sum = 0;
    for (const [day, amt] of Object.entries(byDate)) {
      if (day >= dateRange.start && day <= dateRange.end) sum += amt;
    }
    return sum;
  }, [byDate, dateRange]);

  const monthPrefix = (selectedDate || "").slice(0, 7);
  const monthTotal = useMemo(() => {
    if (!monthPrefix) return 0;
    let sum = 0;
    for (const [day, amt] of Object.entries(byDate)) {
      if (day.startsWith(monthPrefix)) sum += amt;
    }
    return sum;
  }, [byDate, monthPrefix]);

  // last 14 days mini chart
  const chartData = useMemo(() => {
    const arr = [];
    const today = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      arr.push({ day: key, amount: byDate[key] || 0 });
    }
    return arr;
  }, [byDate]);

  const chartMax = Math.max(...chartData.map((d) => d.amount), 1);
  const todayKey = new Date().toISOString().slice(0, 10);

  return (
    <div
      className="card"
      style={{
        marginBottom: 16,
        background:
          "linear-gradient(135deg, rgba(34,197,94,0.06) 0%, rgba(59,130,246,0.06) 100%)",
        border: "1.5px solid rgba(34,197,94,0.25)",
      }}
    >
      <div
        className="card-header"
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h3 style={{ margin: 0 }}>💰 ค่าโฆษณา (ทุกช่องทาง)</h3>
          <span style={{ fontSize: 11, color: "var(--text3)" }}>
            จาก Google Sheet — รีเฟรชทุก 1 ชม.
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {lastFetched && (
            <span style={{ fontSize: 11, color: "var(--text3)" }}>
              อัปเดตล่าสุด: {lastFetched.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button
            onClick={load}
            disabled={loading}
            style={{
              padding: "4px 10px",
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 6,
              border: "1.5px solid var(--border)",
              background: "var(--surface2)",
              cursor: loading ? "wait" : "pointer",
              color: "var(--text2)",
            }}
            title="รีเฟรชเดี๋ยวนี้"
          >
            {loading ? "⏳" : "🔄"}
          </button>
        </div>
      </div>

      <div style={{ padding: "12px 16px" }}>
        {error && (
          <div style={{ padding: "10px 14px", background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.3)", borderRadius: 8, color: "#dc2626", fontSize: 13, fontWeight: 600 }}>
            ⚠️ โหลดข้อมูลไม่ได้: {error}
          </div>
        )}

        {!error && (
          <>
            {/* Top stats */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                gap: 10,
                marginBottom: 14,
              }}
            >
              <Stat
                label={`ยอดในช่วง (${rangeLabel || "—"})`}
                value={fmtBaht(rangeTotal)}
                accent="#16a34a"
              />
              <Stat
                label={`รวมเดือน ${monthPrefix}`}
                value={fmtBaht(monthTotal)}
                accent="#2563eb"
              />
              <Stat
                label="วันนี้"
                value={fmtBaht(byDate[todayKey] || 0)}
                accent="#7c3aed"
              />
            </div>

            {/* 14-day mini chart */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text2)", marginBottom: 6 }}>
                💸 ย้อนหลัง 14 วัน
              </div>
              <div style={{ display: "flex", gap: 4, alignItems: "flex-end" }}>
                {chartData.map(({ day, amount }) => {
                  const heightPct = Math.max(4, (amount / chartMax) * 70);
                  const isToday = day === todayKey;
                  const dt = new Date(day);
                  return (
                    <div key={day} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, minWidth: 28 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, color: "var(--text3)" }}>
                        {amount > 0 ? Math.round(amount / 1000) + "k" : ""}
                      </span>
                      <div
                        title={`${day}: ${fmtBaht(amount)}`}
                        style={{
                          width: "100%",
                          height: heightPct,
                          background: isToday ? "var(--accent)" : "rgba(34,197,94,0.55)",
                          borderRadius: "4px 4px 0 0",
                          minHeight: 4,
                        }}
                      />
                      <span style={{ fontSize: 9, color: isToday ? "var(--accent)" : "var(--text3)", fontWeight: isToday ? 800 : 500 }}>
                        {dt.getDate()}/{dt.getMonth() + 1}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {loading && !rows && (
              <div style={{ marginTop: 10, fontSize: 12, color: "var(--text3)" }}>กำลังโหลด...</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1.5px solid var(--border)",
        borderRadius: "var(--radius-sm)",
        padding: "10px 14px",
      }}
    >
      <div style={{ fontSize: 11, color: "var(--text3)", fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: accent, fontFamily: "var(--mono)" }}>{value}</div>
    </div>
  );
}
