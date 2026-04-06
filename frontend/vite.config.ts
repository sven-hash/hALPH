import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // Ensure frontend code and generated artifacts share the same SDK singleton.
      '@alephium/web3': fileURLToPath(new URL('../node_modules/@alephium/web3', import.meta.url))
    }
  },
  server: {
    fs: {
      allow: ['..']
    }
  }
})
