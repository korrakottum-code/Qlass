// ถ่ายภาพหน้าจอประกอบคู่มือจากแอปในโหมดข้อมูลสาธิต
//   1) npx vite --config scripts/screenshot/vite.config.js --port 5199
//   2) node scripts/screenshot/capture.mjs        → public/manual/*.jpg
// ใช้ Google Chrome ที่ติดตั้งในเครื่อง (playwright-core channel "chrome")
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import path from "node:path";

const BASE = process.env.SHOT_BASE || "http://localhost:5199";
const OUT = path.resolve("public/manual");
mkdirSync(OUT, { recursive: true });
const results = [];

async function shot(page, name, { fullPage = false, locator = null } = {}) {
  const file = path.join(OUT, `${name}.jpg`);
  if (locator) await locator.screenshot({ path: file, type: "jpeg", quality: 82 });
  else await page.screenshot({ path: file, type: "jpeg", quality: 82, fullPage });
  results.push(`✓ ${name}`);
}
async function step(name, fn) {
  try { await fn(); } catch (e) {
    results.push(`✗ ${name}: ${e.message.split("\n")[0]}`);
    // ปิด modal/ป๊อปอัปที่อาจค้าง เพื่อไม่ให้ขั้นถัดไปล้มตาม
    for (let i = 0; i < 3; i++) {
      const x = page.locator(".modal-close, .modal-overlay").first();
      if (!(await x.count())) break;
      await page.keyboard.press("Escape").catch(() => {});
      await page.locator(".modal-close").first().click({ timeout: 1000 }).catch(() => {});
      await wait(200);
    }
  }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function go(page, hash) {
  await page.evaluate((h) => { window.location.hash = h; }, hash);
  await wait(700);
}
async function pin(page, code) {
  for (const d of code) await page.getByRole("button", { name: d, exact: true }).click();
  await wait(800);
}
async function login(page, nickname, code) {
  await page.goto(BASE);
  await page.getByText("บัญชีที่ใช้งานได้").waitFor({ timeout: 15000 });
  await page.getByPlaceholder("พิมพ์ชื่อหรือชื่อเล่น...").fill(nickname);
  await wait(300);
  await page.getByText("›").first().click();
  await pin(page, code);
  await page.locator(".sidebar").waitFor({ timeout: 15000 });
  await wait(1200);
}
async function scrollTimeline(page, px) {
  await page.evaluate((y) => {
    const els = [...document.querySelectorAll("div")].filter((e) => e.scrollHeight > e.clientHeight + 100 && /auto|scroll/.test(getComputedStyle(e).overflowY) && e.textContent.includes("11:00"));
    els.forEach((e) => { e.scrollTop = y; });
  }, px);
  await wait(300);
}
async function closeModal(page) {
  const x = page.locator(".modal-close").first();
  if (await x.count()) await x.click();
  await wait(300);
}
const tomorrow = (n = 1) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, locale: "th-TH" });
// ตรึงเวลาเป็น 14:30 ของวันนี้ เพื่อให้ภาพมีแถบเตือน "เลยเวลา 12:00" เหมือนช่วงบ่ายจริง
const NOW = new Date(); NOW.setHours(14, 30, 0, 0);
await ctx.clock.setFixedTime(NOW);
const page = await ctx.newPage();

// ── หน้าล็อกอิน ──
await step("login", async () => {
  await page.goto(BASE);
  await page.getByText("บัญชีที่ใช้งานได้").waitFor({ timeout: 15000 });
  await page.getByPlaceholder("พิมพ์ชื่อหรือชื่อเล่น...").fill("แนน");
  await wait(300);
  await shot(page, "login-search");
  await page.getByText("›").first().click();
  await wait(300);
  await shot(page, "login-pin");
});

await login(page, "Admin", "0000");

// ── บันทึกคิว ──
await step("booking", async () => {
  await go(page, "#booking");
  await shot(page, "booking-page");
  await page.getByPlaceholder("เช่น คุณสมหญิง").fill("คุณสมหญิง ใจดี");
  await page.getByPlaceholder("08x-xxx-xxxx").fill("0891234567");
  await page.locator("select").filter({ has: page.locator('option:has-text("สาขาขอนแก่น")') }).first().selectOption({ label: "สาขาขอนแก่น" });
  await wait(200);
  await page.locator("select").filter({ has: page.locator('option:has-text("[M] M01")') }).first().selectOption({ label: "[M] M01" });
  await wait(200);
  await page.locator("select").filter({ has: page.locator('option:has-text("Botox (15 นาที)")') }).first().selectOption({ label: "Botox (15 นาที)" });
  await wait(200);
  await page.locator("select").filter({ has: page.locator('option:has-text("Botox 50u")') }).first().selectOption({ index: 1 });
  await page.locator('input[type="date"]').first().fill(tomorrow(1));
  await wait(400);
  const free = page.locator('.time-block:not(.disabled):not([title*="มีคิว"])');
  await free.nth(6).click();
  await page.locator('textarea').last().fill("แพ้ยาชา / ลูกค้า VIP");
  await wait(300);
  await shot(page, "booking-form", { fullPage: true });
  await page.getByRole("button", { name: "✅ บันทึกคิว" }).click();
  await wait(500);
  await shot(page, "booking-confirm");
  await page.getByRole("button", { name: "แก้ไข", exact: true }).click();
  await wait(200);
  await page.getByRole("button", { name: "ล้างฟอร์ม" }).click();
});

await step("smart-parse", async () => {
  await go(page, "#booking");
  await page.getByText("🤖 วิเคราะห์ข้อความอัตโนมัติ").click();
  await wait(300);
  await page.locator("textarea").first().fill("คุณแนน (นน)\n0891234567\nBotox 2,500 บาท\nพรุ่งนี้ 14:30\nลูกค้าใหม่\nสาขาสยาม\nหมายเหตุ: แพ้ยาชา");
  await wait(500);
  await shot(page, "smart-parse");
});

// ── คิวรอ ──
await step("waiting-queue", async () => {
  await go(page, "#waiting-queue");
  await shot(page, "waiting-queue");
  await page.getByRole("button", { name: /คิวไม่ยืนยัน/ }).click();
  await wait(300);
  await shot(page, "waiting-queue-unconfirmed");
  await page.getByRole("button", { name: /คิวรอลงมายังไม่ระบุ/ }).click();
  await wait(200);
  await page.getByRole("button", { name: "🗑️ ลบ" }).first().click();
  await wait(300);
  await shot(page, "queue-delete-confirm");
  await page.getByRole("button", { name: "ยกเลิก" }).last().click();
});

// ── ตารางคิว ──
await step("queue-table", async () => {
  await go(page, "#queue-table");
  await page.locator("select").filter({ has: page.locator('option:has-text("สาขาขอนแก่น")') }).first().selectOption({ label: "สาขาขอนแก่น" });
  await wait(500);
  await shot(page, "queue-table");
  // โหมดช่วงหลายวัน: ช่วงด่วน → 7 วันล่าสุด แล้วกางวันแรก
  await page.locator("select").filter({ has: page.locator('option:has-text("7 วันล่าสุด")') }).first().selectOption({ label: "7 วันล่าสุด" });
  await wait(800);
  await page.getByText(/^📅 /).first().click();
  await wait(400);
  await shot(page, "queue-table-range");
  await page.locator("select").filter({ has: page.locator('option:has-text("7 วันล่าสุด")') }).first().selectOption({ label: "วันนี้" });
  await wait(500);
  // เลือกแถวที่ยัง "รอยืนยัน" เพื่อให้เห็นปุ่มโทรตาม ×1
  await page.locator("tr", { hasText: "รอยืนยัน" }).first().getByRole("button", { name: "📋 สถานะ", exact: true }).click();
  await wait(400);
  await shot(page, "status-modal");
  await page.locator(".modal").getByRole("button", { name: "📤 เลื่อนออก", exact: true }).click();
  await wait(300);
  await shot(page, "status-reschedule");
  await closeModal(page);
  const mv = page.getByRole("button", { name: "➡️ ย้ายเข้าคิวรอ" }).first();
  if (await mv.count()) {
    await mv.click(); await wait(300);
    await shot(page, "queue-move-waiting");
    await page.getByRole("button", { name: "ยกเลิก" }).last().click();
  }
});

// ── Timeline ──
await step("timeline", async () => {
  await go(page, "#timeline");
  await page.locator("select").filter({ has: page.locator('option:has-text("สาขาขอนแก่น")') }).first().selectOption({ label: "สาขาขอนแก่น" });
  await wait(600);
  await scrollTimeline(page, 720);
  await shot(page, "timeline");
  await page.locator('[title^="คิวของ"]').first().click();
  await wait(400);
  await shot(page, "timeline-detail");
  await page.getByRole("button", { name: "✕" }).last().click();
  await wait(200);
  await page.locator('[title="กดเพื่อจองคิว"]').nth(12).click();
  await wait(400);
  await page.getByPlaceholder("ชื่อ-นามสกุล").fill("คุณวราภรณ์ ทองดี");
  await page.getByPlaceholder("0xxxxxxxxx").fill("0812345678");
  await wait(300);
  await shot(page, "timeline-mini-booking");
  await page.getByRole("button", { name: "ยกเลิก" }).last().click();
  await wait(200);
  await page.getByRole("button", { name: "กดปิดเตียง" }).first().click();
  await wait(400);
  await shot(page, "bed-switch-modal");
  await page.getByRole("button", { name: "⛔ ยืนยันปิดเตียง" }).click();
  await wait(800);
  await shot(page, "timeline-bed-closed");
  await page.getByRole("button", { name: "↩︎ กดเปิดคืน" }).first().click();
  await wait(400);
  await page.getByRole("button", { name: "🔓 เปิดเตียงคืน" }).click();
  await wait(500);
});

// ── รายงาน ──
await step("summary", async () => {
  await go(page, "#summary");
  await wait(800);
  await page.getByText("📝 คิวที่บันทึก").first().click();
  await wait(500);
  await shot(page, "summary", { fullPage: true });
});
await step("capacity", async () => {
  await go(page, "#capacity");
  await wait(1500);
  await shot(page, "capacity", { fullPage: true });
  await page.locator("td", { hasText: /^\d+%$/ }).nth(3).click();
  await wait(400);
  await shot(page, "capacity-popup");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "✕" }).last().click().catch(() => {});
});
await step("commission", async () => {
  await go(page, "#commission");
  await wait(800);
  await page.locator("tbody tr").first().click().catch(() => {});
  await wait(300);
  await shot(page, "commission", { fullPage: true });
});
await step("export", async () => {
  await go(page, "#export");
  await wait(500);
  await shot(page, "export", { fullPage: true });
});
await step("ceo", async () => {
  await go(page, "#ceo-dashboard");
  await page.getByRole("button", { name: "7 วัน", exact: true }).click();
  await wait(1500);
  await shot(page, "ceo-dashboard");
  await page.locator(".ceo-rank-item, [class*=ceo]").first().click().catch(() => {});
  await page.getByRole("button", { name: /ดูรายละเอียดเพิ่มเติม/ }).click();
  await wait(800);
  await shot(page, "ceo-dashboard-full", { fullPage: true });
});
await step("tickets", async () => {
  await go(page, "#tickets");
  await wait(400);
  await page.getByText("Timeline บนมือถือเลื่อนไม่สุด").click();
  await wait(300);
  await shot(page, "tickets", { fullPage: true });
  await page.getByRole("button", { name: "+ แจ้งปัญหาใหม่" }).click();
  await wait(300);
  await shot(page, "tickets-form");
  await page.getByRole("button", { name: "ยกเลิก" }).first().click();
});
await step("activity-log", async () => {
  await go(page, "#activity-log");
  await wait(600);
  await shot(page, "activity-log");
});

// ── ตั้งค่าระบบ ──
await step("branches", async () => { await go(page, "#branches"); await shot(page, "branches"); });
await step("procedures", async () => { await go(page, "#procedures"); await shot(page, "procedures", { fullPage: true }); });
await step("promos", async () => { await go(page, "#promos"); await shot(page, "promos", { fullPage: true }); });
await step("rooms", async () => {
  await go(page, "#rooms");
  await page.getByText("🏢 สาขาขอนแก่น").first().click();
  await wait(400);
  await shot(page, "rooms", { fullPage: true });
  await page.locator("tr", { hasText: "T03" }).getByRole("button", { name: "✏️" }).click();
  await wait(500);
  await page.getByText(/หัตถการที่ T03 รับได้/).evaluate((el) => el.scrollIntoView({ block: "start" }));
  await wait(200);
  await shot(page, "room-modal-lock");
  // พิมพ์หมายเหตุที่เอ่ยถึงหัตถการที่ไม่ได้ติ๊ก → กล่องเตือนเหลือง
  await page.locator(".modal textarea").fill("รับ Laser CO2 ด้วย");
  await wait(400);
  await page.getByText(/ล็อกกับหมายเหตุพูดคนละอย่าง/).evaluate((el) => el.scrollIntoView({ block: "center" }));
  await wait(200);
  await shot(page, "room-modal-warning");
  await closeModal(page);
});
await step("room-schedule", async () => {
  await go(page, "#room-schedule");
  await wait(400);
  await shot(page, "room-schedule");
  await page.getByRole("button", { name: "➕ เพิ่มตารางพิเศษ" }).click();
  await wait(400);
  await page.getByRole("button", { name: "🔁 ทุกวัน X" }).click();
  await wait(300);
  await shot(page, "schedule-modal");
  await closeModal(page);
});
await step("staff", async () => {
  await go(page, "#staff");
  await wait(400);
  await shot(page, "staff", { fullPage: true });
  await page.getByRole("button", { name: "➕ เพิ่มพนักงาน" }).click();
  await wait(400);
  await shot(page, "staff-modal");
  await closeModal(page);
});
await step("manual", async () => {
  await go(page, "#manual");
  await wait(500);
  await shot(page, "manual");
  await page.getByRole("button", { name: "✅ แบบทดสอบภาคปฏิบัติ" }).click();
  await wait(400);
  await shot(page, "manual-practical");
});

// ── หน้าจอแคชเชีย (เดสก์ท็อป) ──
await step("cashier-desktop", async () => {
  const cctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "th-TH" });
  await cctx.clock.setFixedTime(NOW);
  const c = await cctx.newPage();
  await login(c, "แนน", "1234");
  await go(c, "#booking");
  await wait(500);
  await shot(c, "booking-page-cashier");
  await cctx.close();
});

// ── มือถือ (แคชเชีย) ──
await step("mobile", async () => {
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "th-TH" });
  await mctx.clock.setFixedTime(NOW);
  const m = await mctx.newPage();
  await login(m, "แนน", "1234");
  await go(m, "#queue-table");
  await wait(500);
  await m.locator(".mobile-menu-btn").click();
  await wait(400);
  await shot(m, "mobile-menu");
  await m.locator(".mobile-overlay").click({ position: { x: 380, y: 400 } });
  await wait(300);
  await shot(m, "mobile-queue-table");
  await go(m, "#timeline");
  await wait(800);
  await scrollTimeline(m, 900);
  await shot(m, "mobile-timeline");
  await mctx.close();
});

await browser.close();
console.log(results.join("\n"));
