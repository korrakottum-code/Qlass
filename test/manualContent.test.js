// ตรวจความสอดคล้องของเนื้อหาคู่มือ + แบบทดสอบ กับเมนู/บทบาทจริงใน constants
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { NAV_ITEMS, ROLES } from "../src/utils/constants.js";
import { MANUAL_SECTIONS, MANUAL_META } from "../src/manual/manualContent.js";
import { QUIZ_META, QUIZ_QUESTIONS } from "../src/manual/testContent.js";

const PAGE_IDS = new Set(NAV_ITEMS.filter((n) => n.id).map((n) => n.id));
const ROLE_IDS = new Set(ROLES.map((r) => r.value));
const SECTION_IDS = new Set(MANUAL_SECTIONS.map((s) => s.id));
const BLOCK_TYPES = new Set(["p", "steps", "list", "table", "tip", "warn", "faq", "img"]);

test("เมนูคู่มืออยู่ใน NAV_ITEMS และทุกบทบาทเข้าถึงได้", () => {
  assert.ok(PAGE_IDS.has("manual"));
  for (const r of ROLES) assert.ok(r.pages.includes("manual"), `${r.value} ต้องเห็นเมนูคู่มือ`);
  // ต้องอยู่ท้ายสุด ไม่แทรกลำดับ pages[0] ซึ่งเป็นหน้าแรกหลังล็อกอิน
  for (const r of ROLES) assert.notEqual(r.pages[0], "manual", `${r.value} หน้าแรกต้องไม่ใช่คู่มือ`);
});

test("section ทุกอันมี id ไม่ซ้ำ, pageId ถูกต้อง, roles ถูกต้อง, block type ถูกต้อง", () => {
  assert.ok(MANUAL_META.version && MANUAL_META.updatedAt);
  assert.equal(SECTION_IDS.size, MANUAL_SECTIONS.length, "section id ซ้ำ");
  for (const s of MANUAL_SECTIONS) {
    assert.ok(s.title && s.icon && s.group, `${s.id} ขาด title/icon/group`);
    if (s.pageId !== null) assert.ok(PAGE_IDS.has(s.pageId), `${s.id}: pageId ${s.pageId} ไม่มีใน NAV_ITEMS`);
    if (s.roles) {
      for (const r of s.roles) assert.ok(ROLE_IDS.has(r), `${s.id}: role ${r} ไม่รู้จัก`);
      // roles ที่ระบุต้องเข้าเมนูนั้นได้จริง
      if (s.pageId) {
        for (const r of s.roles) {
          const role = ROLES.find((x) => x.value === r);
          assert.ok(role.pages.includes(s.pageId), `${s.id}: ${r} เข้าเมนู ${s.pageId} ไม่ได้ตาม ROLES`);
        }
      }
    }
    assert.ok(Array.isArray(s.blocks) && s.blocks.length > 0, `${s.id} ไม่มี blocks`);
    for (const b of s.blocks) {
      assert.ok(BLOCK_TYPES.has(b.type), `${s.id}: block type ${b.type} ไม่รู้จัก`);
      if (b.type === "table") {
        assert.ok(b.headers.length > 0);
        for (const row of b.rows) assert.equal(row.length, b.headers.length, `${s.id}: แถวตารางมีจำนวนช่องไม่เท่าหัวตาราง`);
      }
      if (b.type === "faq") for (const it of b.items) assert.ok(it.q && it.a, `${s.id}: faq ขาด q/a`);
      if (b.type === "img") {
        assert.ok(b.src?.startsWith("/manual/"), `${s.id}: img src ต้องอยู่ใต้ /manual/`);
        assert.ok(existsSync(`public${b.src}`), `${s.id}: ไม่พบไฟล์ภาพ public${b.src} (รัน scripts/screenshot/capture.mjs)`);
        assert.ok(b.caption, `${s.id}: ภาพต้องมีคำบรรยาย`);
      }
      if (["steps", "list", "tip", "warn"].includes(b.type)) assert.ok(b.items.length > 0, `${s.id}: ${b.type} ว่าง`);
    }
  }
});

test("ทุกเมนูใน NAV_ITEMS มีหัวข้อคู่มืออย่างน้อย 1 หัวข้อ", () => {
  const covered = new Set(MANUAL_SECTIONS.map((s) => s.pageId).filter(Boolean));
  for (const id of PAGE_IDS) {
    if (id === "manual") continue;
    assert.ok(covered.has(id), `เมนู ${id} ยังไม่มีคู่มือ`);
  }
});

test("แบบทดสอบก่อน/หลังเทรน: 30 ข้อ id ไม่ซ้ำ answer อยู่ในช่วง choices ไม่ผูกบทบาท และมี 2 รอบ", () => {
  assert.equal(QUIZ_QUESTIONS.length, 30, "ต้องมี 30 ข้อพอดี (เจ้าของกำหนด)");
  assert.deepEqual(QUIZ_META.rounds.map((r) => r.id), ["pre", "post"]);
  assert.ok(QUIZ_META.passPct > 0 && QUIZ_META.passPct <= 100);
  const ids = new Set();
  for (const q of QUIZ_QUESTIONS) {
    assert.ok(!ids.has(q.id), `id ซ้ำ ${q.id}`); ids.add(q.id);
    assert.ok(SECTION_IDS.has(q.sectionId), `${q.id}: sectionId ${q.sectionId} ไม่มี`);
    assert.ok(q.choices.length >= 2, `${q.id}: choices น้อยเกินไป`);
    assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.choices.length, `${q.id}: answer ผิดช่วง`);
    assert.ok(q.explain, `${q.id}: ไม่มีเฉลย`);
    assert.equal(q.roles, undefined, `${q.id}: ทุกบทบาทต้องตอบชุดเดียวกัน ห้ามผูก roles`);
  }
});
