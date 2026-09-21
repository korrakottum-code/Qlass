import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // พรีวิวในแอป Claude ส่งพอร์ตมาทาง PORT (autoPort) — ไม่มีก็ใช้ 5173 ตามเดิม
  // และไม่บังคับพอร์ต ถ้าชนกับเซิร์ฟเวอร์อื่น Vite จะขยับไปพอร์ตถัดไปเอง
  server: { port: Number(process.env.PORT) || 5173, strictPort: false },
  define: {
    __QLASS_RELEASE__: JSON.stringify(
      process.env.VERCEL_GIT_COMMIT_SHA || process.env.VITE_APP_RELEASE || "local",
    ),
  },
})
