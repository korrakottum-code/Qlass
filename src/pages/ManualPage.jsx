import { useEffect, useMemo, useState } from "react";
import { NAV_ITEMS, ROLES } from "../utils/constants";
import { MANUAL_META, MANUAL_SECTIONS } from "../manual/manualContent";
import { PRACTICAL_TESTS, QUIZ_QUESTIONS, TEST_PLAN_GUIDE } from "../manual/testContent";

const TABS = [
  { id: "guide", label: "📖 คู่มือการใช้งาน" },
  { id: "practical", label: "✅ แบบทดสอบภาคปฏิบัติ" },
  { id: "quiz", label: "🧠 แบบทดสอบความเข้าใจ" },
];

const RESULT_OPTIONS = [
  { value: "pass", label: "✅ ผ่าน" },
  { value: "fail", label: "❌ ไม่ผ่าน" },
  { value: "skip", label: "⏭ ข้าม" },
];

const NAV_LABEL = Object.fromEntries(NAV_ITEMS.filter((n) => n.id).map((n) => [n.id, `${n.icon} ${n.label}`]));
const ROLE_LABEL = Object.fromEntries(ROLES.map((r) => [r.value, r.label]));

function roleAllowedPages(role) {
  return ROLES.find((r) => r.value === role)?.pages || [];
}

// ข้อความทั้งหมดใน section รวมเป็นสตริงเดียว ใช้สำหรับช่องค้นหา
function sectionText(section) {
  const parts = [section.title, section.intro || ""];
  for (const b of section.blocks || []) {
    if (b.title) parts.push(b.title);
    if (b.text) parts.push(b.text);
    if (b.items) for (const it of b.items) parts.push(typeof it === "string" ? it : `${it.q} ${it.a}`);
    if (b.headers) parts.push(b.headers.join(" "));
    if (b.rows) for (const r of b.rows) parts.push(r.join(" "));
  }
  return parts.join(" ").toLowerCase();
}

function storageKey(user) {
  return `qlass_uat_results_${user?.id || "anon"}`;
}

function loadResults(user) {
  try {
    const raw = localStorage.getItem(storageKey(user));
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

// ─── บล็อกเนื้อหาของคู่มือ ───
function Block({ block }) {
  switch (block.type) {
    case "p":
      return <p className="manual-p">{block.text}</p>;
    case "img":
      return (
        <figure className="manual-figure">
          <a href={block.src} target="_blank" rel="noreferrer" title="เปิดภาพขนาดเต็ม">
            <img src={block.src} alt={block.caption || ""} loading="lazy" />
          </a>
          {block.caption && <figcaption>{block.caption}</figcaption>}
        </figure>
      );
    case "steps":
      return (
        <div className="manual-block">
          {block.title && <div className="manual-block-title">{block.title}</div>}
          <ol className="manual-steps">{block.items.map((it, i) => <li key={i}>{it}</li>)}</ol>
        </div>
      );
    case "list":
      return (
        <div className="manual-block">
          {block.title && <div className="manual-block-title">{block.title}</div>}
          <ul className="manual-list">{block.items.map((it, i) => <li key={i}>{it}</li>)}</ul>
        </div>
      );
    case "table":
      return (
        <div className="manual-block">
          {block.title && <div className="manual-block-title">{block.title}</div>}
          <div className="manual-table-wrap">
            <table className="data-table manual-table">
              <thead><tr>{block.headers.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
              <tbody>
                {block.rows.map((row, ri) => (
                  <tr key={ri}>{row.map((cell, ci) => <td key={ci}>{cell}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    case "tip":
      return (
        <div className="manual-callout manual-tip">
          <div className="manual-callout-title">💡 เคล็ดลับ</div>
          <ul>{block.items.map((it, i) => <li key={i}>{it}</li>)}</ul>
        </div>
      );
    case "warn":
      return (
        <div className="manual-callout manual-warn">
          <div className="manual-callout-title">⚠️ ข้อควรระวัง</div>
          <ul>{block.items.map((it, i) => <li key={i}>{it}</li>)}</ul>
        </div>
      );
    case "faq":
      return (
        <div className="manual-block">
          <div className="manual-block-title">{block.title || "❓ คำถามที่พบบ่อย"}</div>
          {block.items.map((it, i) => (
            <details key={i} className="manual-faq">
              <summary>{it.q}</summary>
              <p>{it.a}</p>
            </details>
          ))}
        </div>
      );
    default:
      return null;
  }
}

function GuideTab({ sections, currentUser, showAll, setShowAll, canToggle }) {
  const [query, setQuery] = useState("");
  const [openIds, setOpenIds] = useState(() => new Set());
  const [activeId, setActiveId] = useState(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => {
    if (!q) return sections;
    return sections.filter((s) => sectionText(s).includes(q));
  }, [sections, q]);

  const groups = useMemo(() => {
    const order = [];
    const map = new Map();
    for (const s of visible) {
      if (!map.has(s.group)) { map.set(s.group, []); order.push(s.group); }
      map.get(s.group).push(s);
    }
    return order.map((g) => ({ group: g, items: map.get(g) }));
  }, [visible]);

  // ไฮไลต์หัวข้อที่กำลังอ่านในสารบัญ (หัวข้อที่อยู่ใกล้ขอบบนของจอที่สุด)
  useEffect(() => {
    const els = [...document.querySelectorAll(".manual-section")];
    if (els.length === 0) return undefined;
    const update = () => {
      const line = 120; // ใต้แถบบน + สารบัญ
      let best = null;
      for (const el of els) {
        const top = el.getBoundingClientRect().top;
        if (top <= line) best = el; else break;
      }
      setActiveId((best || els[0]).id.replace("manual-", ""));
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [visible, openIds]);

  function toggle(id) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function jumpTo(id) {
    setOpenIds((prev) => new Set(prev).add(id));
    setTimeout(() => document.getElementById(`manual-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
    setActiveId(id);
  }
  function expandAll(open) {
    setOpenIds(open ? new Set(visible.map((s) => s.id)) : new Set());
  }

  return (
    <div className="manual-layout">
      {/* สารบัญ */}
      <aside className="manual-toc">
        {isMobile ? (
          <select className="manual-toc-select" value="" onChange={(e) => e.target.value && jumpTo(e.target.value)}>
            <option value="">{activeId ? `📍 ${sections.find((x) => x.id === activeId)?.title || ""} — เลือกหัวข้ออื่น` : "— ไปยังหัวข้อ —"}</option>
            {groups.map((g) => (
              <optgroup key={g.group} label={g.group}>
                {g.items.map((s) => <option key={s.id} value={s.id}>{s.icon} {s.title}</option>)}
              </optgroup>
            ))}
          </select>
        ) : (
          <div className="manual-toc-inner">
            <div className="manual-toc-head">สารบัญ</div>
            {groups.map((g) => (
              <div key={g.group}>
                <div className="manual-toc-group">{g.group}</div>
                {g.items.map((s) => (
                  <button key={s.id} type="button" className={`manual-toc-item ${activeId === s.id ? "active" : ""}`} onClick={() => jumpTo(s.id)}>
                    <span>{s.icon}</span><span>{s.title}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </aside>

      <div className="manual-main">
        <div className="manual-toolbar">
          <input
            type="search"
            className="manual-search"
            placeholder="🔍 ค้นหาในคู่มือ เช่น ปิดคิว, เลื่อนนัด, PIN"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {canToggle && (
            <label className="manual-toggle">
              <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
              แสดงทุกเมนู (รวมที่บทบาท {ROLE_LABEL[currentUser?.role] || "-"} ไม่ได้ใช้)
            </label>
          )}
          <div className="manual-toolbar-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => expandAll(true)}>กางทั้งหมด</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => expandAll(false)}>พับทั้งหมด</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => { expandAll(true); setTimeout(() => window.print(), 100); }}>🖨️ พิมพ์</button>
          </div>
        </div>

        {visible.length === 0 && (
          <div className="card"><div className="empty"><div className="e-icon">🔍</div><p>ไม่พบหัวข้อที่ตรงกับ "{query}"</p></div></div>
        )}

        {groups.map((g) => (
          <div key={g.group} className="manual-group">
            <h3 className="manual-group-title">{g.group}</h3>
            {g.items.map((s) => {
              const open = openIds.has(s.id) || !!q;
              const allowed = !s.pageId || roleAllowedPages(currentUser?.role).includes(s.pageId);
              return (
                <section key={s.id} id={`manual-${s.id}`} className={`card manual-section ${open ? "open" : ""}`}>
                  <button type="button" className="manual-section-head" onClick={() => toggle(s.id)} aria-expanded={open}>
                    <span className="manual-section-icon">{s.icon}</span>
                    <span className="manual-section-title">
                      {s.title}
                      {s.pageId && <span className="manual-section-menu">เมนู: {NAV_LABEL[s.pageId] || s.pageId}</span>}
                    </span>
                    {!allowed && <span className="manual-chip-muted">บทบาทของคุณไม่เห็นเมนูนี้</span>}
                    <span className="manual-chevron">{open ? "▾" : "▸"}</span>
                  </button>
                  {open && (
                    <div className="manual-section-body">
                      {s.roles && (
                        <div className="manual-roles">
                          ใช้ได้กับบทบาท: {s.roles.map((r) => ROLE_LABEL[r] || r).join(" · ")}
                        </div>
                      )}
                      {s.intro && <p className="manual-intro">{s.intro}</p>}
                      {(s.blocks || []).map((b, i) => <Block key={i} block={b} />)}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function chainOf(id) {
  return TEST_PLAN_GUIDE.chains.find((c) => c.ids.includes(id)) || null;
}

function PracticalTab({ currentUser }) {
  const myRole = currentUser?.role || "cashier";
  const [roleFilter, setRoleFilter] = useState(myRole);
  const [chainFilter, setChainFilter] = useState("all");
  const [results, setResults] = useState(() => loadResults(currentUser));
  const [currentId, setCurrentId] = useState(null);
  const [copied, setCopied] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [isNarrow, setIsNarrow] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const update = () => setIsNarrow(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    try { localStorage.setItem(storageKey(currentUser), JSON.stringify(results)); } catch { /* ignore */ }
  }, [results, currentUser]);

  const byRole = useMemo(
    () => PRACTICAL_TESTS.filter((t) => roleFilter === "all" || t.roles.includes(roleFilter)),
    [roleFilter],
  );
  const tests = useMemo(() => {
    if (chainFilter === "all") return byRole;
    if (chainFilter === "todo") return byRole.filter((t) => !results[t.id]?.result);
    if (chainFilter === "single") return byRole.filter((t) => !chainOf(t.id));
    const chain = TEST_PLAN_GUIDE.chains.find((c) => c.title === chainFilter);
    return chain ? chain.ids.map((id) => byRole.find((t) => t.id === id)).filter(Boolean) : byRole;
  }, [byRole, chainFilter, results]);

  // ข้อที่กำลังทำ: ถ้ายังไม่เลือก ให้เป็นข้อแรกที่ยังไม่มีผล
  const current = useMemo(() => {
    const found = tests.find((t) => t.id === currentId);
    if (found) return found;
    return tests.find((t) => !results[t.id]?.result) || tests[0] || null;
  }, [tests, currentId, results]);
  const currentIndex = current ? tests.findIndex((t) => t.id === current.id) : -1;

  const stats = useMemo(() => {
    const s = { pass: 0, fail: 0, skip: 0, todo: 0 };
    for (const t of tests) {
      const r = results[t.id]?.result;
      if (r === "pass" || r === "fail" || r === "skip") s[r] += 1; else s.todo += 1;
    }
    return s;
  }, [tests, results]);

  function setResult(id, patch) {
    setResults((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), ...patch, at: new Date().toISOString() } }));
  }
  function goTo(id) {
    setCurrentId(id);
    if (isNarrow) setTimeout(() => document.getElementById("manual-current-test")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }
  function chooseResult(value) {
    if (!current) return;
    setResult(current.id, { result: value });
    // เลือกผลแล้วเลื่อนไปข้อถัดไปอัตโนมัติ (เว้นแต่ไม่ผ่าน ให้พิมพ์หมายเหตุก่อน)
    if (value !== "fail") {
      const next = tests[currentIndex + 1];
      if (next) setTimeout(() => goTo(next.id), 250);
    }
  }
  function clearAll() {
    if (!window.confirm("ล้างผลการทดสอบทั้งหมดของบัญชีนี้?")) return;
    setResults({});
    setCurrentId(null);
  }
  async function copySummary() {
    const lines = [
      `สรุปผลทดสอบการใช้งาน Qlass — ${new Date().toLocaleString("th-TH")}`,
      `ผู้ทดสอบ: ${currentUser?.nickname || currentUser?.name || "-"} (${ROLE_LABEL[myRole] || myRole})`,
      `บทบาทที่ทดสอบ: ${roleFilter === "all" ? "ทุกบทบาท" : ROLE_LABEL[roleFilter]}`,
      `ผ่าน ${stats.pass} · ไม่ผ่าน ${stats.fail} · ข้าม ${stats.skip} · ยังไม่ทำ ${stats.todo} (รวม ${tests.length})`,
      "",
    ];
    for (const t of tests) {
      const r = results[t.id];
      const mark = r?.result === "pass" ? "✅" : r?.result === "fail" ? "❌" : r?.result === "skip" ? "⏭" : "⬜";
      lines.push(`${mark} ${t.id} ${t.title}${r?.note ? ` — ${r.note}` : ""}`);
    }
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("คัดลอกข้อความด้านล่างด้วยตนเอง", lines.join("\n"));
    }
  }

  const done = stats.pass + stats.fail + stats.skip;
  const pct = tests.length ? Math.round((done / tests.length) * 100) : 0;
  const mark = (id) => {
    const r = results[id]?.result;
    return r === "pass" ? "✅" : r === "fail" ? "❌" : r === "skip" ? "⏭" : "⬜";
  };
  const cur = current ? results[current.id] || {} : {};
  const curChain = current ? chainOf(current.id) : null;

  return (
    <div className="manual-main manual-practical">
      {/* ขั้นตอนการใช้ 4 ขั้น */}
      <div className="manual-stepper">
        <span>1️⃣ อ่านวิธีใช้ (1 นาที)</span><span>→</span>
        <span>2️⃣ เลือกบทบาทและสาย</span><span>→</span>
        <span>3️⃣ ทำทีละข้อ กดผล ระบบพาไปข้อถัดไป</span><span>→</span>
        <span>4️⃣ กด “คัดลอกสรุปผล” ส่งหัวหน้า</span>
      </div>

      <details className="manual-faq manual-practical-howto" open={guideOpen} onToggle={(e) => setGuideOpen(e.target.open)}>
        <summary>📌 วิธีใช้แบบทดสอบ (อ่านก่อนเริ่ม) — ลำดับ สายการทดสอบ และการเก็บกวาด</summary>
        <ol className="manual-steps">{TEST_PLAN_GUIDE.howTo.map((h, i) => <li key={i}>{h}</li>)}</ol>
        <div className="manual-block-title">สายการทดสอบ (คนเดียวทำต่อกันตามลำดับ)</div>
        <ul className="manual-list">{TEST_PLAN_GUIDE.chains.map((c, i) => <li key={i}><b>{c.title}:</b> {c.ids.join(" → ")}</li>)}</ul>
        <div className="manual-block-title">เก็บกวาดหลังทดสอบ (ทำให้เสร็จในวันเดียวกัน)</div>
        <ul className="manual-list">{TEST_PLAN_GUIDE.cleanup.map((c, i) => <li key={i}>{c}</li>)}</ul>
      </details>

      <div className="card manual-practical-head">
        <div className="card-body">
          <div className="manual-practical-controls">
            <label className="form-group">
              <span className="form-label">ทดสอบในบทบาท</span>
              <select value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setCurrentId(null); }}>
                {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}{r.value === myRole ? " (บทบาทของฉัน)" : ""}</option>)}
                <option value="all">ทุกบทบาท (สำหรับผู้ตรวจรับระบบ)</option>
              </select>
            </label>
            <label className="form-group">
              <span className="form-label">แสดงข้อ</span>
              <select value={chainFilter} onChange={(e) => { setChainFilter(e.target.value); setCurrentId(null); }}>
                <option value="all">ทุกข้อ เรียงตามหมายเลข</option>
                <option value="todo">เฉพาะที่ยังไม่ทำ</option>
                {TEST_PLAN_GUIDE.chains.map((c) => <option key={c.title} value={c.title}>{c.title}</option>)}
                <option value="single">ข้อเดี่ยว (ไม่อยู่ในสาย)</option>
              </select>
            </label>
            <div className="manual-toolbar-actions">
              <button type="button" className="btn btn-secondary btn-sm" onClick={copySummary}>{copied ? "คัดลอกแล้ว ✓" : "📋 คัดลอกสรุปผล"}</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => window.print()}>🖨️ พิมพ์</button>
              <button type="button" className="btn btn-danger btn-sm" onClick={clearAll}>ล้างผล</button>
            </div>
          </div>
          <div className="manual-progress"><div style={{ width: `${pct}%` }} /></div>
          <div className="manual-progress-label">
            <span className="manual-stat pass">✅ {stats.pass}</span> <span className="manual-stat fail">❌ {stats.fail}</span> <span className="manual-stat skip">⏭ {stats.skip}</span> <span className="manual-stat todo">⬜ {stats.todo}</span>
            &nbsp; ทำแล้ว {done}/{tests.length} ข้อ ({pct}%) — ผลบันทึกไว้ในเครื่องนี้ตามบัญชีที่เข้าสู่ระบบ
          </div>
        </div>
      </div>

      {tests.length === 0 ? (
        <div className="card"><div className="empty"><div className="e-icon">📭</div><p>{chainFilter === "todo" ? "ทำครบทุกข้อแล้ว 🎉 กด “คัดลอกสรุปผล” ส่งหัวหน้าได้เลย" : "ไม่มีข้อทดสอบสำหรับบทบาท/สายนี้"}</p></div></div>
      ) : (
        <div className="manual-practical-layout">
          {/* รายการข้อ */}
          <aside className="manual-test-list">
            {isNarrow ? (
              <select className="manual-toc-select" value={current?.id || ""} onChange={(e) => goTo(e.target.value)}>
                {tests.map((t, i) => <option key={t.id} value={t.id}>{mark(t.id)} {i + 1}. {t.id} {t.title}</option>)}
              </select>
            ) : (
              <div className="manual-test-list-inner">
                <div className="manual-toc-head">รายการข้อ ({tests.length})</div>
                {tests.map((t) => (
                  <button key={t.id} type="button" className={`manual-test-item ${current?.id === t.id ? "active" : ""} ${results[t.id]?.result || ""}`} onClick={() => goTo(t.id)}>
                    <span className="manual-test-mark">{mark(t.id)}</span>
                    <span className="manual-test-item-text"><b>{t.id}</b> {t.title}</span>
                  </button>
                ))}
              </div>
            )}
          </aside>

          {/* ข้อที่กำลังทำ */}
          {current && (
            <div className="card manual-test manual-test-current" id="manual-current-test">
              <div className="manual-test-head">
                <span className="manual-test-id">{current.id}</span>
                <span className="manual-test-title">{current.title}</span>
                <span className="manual-section-menu">ข้อที่ {currentIndex + 1} / {tests.length}{current.pageId ? ` · เมนู: ${NAV_LABEL[current.pageId] || current.pageId}` : ""}{curChain ? ` · ${curChain.title.split(" — ")[0]}` : ""}</span>
              </div>
              <div className="manual-test-body">
                <div className="manual-test-pre"><b>ทำในบทบาท:</b> {current.roles.map((r) => ROLE_LABEL[r] || r).join(" / ")}{current.precondition ? <><br /><b>เตรียมก่อน:</b> {current.precondition}</> : null}</div>
                <div className="manual-test-cols">
                  <div>
                    <div className="manual-block-title">1. ทำตามขั้นตอนนี้ในระบบจริง</div>
                    <ol className="manual-steps">{current.steps.map((st, i) => <li key={i}>{st}</li>)}</ol>
                  </div>
                  <div>
                    <div className="manual-block-title">2. เทียบว่าเห็นแบบนี้ครบทุกข้อไหม</div>
                    <ul className="manual-list manual-expected">{current.expected.map((st, i) => <li key={i}>{st}</li>)}</ul>
                  </div>
                </div>
                <div className="manual-test-result">
                  <div className="manual-block-title" style={{ width: "100%" }}>3. เลือกผล (ตรงครบทุกข้อ = ผ่าน)</div>
                  <div className="manual-result-options manual-result-big">
                    {RESULT_OPTIONS.map((o) => (
                      <button key={o.value} type="button" className={`manual-result-opt ${o.value} ${cur.result === o.value ? "active" : ""}`} onClick={() => chooseResult(o.value)}>{o.label}</button>
                    ))}
                  </div>
                  <input
                    type="text"
                    className="manual-note"
                    placeholder={cur.result === "fail" ? "พิมพ์สิ่งที่เห็นจริง (บังคับเมื่อไม่ผ่าน) แล้วกด ถัดไป" : "หมายเหตุ (ถ้ามี)"}
                    value={cur.note || ""}
                    onChange={(e) => setResult(current.id, { note: e.target.value })}
                  />
                </div>
                <div className="manual-test-nav">
                  <button type="button" className="btn btn-secondary btn-sm" disabled={currentIndex <= 0} onClick={() => goTo(tests[currentIndex - 1].id)}>← ข้อก่อนหน้า</button>
                  <span className="manual-progress-label">{cur.result ? `บันทึกผลแล้ว: ${RESULT_OPTIONS.find((o) => o.value === cur.result)?.label}` : "ยังไม่ได้เลือกผลข้อนี้"}</span>
                  <button type="button" className="btn btn-primary btn-sm" disabled={currentIndex >= tests.length - 1} onClick={() => goTo(tests[currentIndex + 1].id)}>ข้อถัดไป →</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function QuizTab({ currentUser }) {
  const myRole = currentUser?.role || "cashier";
  const [roleFilter, setRoleFilter] = useState(myRole);
  const [answers, setAnswers] = useState({});
  const [checked, setChecked] = useState(false);
  const [missing, setMissing] = useState([]); // ข้อที่ยังไม่ตอบ (หลังกดตรวจ)

  const questions = useMemo(
    () => QUIZ_QUESTIONS.filter((qq) => roleFilter === "all" || !qq.roles || qq.roles.includes(roleFilter)),
    [roleFilter],
  );
  const score = useMemo(() => questions.reduce((n, qq) => n + (answers[qq.id] === qq.answer ? 1 : 0), 0), [questions, answers]);
  const answeredCount = questions.filter((qq) => answers[qq.id] !== undefined).length;
  const pct = questions.length ? Math.round((score / questions.length) * 100) : 0;

  function reset() { setAnswers({}); setChecked(false); setMissing([]); }
  function check() {
    const miss = questions.map((qq, i) => (answers[qq.id] === undefined ? i + 1 : null)).filter(Boolean);
    if (miss.length > 0) {
      setMissing(miss);
      document.getElementById(`manual-q-${miss[0]}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setMissing([]);
    setChecked(true);
    setTimeout(() => document.getElementById("manual-quiz-top")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }
  function answer(qq, ci) {
    setAnswers((p) => ({ ...p, [qq.id]: ci }));
    setMissing((m) => m.filter((n) => questions[n - 1]?.id !== qq.id));
  }

  return (
    <div className="manual-main manual-quiz" id="manual-quiz-top">
      <div className="card">
        <div className="card-body manual-quiz-head">
          <label className="form-group">
            <span className="form-label">ชุดคำถามสำหรับบทบาท</span>
            <select value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); reset(); }}>
              {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}{r.value === myRole ? " (บทบาทของฉัน)" : ""}</option>)}
              <option value="all">ทุกข้อ</option>
            </select>
          </label>
          <div className="manual-quiz-meta">
            {checked
              ? <span className={`manual-quiz-score ${pct >= 80 ? "good" : "bad"}`}>คะแนน {score}/{questions.length} ({pct}%) {pct >= 80 ? "— ผ่านเกณฑ์ 80% 🎉" : "— ยังไม่ถึงเกณฑ์ 80% ดูเฉลยสีแดงด้านล่าง อ่านคู่มือหัวข้อนั้น แล้วกด “ทำใหม่”"}</span>
              : <span>ตอบแล้ว {answeredCount}/{questions.length} ข้อ · เกณฑ์ผ่าน 80% · ตอบครบแล้วกด “ตรวจคำตอบ” (ปุ่มมีทั้งบนและล่าง)</span>}
          </div>
          <div className="manual-toolbar-actions">
            {!checked
              ? <button type="button" className="btn btn-primary btn-sm" onClick={check}>ตรวจคำตอบ</button>
              : <button type="button" className="btn btn-secondary btn-sm" onClick={reset}>ทำใหม่</button>}
          </div>
        </div>
        {missing.length > 0 && (
          <div className="manual-quiz-missing">⚠️ ยังตอบไม่ครบ อีก {missing.length} ข้อ: ข้อ {missing.join(", ")} — ตอบให้ครบแล้วกดตรวจอีกครั้ง (ข้อที่ยังไม่ตอบมีกรอบสีส้ม)</div>
        )}
      </div>

      {questions.map((qq, idx) => {
        const chosen = answers[qq.id];
        const correct = chosen === qq.answer;
        const isMissing = missing.includes(idx + 1);
        return (
          <div key={qq.id} id={`manual-q-${idx + 1}`} className={`card manual-question ${checked ? (correct ? "correct" : "wrong") : ""} ${isMissing ? "missing" : ""}`}>
            <div className="manual-question-text"><span className="manual-test-id">ข้อ {idx + 1}</span> {qq.q}{isMissing && <span className="manual-chip-missing">ยังไม่ตอบ</span>}</div>
            <div className="manual-choices">
              {qq.choices.map((c, ci) => {
                let cls = "manual-choice";
                if (chosen === ci) cls += " chosen";
                if (checked && ci === qq.answer) cls += " answer";
                if (checked && chosen === ci && !correct) cls += " wrong";
                return (
                  <label key={ci} className={cls}>
                    <input type="radio" name={`q-${qq.id}`} disabled={checked} checked={chosen === ci} onChange={() => answer(qq, ci)} />
                    <span>{c}</span>
                  </label>
                );
              })}
            </div>
            {checked && (
              <div className={`manual-explain ${correct ? "ok" : ""}`}>
                {correct ? "✅ ถูกต้อง" : "❌ ยังไม่ถูก"} — {qq.explain}
              </div>
            )}
          </div>
        );
      })}

      {questions.length > 0 && (
        <div className="card manual-quiz-foot">
          {!checked
            ? <>
                <span>ตอบแล้ว {answeredCount}/{questions.length} ข้อ</span>
                <button type="button" className="btn btn-primary" onClick={check}>ตรวจคำตอบ</button>
              </>
            : <>
                <span className={`manual-quiz-score ${pct >= 80 ? "good" : "bad"}`}>คะแนน {score}/{questions.length} ({pct}%)</span>
                <button type="button" className="btn btn-secondary" onClick={reset}>ทำใหม่</button>
              </>}
        </div>
      )}
    </div>
  );
}

export default function ManualPage({ currentUser }) {
  const [tab, setTab] = useState(() => {
    try { return localStorage.getItem("qlass_manual_tab") || "guide"; } catch { return "guide"; }
  });
  useEffect(() => { try { localStorage.setItem("qlass_manual_tab", tab); } catch { /* ignore */ } }, [tab]);

  const allowed = roleAllowedPages(currentUser?.role);
  const canToggle = ROLES.find((r) => r.value === currentUser?.role)?.branchScope === "all";
  const [showAll, setShowAll] = useState(false);

  const sections = useMemo(() => {
    if (showAll && canToggle) return MANUAL_SECTIONS;
    return MANUAL_SECTIONS.filter((s) => !s.pageId || allowed.includes(s.pageId));
  }, [showAll, canToggle, allowed]);

  return (
    <div className="manual-page">
      <div className="manual-header">
        <div>
          <h2 className="manual-h2">📖 คู่มือการใช้งาน Qlass</h2>
          <div className="manual-sub">
            เวอร์ชันคู่มือ {MANUAL_META.version} · ปรับปรุง {MANUAL_META.updatedAt} · บทบาทของคุณ: <b>{ROLE_LABEL[currentUser?.role] || "-"}</b>
          </div>
        </div>
        <div className="manual-tabs">
          {TABS.map((t) => (
            <button key={t.id} type="button" className={`manual-tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </div>
      </div>

      {tab === "guide" && <GuideTab sections={sections} currentUser={currentUser} showAll={showAll} setShowAll={setShowAll} canToggle={canToggle} />}
      {tab === "practical" && <PracticalTab currentUser={currentUser} />}
      {tab === "quiz" && <QuizTab currentUser={currentUser} />}
    </div>
  );
}
