import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs/promises'
import path from 'node:path'

/**
 * During build, copy the standalone viewer script into the dist output so
 * viewer.html can reference it at /assets/js/viewer.js.
 */
function createStaticViewerAssetPlugin() {
  const workspaceRoot = process.cwd()
  const viewerScriptSource = path.resolve(workspaceRoot, 'assets/js/viewer.js')
  const viewerScriptTarget = path.resolve(workspaceRoot, 'dist/assets/js/viewer.js')

  return {
    name: 'static-viewer-asset-plugin',
    async closeBundle() {
      await fs.mkdir(path.dirname(viewerScriptTarget), { recursive: true })
      await fs.copyFile(viewerScriptSource, viewerScriptTarget)
    },
  }
}

export default defineConfig({
  plugins: [react(), createStaticViewerAssetPlugin()],

  // Always serve from root — no GitHub Pages subpath needed.
  base: '/',

  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: path.resolve(import.meta.dirname, 'index.html'),
        client: path.resolve(import.meta.dirname, 'client.html'),
        viewer: path.resolve(import.meta.dirname, 'viewer.html'),
        viewerCommented: path.resolve(import.meta.dirname, 'viewer-commented.html'),
      },
    },
  },

  server: {
    // During local dev, forward API and project asset requests to the backend.
    proxy: {
      '/api': 'http://localhost:3100',
      '/projects': 'http://localhost:3100',
    },
  },
})
