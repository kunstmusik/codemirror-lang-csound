import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

function githubPagesBase() {
  const repository = process.env.GITHUB_REPOSITORY
  if (!repository) return '/'

  const [, repoName] = repository.split('/')
  return repoName ? `/${repoName}/` : '/'
}

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? githubPagesBase() : '/',
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
