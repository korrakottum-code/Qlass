import { useState, useEffect, useMemo, useCallback } from "react";
import { isoToLocalDateStr, getTodayStr } from "../utils/helpers";
import { fetchAdsSpendRange } from "../utils/supabaseService";
import { computeAdsRange, sumDaily, sumMonth, ADS_CHART_DAYS } from "../utils/adsSpend";

const REFRESH_MS = 60 * 60 * 1000; // 1 ชม. — ปลายทางอัปเดตกับ Meta ไม่ถี่กว่านี้

// ข้อความอ่านง่ายสำหรับ error code ที่ Edge Function ส่งกลับ
const ERROR_LABELS = {
  invalid_session: "เซสชันหมดอายุ ลองล็อกอินใหม่",
  forbidden: "บัญชีนี้ไม่มีสิทธิ์ดูค่าโฆษณา",
  ads_token_missing: "ยังไม่ได้ตั้งค่า token ฝั่งเซิร์ฟเวอร์",
  rate_limited: "เรียกถี่เกินไป ลองใหม่อีกครั้ง",
  upstream_error: "ระบบค่าโฆษณาปลายทางปฏิเสธ/ไม่ตอบ (ตรวจ token ฝั่งเซิร์ฟเวอร์)",
  invalid_range: "ช่วงวันที่ไม่ถูกต้อง",
};

const fmtBaht = (n) =>
  "฿" + Math.round(n).toLocaleString("en-US");

export default function AdSpendCard({ dateRange, rangeLabel, selectedDate, queues = [], staff = [] }) {
  const [result, setResult] = useState(null);   // { spend, byDay, hasDaily, asOf } | null
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastFetched, setLastFetched] = useState(null);

  const today = getTodayStr();
  // ช่วงเดียวที่ครอบทุกตัวเลขในการ์ด → ยิง API ครั้งเดียวต่อการโหลด
  const range = useMemo(
    () => computeAdsRange({ dateRange, selectedDate, today }),
    [dateRange, selectedDate, today]
  );

  // โหลดครั้งแรก + รีเฟรชอัตโนมัติ + ปุ่มรีเฟรชเอง ใช้ทางเดียวกัน
  // เก็บ since/until เป็น primitive ใน deps เพื่อไม่ให้ effect วิ่งใหม่ทุก render
  const since = range?.since ?? null;
  const until = range?.until ?? null;
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!since || !until) return undefined;
    let alive = true;
    const run = async () => {
      const res = await fetchAdsSpendRange(since, until);
      if (!alive) return;
      if (res.ok) {
        setResult(res);
        setError(null);
        setLastFetched(new Date());
      } else {
        setError(res.error);
      }
      setLoading(false);
    };
    run();
    const id = setInterval(run, REFRESH_MS);
    return () => { alive = false; clearInterval(id); };
  }, [since, until, reloadKey]);

  const reload = useCallback(() => {
    setLoading(true);
    setReloadKey((k) => k + 1);
  }, []);

  const byDate = useMemo(() => result?.byDay || {}, [result]);
  const hasDaily = result?.hasDaily === true;

  // ยอดในช่วง: ถ้าไม่มีข้อมูลรายวัน ใช้ยอดรวมจาก API ได้ก็ต่อเมื่อช่วงที่ขอ = ช่วงที่เลือกพอดี
  const rangeMatchesRequest = !!(range && dateRange && dateRange.start === range.since && dateRange.end === range.until);
  const rangeTotal = useMemo(() => {
    if (!dateRange) return 0;
    if (hasDaily) return sumDaily(byDate, dateRange.start, dateRange.end);
    return rangeMatchesRequest ? (result?.spend || 0) : null; // null = บอกไม่ได้
  }, [byDate, dateRange, hasDaily, rangeMatchesRequest, result]);

  const monthPrefix = (selectedDate || "").slice(0, 7);
  const monthTotal = useMemo(
    () => (hasDaily ? sumMonth(byDate, monthPrefix) : null),
    [byDate, monthPrefix, hasDaily]
  );
  const todayTotal = hasDaily ? (byDate[today] || 0) : null;

  // ─── Admin recorder IDs (role === "admin") ───
  const adminIds = useMemo(() => {
    const set = new Set();
    (staff || []).forEach((s) => {
      if (s && s.role === "admin") set.add(s.id);
    });
    return set;
  }, [staff]);

  // ─── count queues recorded by admin (new+old only) per day ───
  // date key = createdAt (fallback to date if missing), sliced to YYYY-MM-DD
  const adminQueuesByDate = useMemo(() => {
    const m = {};
    (queues || []).forEach((q) => {
      if (!q || !q.recordedBy) return;
      if (!adminIds.has(q.recordedBy)) return;
      if (q.customerType !== "new" && q.customerType !== "old") return;
      if (q.status === "rescheduled_in") return;
      const key = q.createdAt ? isoToLocalDateStr(q.createdAt) : (q.date || "");
      if (!key) return;
      m[key] = (m[key] || 0) + 1;
    });
    return m;
  }, [queues, adminIds]);

  const sumAdminQueues = useCallback(
    (predicate) => {
      let sum = 0;
      for (const [day, n] of Object.entries(adminQueuesByDate)) {
        if (predicate(day)) sum += n;
      }
      return sum;
    },
    [adminQueuesByDate]
  );

  const rangeAdminQueues = useMemo(
    () => (dateRange ? sumAdminQueues((d) => d >= dateRange.start && d <= dateRange.end) : 0),
    [sumAdminQueues, dateRange]
  );
  const monthAdminQueues = useMemo(
    () => (monthPrefix ? sumAdminQueues((d) => d.startsWith(monthPrefix)) : 0),
    [sumAdminQueues, monthPrefix]
  );
  const cpo = (amt, n) => (amt != null && n > 0 ? amt / n : null);

  // กราฟย้อนหลัง 14 วัน — ใช้วันที่แบบ local ไม่ใช่ UTC (toISOString เลื่อนวันตาม timezone)
  const chartData = useMemo(() => {
    if (!hasDaily) return [];
    const arr = [];
    const now = new Date();
    for (let i = ADS_CHART_DAYS - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = isoToLocalDateStr(d);
      const amount = byDate[key] || 0;
      const n = adminQueuesByDate[key] || 0;
      arr.push({ day: key, amount, adminQueues: n, cpo: n > 0 ? amount / n : null });
    }
    return arr;
  }, [byDate, adminQueuesByDate, hasDaily]);

  const chartMax = Math.max(...chartData.map((d) => d.amount), 1);
  const todayKey = today;

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
            จาก Meta Ads Dashboard — รีเฟรชทุก 1 ชม.
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {lastFetched && (
            <span style={{ fontSize: 11, color: "var(--text3)" }}>
              อัปเดตล่าสุด: {lastFetched.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button
            onClick={reload}
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
            ⚠️ โหลดค่าโฆษณาไม่ได้ ({ERROR_LABELS[error] || error}) — ตัวเลขด้านล่างจึงยังไม่แสดง
          </div>
        )}
        {!error && range?.truncated && (
          <div style={{ padding: "8px 12px", marginBottom: 10, background: "rgba(234,88,12,0.08)", border: "1px solid rgba(234,88,12,0.3)", borderRadius: 8, color: "#c2410c", fontSize: 12, fontWeight: 600 }}>
            ⚠️ ช่วงที่เลือกกว้างเกิน 1 ปี — ค่าโฆษณาแสดงเฉพาะ 365 วันล่าสุดของช่วง
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
                value={rangeTotal == null ? "—" : fmtBaht(rangeTotal)}
                cpo={cpo(rangeTotal, rangeAdminQueues)}
                queueCount={rangeAdminQueues}
                accent="#16a34a"
              />
              <Stat
                label={`รวมเดือน ${monthPrefix}`}
                value={monthTotal == null ? "—" : fmtBaht(monthTotal)}
                cpo={cpo(monthTotal, monthAdminQueues)}
                queueCount={monthAdminQueues}
                accent="#2563eb"
              />
              <Stat
                label="วันนี้"
                value={todayTotal == null ? "—" : fmtBaht(todayTotal)}
                cpo={cpo(todayTotal, adminQueuesByDate[todayKey] || 0)}
                queueCount={adminQueuesByDate[todayKey] || 0}
                accent="#7c3aed"
              />
            </div>

            {/* 14-day mini chart — มีเฉพาะเมื่อ API ส่งยอดรายวันมา */}
            {!hasDaily && !loading && (
              <div style={{ fontSize: 12, color: "var(--text3)", fontStyle: "italic" }}>
                * ยังไม่มีข้อมูลรายวันจากปลายทาง — กราฟย้อนหลังและ CPO รายวันจึงไม่แสดง
              </div>
            )}
            {hasDaily && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text2)", marginBottom: 6 }}>
                💸 ย้อนหลัง 14 วัน
              </div>
              <div style={{ overflowX: "auto", paddingBottom: 4 }}>
                <div style={{ display: "flex", gap: 4, alignItems: "flex-end", minWidth: chartData.length * 52 }}>
                  {chartData.map(({ day, amount, adminQueues, cpo: dayCpo }) => {
                    const heightPct = Math.max(4, (amount / chartMax) * 70);
                    const isToday = day === todayKey;
                    const dt = new Date(day);
                    return (
                      <div key={day} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, minWidth: 36 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: "var(--text3)" }}>
                          {amount > 0 ? Math.round(amount / 1000) + "k" : ""}
                        </span>
                        <div
                          title={`${day}\n฿${Math.round(amount).toLocaleString()} / ${adminQueues} คิว = CPO ${dayCpo ? "฿" + Math.round(dayCpo).toLocaleString() : "—"}`}
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
                        <span style={{ fontSize: 9, fontWeight: 700, color: "#ea580c", fontFamily: "var(--mono)" }}>
                          {dayCpo ? "฿" + Math.round(dayCpo).toLocaleString() : "—"}
                        </span>
                        <span style={{ fontSize: 8, color: "var(--text3)" }}>
                          {adminQueues} คิว
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div style={{ marginTop: 6, fontSize: 10, color: "var(--text3)", fontStyle: "italic" }}>
                * CPO = ค่าโฆษณา / คิวที่แอดมินบันทึก (ลูกค้าใหม่+เก่า)
              </div>
            </div>
            )}

            {loading && !result && (
              <div style={{ marginTop: 10, fontSize: 12, color: "var(--text3)" }}>กำลังโหลด...</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, accent, cpo, queueCount }) {
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
      {cpo != null && (
        <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6, fontSize: 11 }}>
          <span style={{ color: "var(--text3)" }}>Est. CPO</span>
          <span style={{ fontWeight: 800, fontFamily: "var(--mono)", color: "#ea580c" }}>
            ฿{Math.round(cpo).toLocaleString()}
          </span>
        </div>
      )}
      {cpo == null && queueCount === 0 && (
        <div style={{ marginTop: 6, fontSize: 11, color: "var(--text3)" }}>Est. CPO — (ไม่มีคิวแอดมิน)</div>
      )}
      {queueCount > 0 && (
        <div style={{ fontSize: 10, color: "var(--text3)", textAlign: "right" }}>
          {queueCount} คิวแอดมิน (ใหม่+เก่า)
        </div>
      )}
    </div>
  );
}
