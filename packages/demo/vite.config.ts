import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [tailwindcss(), react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/react') || id.includes('/node_modules/react-dom')) {
            return 'react'
          }

          if (
            id.includes('/node_modules/@codemirror') ||
            id.includes('/node_modules/@lezer') ||
            id.includes('/node_modules/codemirror')
          ) {
            return 'codemirror'
          }
        }
      }
    }
  },
  server: {
    open: true
  }
})
