import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// ตารางคิวแสดงหมายเหตุตอนลงคิวใต้ชื่อลูกค้า (เจ้าของสั่ง 10 พ.ย. 2569) — ลูกค้าจองออนไลน์พิมพ์จำนวนคูปองไว้ตรงนี้
const page = fs.readFileSync(new URL("../src/pages/QueueTablePage.jsx", import.meta.url), "utf8");

test("ตารางคิว: หมายเหตุอยู่ในช่องชื่อลูกค้า ต่อจากหมายเหตุสถานะ", () => {
  const cell = page.slice(page.indexOf("<div style={{ fontWeight: 600 }}>{q.name}</div>"));
  const end = cell.indexOf("</td>");
  const nameCell = cell.slice(0, end);
  assert.ok(nameCell.includes("💬 {q.statusNote}"), "หมายเหตุสถานะยังอยู่");
  assert.ok(nameCell.includes("📝 {q.note.trim()}"), "มีหมายเหตุตอนลงคิว");
  assert.ok(nameCell.indexOf("💬") < nameCell.indexOf("📝"));
});

test("ตารางคิว: หมายเหตุยาวไม่ดันแถว (ตัด 2 บรรทัด) และไม่พังเมื่อไม่มีค่า", () => {
  assert.match(page, /typeof q\.note === "string" && q\.note\.trim\(\) &&/);
  assert.match(page, /WebkitLineClamp: 2/);
  assert.match(page, /overflowWrap: "anywhere"/);
});

test("ตารางคิว: กดหมายเหตุเปิดหน้าต่างอ่านเต็ม มีปุ่มปิด (มือถือกดได้ ไม่ต้องวางเมาส์)", () => {
  assert.match(page, /onClick=\{\(\) => setNoteView\(\{ name: q\.name, note: q\.note\.trim\(\) \}\)\}/);
  assert.match(page, /e\.key === "Enter"/);
  assert.match(page, /<Modal onClose=\{\(\) => setNoteView\(null\)\}>/);
  assert.match(page, />ปิด<\/button>/);
});

test("ตารางคิว: แค่แสดงผล ไม่มีช่องแก้หรือบันทึกหมายเหตุในตาราง", () => {
  assert.doesNotMatch(page, /onChange=\{[^}]*note/i);
  assert.doesNotMatch(page, /updateQueue\(/);
});
