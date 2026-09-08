// Vite config สำหรับโหมดถ่ายภาพประกอบคู่มือ: แทน Supabase ด้วยข้อมูลสาธิตในหน่วยความจำ
//   npx vite --config scripts/screenshot/vite.config.js --port 5199
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");

export default defineConfig({
  root,
  plugins: [react()],
  envDir: here, // อ่านเฉพาะ .env ในโฟลเดอร์นี้ ไม่แตะ .env จริงของโปรเจกต์
  resolve: {
    alias: [
      { find: /^(.*\/)?utils\/supabaseService(\.js)?$/, replacement: path.join(here, "mockSupabaseService.js") },
      { find: /^(.*\/)?utils\/supabaseClient(\.js)?$/, replacement: path.join(here, "mockSupabaseClient.js") },
    ],
  },
});
