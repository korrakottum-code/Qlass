import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// ไซด์บาร์เป็น position:fixed เนื้อหาจึงถูกดันด้วย margin-left ของ .main แทน
// ถ้าสองค่านี้ไม่ตรงกัน จะเหลือช่องว่างเปล่าทางซ้าย (หรือเนื้อหามุดใต้ไซด์บาร์)
//
// ของเดิม .main ล็อก margin-left:220px ไว้ตายตัว พอหุบไซด์บาร์เหลือ 72px
// เนื้อหาไม่ขยายตาม เหลือช่องว่าง 148px ทางซ้ายทั้งหน้า (เจอจริง 12 ก.ย. 2569)
//
// อ่านเป็นข้อความแบบเดียวกับ guard อื่นในโปรเจกต์ เพราะ .jsx/.css import ตรง ๆ ใน node ไม่ได้

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const css = read("../src/index.css");
const app = read("../src/App.jsx");
const sidebar = read("../src/components/Sidebar.jsx");

const px = (pattern, label) => {
  const m = css.match(pattern);
  assert.ok(m, `หา ${label} ใน index.css ไม่เจอ`);
  return Number(m[1]);
};

test("กางไซด์บาร์: ความกว้างไซด์บาร์ = margin-left ของเนื้อหา", () => {
  const sidebarWidth = px(/\.sidebar\{[^}]*?width:(\d+)px/, "ความกว้าง .sidebar");
  const mainMargin = px(/\.main\{[^}]*?margin-left:(\d+)px/, "margin-left ของ .main");
  assert.equal(mainMargin, sidebarWidth);
});

test("หุบไซด์บาร์: ความกว้างที่หุบแล้ว = margin-left ของเนื้อหาตอนหุบ", () => {
  const collapsedWidth = px(/\.sidebar\.collapsed\{width:(\d+)px\}/, "ความกว้าง .sidebar.collapsed");
  const collapsedMargin = px(/\.main\.sidebar-collapsed\{margin-left:(\d+)px\}/, "margin-left ของ .main.sidebar-collapsed");
  assert.equal(collapsedMargin, collapsedWidth);
});

test("มือถือ: ไซด์บาร์เลื่อนออกนอกจอ เนื้อหาต้องไม่เหลือ margin ค้างทั้งสองสถานะ", () => {
  const mobileBlock = css.slice(css.indexOf("@media(max-width:768px){"));
  assert.match(mobileBlock, /\.main,\s*\.main\.sidebar-collapsed\{margin-left:0\}/);
});

test("สถานะหุบอยู่ที่ App.jsx ไม่ใช่ในไซด์บาร์ — .main จึงรู้ว่าต้องขยายเมื่อไหร่", () => {
  assert.match(app, /const \[sidebarCollapsed, setSidebarCollapsed\] = useState\(/);
  assert.match(app, /className=\{`main\$\{sidebarCollapsed \? " sidebar-collapsed" : ""\}`\}/);
  assert.match(app, /collapsed=\{sidebarCollapsed\}/);
  assert.match(app, /onToggleCollapsed=\{/);
  assert.doesNotMatch(sidebar, /useState\([^)]*\)[^;]*;\s*\/\/[^\n]*collapsed/);
  assert.doesNotMatch(sidebar, /setCollapsed/);
});
