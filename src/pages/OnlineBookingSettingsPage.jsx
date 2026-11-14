import { useEffect, useMemo, useState } from "react";
import { getServerSessionToken, fetchOnlineBookingSettings, saveOnlineBookingSettings } from "../utils/onlineBookingApi";
import { customerBookingLink } from "../utils/publicBooking";

// ตั้งค่า "ลูกค้าจองเอง" (/#book): เปิด/ปิดทีละสาขา + เลือกบริการ (โปร) ที่ให้ลูกค้าจองได้
// ข้อมูลอยู่ในตาราง online_booking_* (ปิดจากคีย์หน้าเว็บ) อ่าน/เขียนผ่าน staff-session เท่านั้น — superadmin / head_admin
// โปรของ Class Go จองได้เฉพาะสาขา Class Go และกลับกัน (เซิร์ฟเวอร์กรองให้เอง เลือกรวมกันได้)

// ลิงก์แจกลูกค้าใช้ที่อยู่ลูกค้าเสมอ (ไม่ใช่ที่อยู่ระบบพนักงาน) — เว้นโหมดเดโม/เครื่องนักพัฒนาที่ใช้ที่อยู่ตัวเอง
function bookingLink(branchId) {
  if (/^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)) {
    const base = `${window.location.origin}${window.location.pathname}`;
    return branchId ? `${base}#book/${branchId}` : `${base}#book`;
  }
  return customerBookingLink(branchId);
}

// การล็อกอินหมดอายุ (ครบ 8 ชม.) ตอบ 401 invalid_session — ต้องบอกให้ออกแล้วเข้าใหม่ ไม่ใช่ "ลองอีกครั้ง" (กดซ้ำก็ไม่ผ่าน)
const EXPIRED_TEXT = "การเข้าสู่ระบบหมดอายุ — ออกจากระบบแล้วเข้าใหม่ แล้วค่อยตั้งค่าอีกครั้ง";
function isSessionExpired(err) {
  return err?.context?.status === 401 || err?.message === "invalid_session";
}

export default function OnlineBookingSettingsPage({ branches, promos, procedures, rooms, onToast }) {
  const [loaded, setLoaded] = useState(null); // { branches: Map(id → active), promoIds: Set }
  const [branchActive, setBranchActive] = useState({});
  const [selected, setSelected] = useState(new Set());
  const [search, setSearch] = useState("");
  const [onlyChosen, setOnlyChosen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchOnlineBookingSettings(getServerSessionToken())
      .then((data) => {
        if (cancelled) return;
        const map = {};
        (data.branches || []).forEach((b) => { map[b.branchId] = b.active; });
        setLoaded({ branches: map, promoIds: new Set(data.promoIds || []) });
        setBranchActive(map);
        setSelected(new Set(data.promoIds || []));
      })
      .catch((err) => { if (!cancelled) setLoadError(isSessionExpired(err) ? EXPIRED_TEXT : "โหลดการตั้งค่าไม่สำเร็จ ลองรีเฟรชหน้า"); });
    return () => { cancelled = true; };
  }, []);

  const procById = useMemo(() => Object.fromEntries((procedures || []).map((p) => [p.id, p])), [procedures]);
  const roomCount = useMemo(() => {
    const counts = {};
    (rooms || []).forEach((r) => { counts[r.branchId] = (counts[r.branchId] || 0) + 1; });
    return counts;
  }, [rooms]);

  // บริการที่เปิดอยู่ จัดกลุ่มตามหัตถการ — โปรที่ปิดไปแล้วแต่ยังถูกเลือกไว้ โชว์ด้วย (เซิร์ฟเวอร์ไม่ให้จอง) ให้เอาออกได้
  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const byProc = {};
    (promos || []).forEach((p) => {
      if (!p.active && !selected.has(p.id)) return;
      if (onlyChosen && !selected.has(p.id)) return;
      const proc = procById[p.procedureId];
      const procName = proc?.name || "(ไม่มีหัตถการ)";
      if (q && !`${p.name} ${procName}`.toLowerCase().includes(q)) return;
      if (!byProc[procName]) byProc[procName] = { name: procName, category: proc?.category || "", items: [] };
      byProc[procName].items.push(p);
    });
    return Object.values(byProc)
      .sort((a, b) => a.name.localeCompare(b.name, "th"))
      .map((g) => ({ ...g, items: g.items.sort((a, b) => (a.sortOrder - b.sortOrder) || (a.price - b.price)) }));
  }, [promos, procById, search, onlyChosen, selected]);

  const changedBranches = useMemo(() => {
    if (!loaded) return [];
    return Object.entries(branchActive)
      .filter(([id, active]) => loaded.branches[id] !== active)
      .map(([branchId, active]) => ({ branchId, active }));
  }, [branchActive, loaded]);
  const promosChanged = loaded
    && (selected.size !== loaded.promoIds.size || [...selected].some((id) => !loaded.promoIds.has(id)));
  const dirty = changedBranches.length > 0 || promosChanged;

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function save() {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      const data = await saveOnlineBookingSettings(getServerSessionToken(), changedBranches, [...selected]);
      const map = {};
      (data.branches || []).forEach((b) => { map[b.branchId] = b.active; });
      setLoaded({ branches: map, promoIds: new Set(data.promoIds || []) });
      setBranchActive(map);
      setSelected(new Set(data.promoIds || []));
      onToast?.("success", "บันทึกการตั้งค่าจองออนไลน์แล้ว");
    } catch (err) {
      onToast?.("error", isSessionExpired(err) ? EXPIRED_TEXT : "บันทึกไม่สำเร็จ ลองอีกครั้ง");
    } finally {
      setSaving(false);
    }
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      onToast?.("success", "คัดลอกลิงก์แล้ว");
    } catch {
      onToast?.("error", "คัดลอกไม่ได้ — กดค้างที่ลิงก์เพื่อคัดลอกเอง");
    }
  }

  if (loadError) return <div className="card" style={{ padding: 20, color: "var(--red)" }}>{loadError}</div>;
  if (!loaded) return <div style={{ padding: 24 }}>กำลังโหลด…</div>;

  const openBranches = (branches || []).filter((b) => branchActive[b.id]);

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>🌐 จองออนไลน์ (ลูกค้าจองเอง)</h2>

      <div className="card" style={{ padding: 16, marginBottom: 16, fontSize: 13, color: "var(--text2)", lineHeight: 1.7 }}>
        ลูกค้าเปิดลิงก์แล้วเลือกสาขา บริการ วันและเวลาเอง คิวเข้าตารางทันที หมายเหตุขึ้นต้นว่า <b>[จองออนไลน์]</b><br />
        จองได้ล่วงหน้าไม่เกิน 14 วัน และต้องก่อนเวลานัดอย่างน้อย 2 ชั่วโมง · เบอร์เดียวมีคิวออนไลน์ค้างได้ไม่เกิน 2 วัน วันละไม่เกิน 3 คิว ·
        Pico/Hifu/Ultraformer ต้องอยู่ก่อนเวลาฉีด (Botox/Filler/Meso) ของคนเดียวกันในวันเดียวกัน ·
        ใช้คูปองได้คิวละ 1–3 ใบ ระบบจองเวลาให้ตามจำนวนใบ ·
        ระบบเลือกเตียงให้ตามกติกาเดียวกับหน้าลงคิว · <b>ยังไม่มี OTP</b> ใครก็กรอกเบอร์ได้
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>1. สาขาที่เปิดให้จอง</div>
        {(branches || []).map((b) => {
          const on = Boolean(branchActive[b.id]);
          const noRooms = !roomCount[b.id];
          return (
            <label key={b.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px solid var(--border)", cursor: "pointer" }}>
              <input type="checkbox" style={{ width: "auto" }} checked={on} onChange={() => setBranchActive((prev) => ({ ...prev, [b.id]: !on }))} />
              <span style={{ flex: 1 }}>{b.name}</span>
              {on && noRooms && <span style={{ color: "var(--amber)", fontSize: 12 }}>ยังไม่มีเตียง — ลูกค้ายังจองไม่ได้</span>}
            </label>
          );
        })}
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 700, flex: 1 }}>2. บริการที่ให้ลูกค้าจอง <span style={{ color: "var(--text3)", fontWeight: 400 }}>(เลือกแล้ว {selected.size})</span></div>
          <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" style={{ width: "auto" }} checked={onlyChosen} onChange={() => setOnlyChosen((v) => !v)} /> ดูเฉพาะที่เลือก
          </label>
        </div>
        <input className="input" placeholder="ค้นหาโปร / หัตถการ" value={search} onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 10 }} />
        {groups.length === 0 && <div style={{ color: "var(--text3)", fontSize: 13 }}>ไม่พบบริการ</div>}
        {groups.map((g) => (
          <div key={g.name} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text2)", margin: "6px 0" }}>
              {g.name}{g.category === "Class Go" ? " · เฉพาะสาขา Class Go" : ""}
            </div>
            {g.items.map((p) => (
              <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0 4px 8px", cursor: "pointer" }}>
                <input type="checkbox" style={{ width: "auto" }} checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                <span style={{ flex: 1 }}>{p.name}{!p.active ? " (ปิดใช้แล้ว)" : ""}</span>
                <span style={{ color: "var(--text3)", fontSize: 13 }}>{Number(p.price).toLocaleString()} ฿</span>
              </label>
            ))}
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>3. ลิงก์ส่งให้ลูกค้า</div>
        {[{ id: "", name: "ทุกสาขาที่เปิด (ลูกค้าเลือกสาขาเอง)" }, ...openBranches].map((b) => (
          <div key={b.id || "all"} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", flexWrap: "wrap" }}>
            <span style={{ minWidth: 160, fontSize: 13 }}>{b.name}</span>
            <code style={{ flex: 1, fontSize: 12, wordBreak: "break-all", color: "var(--text2)" }}>{bookingLink(b.id)}</code>
            <button type="button" className="btn btn-sm btn-secondary" onClick={() => copy(bookingLink(b.id))}>คัดลอก</button>
          </div>
        ))}
        {dirty && <div style={{ color: "var(--amber)", fontSize: 12, marginTop: 6 }}>ยังไม่ได้บันทึก — ลิงก์จะใช้ได้ตามที่ตั้งหลังกดบันทึก</div>}
      </div>

      <div style={{ position: "sticky", bottom: 0, background: "var(--bg)", padding: "10px 0" }}>
        <button type="button" className="btn btn-primary" disabled={!dirty || saving} onClick={save} style={{ width: "100%" }}>
          {saving ? "กำลังบันทึก…" : dirty ? "บันทึกการตั้งค่า" : "บันทึกแล้ว"}
        </button>
      </div>
    </div>
  );
}
