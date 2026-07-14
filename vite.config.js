import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __QLASS_RELEASE__: JSON.stringify(
      process.env.VERCEL_GIT_COMMIT_SHA || process.env.VITE_APP_RELEASE || "local",
    ),
  },
})
