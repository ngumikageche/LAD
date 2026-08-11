import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['react-is', 'recharts'],
  },
  build: {
    // Routes are lazily imported in App.tsx, which is what keeps the initial
    // download small: recharts, xlsx, and jspdf now load only with the pages
    // that use them.
    //
    // Deliberately no `manualChunks`. Naming a shared vendor chunk makes the
    // bundler treat it as a static dependency of the entry, which put the
    // ~370 kB export bundle back into the first paint — the opposite of the
    // intent. Leaving the split to the bundler keeps those edges async.
    chunkSizeWarningLimit: 700,
  },
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      protocol: 'ws',
      host: 'localhost',
    },
  },
})
