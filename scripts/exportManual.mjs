// สร้างเอกสาร Markdown จากเนื้อหาคู่มือ/แบบทดสอบชุดเดียวกับที่ใช้ในแอป
//   node scripts/exportManual.mjs  → docs/USER_MANUAL.md, docs/UAT_TEST_PLAN.md
import { writeFileSync } from "node:fs";
import { NAV_ITEMS, ROLES } from "../src/utils/constants.js";
import { MANUAL_META, MANUAL_SECTIONS } from "../src/manual/manualContent.js";
import { PRACTICAL_TESTS, QUIZ_QUESTIONS, TEST_PLAN_GUIDE } from "../src/manual/testContent.js";

const NAV_LABEL = Object.fromEntries(NAV_ITEMS.filter((n) => n.id).map((n) => [n.id, `${n.icon} ${n.label}`]));
const ROLE_LABEL = Object.fromEntries(ROLES.map((r) => [r.value, r.label]));
const esc = (s) => String(s).replace(/\|/g, "\\|");

function renderBlock(b) {
  switch (b.type) {
    case "p": return `${b.text}\n`;
    case "img": return `![${b.caption || ""}](../public${b.src})\n${b.caption ? `*${b.caption}*\n` : ""}`;
    case "steps": return `${b.title ? `**${b.title}**\n\n` : ""}${b.items.map((it, i) => `${i + 1}. ${it}`).join("\n")}\n`;
    case "list": return `${b.title ? `**${b.title}**\n\n` : ""}${b.items.map((it) => `- ${it}`).join("\n")}\n`;
    case "tip": return `> 💡 **เคล็ดลับ**\n${b.items.map((it) => `> - ${it}`).join("\n")}\n`;
    case "warn": return `> ⚠️ **ข้อควรระวัง**\n${b.items.map((it) => `> - ${it}`).join("\n")}\n`;
    case "table": return `${b.title ? `**${b.title}**\n\n` : ""}| ${b.headers.map(esc).join(" | ")} |\n| ${b.headers.map(() => "---").join(" | ")} |\n${b.rows.map((r) => `| ${r.map(esc).join(" | ")} |`).join("\n")}\n`;
    case "faq": return `${b.items.map((it) => `**ถาม: ${it.q}**\n\nตอบ: ${it.a}\n`).join("\n")}`;
    default: return "";
  }
}

let manual = `# คู่มือการใช้งาน Qlass\n\nเวอร์ชัน ${MANUAL_META.version} · ปรับปรุง ${MANUAL_META.updatedAt}\n\n`;
manual += `> คู่มือนี้อ่านได้ในแอปที่เมนู “📖 คู่มือการใช้งาน” (มีช่องค้นหาและแบบทดสอบ) ไฟล์นี้เป็นฉบับพิมพ์/ส่งต่อ\n\n`;
manual += "## สารบัญ\n\n";
let lastGroup = null;
for (const s of MANUAL_SECTIONS) {
  if (s.group !== lastGroup) { manual += `\n**${s.group}**\n\n`; lastGroup = s.group; }
  manual += `- [${s.icon} ${s.title}](#${s.id})\n`;
}
lastGroup = null;
for (const s of MANUAL_SECTIONS) {
  if (s.group !== lastGroup) { manual += `\n---\n\n# ${s.group}\n`; lastGroup = s.group; }
  manual += `\n<a id="${s.id}"></a>\n## ${s.icon} ${s.title}\n\n`;
  if (s.pageId) manual += `เมนู: ${NAV_LABEL[s.pageId]}  \n`;
  if (s.roles) manual += `ใช้ได้กับบทบาท: ${s.roles.map((r) => ROLE_LABEL[r]).join(" · ")}\n`;
  if (s.pageId || s.roles) manual += "\n";
  if (s.intro) manual += `${s.intro}\n\n`;
  for (const b of s.blocks) manual += renderBlock(b) + "\n";
}
manual += `\n\n<!-- สร้างอัตโนมัติจาก src/manual/manualContent.js — แก้ที่ไฟล์นั้นแล้วรัน npm run manual:docs -->\n`;
writeFileSync("docs/USER_MANUAL.md", manual);

let uat = `# แบบทดสอบการใช้งาน Qlass (UAT / แบบทดสอบพนักงาน)\n\nเวอร์ชัน ${MANUAL_META.version} · ปรับปรุง ${MANUAL_META.updatedAt}\n\n`;
uat += `> ชุดเดียวกับแท็บ “แบบทดสอบ” ในเมนู “📖 คู่มือการใช้งาน” ของแอป (ในแอปติ๊กผ่าน/ไม่ผ่านและคัดลอกสรุปผลได้) ไฟล์นี้เป็นฉบับพิมพ์\n\n`;
uat += "## วิธีใช้เอกสารนี้ (อ่านก่อนเริ่ม)\n\n";
uat += TEST_PLAN_GUIDE.howTo.map((h, i) => `${i + 1}. ${h}`).join("\n") + "\n\n";
uat += "### สายการทดสอบ — คนเดียวทำต่อกันตามลำดับ\n\n";
uat += TEST_PLAN_GUIDE.chains.map((c) => `- **${c.title}:** ${c.ids.join(" → ")}`).join("\n") + "\n\n";
uat += "### ต้องมีบัญชีผู้ดูแลระบบ\n\n";
uat += PRACTICAL_TESTS.filter((t) => t.roles.length === 1 && t.roles[0] === "superadmin").map((t) => `- ${t.id} ${t.title}`).join("\n") + "\n\n";
uat += "## ส่วน A — แบบทดสอบภาคปฏิบัติ\n\n";
uat += `| # | หัวข้อ | เมนู | บทบาท |\n| --- | --- | --- | --- |\n`;
for (const t of PRACTICAL_TESTS) uat += `| ${t.id} | ${esc(t.title)} | ${t.pageId ? NAV_LABEL[t.pageId] : "—"} | ${t.roles.map((r) => ROLE_LABEL[r]).join(", ")} |\n`;
uat += "\n";
let lastSec = null;
for (const t of PRACTICAL_TESTS) {
  if (t.sectionId !== lastSec) {
    const s = MANUAL_SECTIONS.find((x) => x.id === t.sectionId);
    uat += `\n### ${s.icon} ${s.title}\n`;
    lastSec = t.sectionId;
  }
  uat += `\n#### ${t.id} ${t.title}\n\n`;
  uat += `- เมนู: ${t.pageId ? NAV_LABEL[t.pageId] : "—"}\n- บทบาท: ${t.roles.map((r) => ROLE_LABEL[r]).join(", ")}\n`;
  if (t.precondition) uat += `- เตรียมก่อน: ${t.precondition}\n`;
  uat += `\n**ขั้นตอน**\n\n${t.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\n`;
  uat += `**ผลที่ต้องได้**\n\n${t.expected.map((e) => `- [ ] ${e}`).join("\n")}\n\n`;
  uat += `ผล: ☐ ผ่าน ☐ ไม่ผ่าน ☐ ข้าม   หมายเหตุ: ______________________\n`;
}
uat += "\n---\n\n## เก็บกวาดหลังทดสอบ (ทำให้เสร็จในวันเดียวกัน)\n\n";
uat += TEST_PLAN_GUIDE.cleanup.map((c) => `- [ ] ${c}`).join("\n") + "\n";
uat += "\n---\n\n## ส่วน B — แบบทดสอบความเข้าใจ (ปรนัย เกณฑ์ผ่าน 80%)\n\nข้อที่มีวงเล็บบทบาท ให้ตอบเฉพาะเมื่อเป็นบทบาทของคุณ และนับฐานคะแนนจากข้อที่ต้องตอบ (ในแอปจะกรองและคิดคะแนนให้อัตโนมัติ)\n\n";
QUIZ_QUESTIONS.forEach((q, i) => {
  uat += `**ข้อ ${i + 1}.** ${q.q}${q.roles ? ` _(สำหรับ ${q.roles.map((r) => ROLE_LABEL[r]).join(", ")})_` : ""}\n\n`;
  uat += q.choices.map((c, ci) => `- ${["ก", "ข", "ค", "ง"][ci]}. ${c}`).join("\n") + "\n\n";
});
uat += "### เฉลย\n\n| ข้อ | คำตอบ | เหตุผล |\n| --- | --- | --- |\n";
QUIZ_QUESTIONS.forEach((q, i) => { uat += `| ${i + 1} | ${["ก", "ข", "ค", "ง"][q.answer]} | ${esc(q.explain)} |\n`; });
uat += `\n\n<!-- สร้างอัตโนมัติจาก src/manual/testContent.js — แก้ที่ไฟล์นั้นแล้วรัน npm run manual:docs -->\n`;
writeFileSync("docs/UAT_TEST_PLAN.md", uat);
console.log(`docs/USER_MANUAL.md (${MANUAL_SECTIONS.length} หัวข้อ), docs/UAT_TEST_PLAN.md (${PRACTICAL_TESTS.length} ข้อปฏิบัติ, ${QUIZ_QUESTIONS.length} ข้อปรนัย)`);
