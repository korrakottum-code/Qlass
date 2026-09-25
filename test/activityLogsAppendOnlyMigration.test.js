import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

// ประวัติการลบ (activity_logs) ต้องเพิ่ม/อ่านได้อย่างเดียวจากคีย์หน้าเว็บ — 25 ก.ย. 2569
// ก่อนแก้ ยิง PATCH/DELETE ตรงด้วยคีย์สาธารณะได้ 204 หลังแก้ 401/42501 (ทั้งแบบระบุแถวและแบบไม่กรอง)
// เทสต์นี้กันไม่ให้ใครใส่ policy/grant กว้างกลับเข้าไป และกันแอปเริ่มแก้/ลบประวัติโดยไม่รู้ว่าถูกถอนสิทธิ์

const dir = new URL("../supabase/migrations/", import.meta.url);
const file = readdirSync(dir).find((f) => f.endsWith("_activity_logs_append_only.sql"));
const sql = file ? readFileSync(new URL(file, dir), "utf8") : "";
const code = sql.replace(/^\s*--.*$/gm, "");

test("เลขเวอร์ชันของไฟล์ตรงกับที่บันทึกบนโปรดักชัน", () => {
  assert.equal(file, "20260925010543_activity_logs_append_only.sql");
});

test("สร้าง policy อ่านก่อน แล้วค่อยลบ policy เดิม (กันช่วงที่หน้าประวัติอ่านไม่ได้)", () => {
  const create = code.search(/create policy "activity_logs_read" on public\.activity_logs\s+for select/i);
  const firstDrop = code.search(/drop policy/i);
  assert.ok(create >= 0 && firstDrop > create, "ต้องสร้าง policy อ่านก่อน drop ตัวแรก");
});

test("ลบ policy เปิดกว้างทั้ง 3 ตัว และถอนสิทธิ์แก้/ลบ/ล้างจาก anon+authenticated", () => {
  for (const name of ["allow all", "Allow public update on activity_logs", "Allow public delete on activity_logs"]) {
    assert.ok(code.includes(`drop policy if exists "${name}" on public.activity_logs;`), name);
  }
  assert.match(code, /revoke update, delete, truncate, references, trigger on public\.activity_logs from anon, authenticated;/i);
});

test("ไม่มี grant และไม่แตะ INSERT policy เดิม (แอปยังต้องเพิ่มประวัติตอนลบคิว)", () => {
  assert.ok(!/\bgrant\b/i.test(code));
  assert.ok(!/Allow public insert on activity_logs/.test(code));
  assert.ok(!/revoke[^;]*\b(insert|select)\b/i.test(code));
});

test("แอปใช้ activity_logs แค่เพิ่มกับอ่าน — ถ้าเริ่มแก้/ลบ ต้องมาคิดใหม่ (สิทธิ์ถูกถอนแล้ว)", () => {
  const svc = readFileSync(new URL("../src/utils/supabaseService.js", import.meta.url), "utf8");
  const uses = [...svc.matchAll(/from\("activity_logs"\)\s*\n?\s*\.(\w+)/g)].map((m) => m[1]);
  assert.deepEqual(uses.sort(), ["insert", "select"]);
});
