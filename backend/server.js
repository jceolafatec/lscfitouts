'use strict'

const express = require('express')
const path = require('path')
const cors = require('cors')

const commentsRouter = require('./routes/comments')
const projectMetaRouter = require('./routes/projectMeta')
const projectsRouter = require('./routes/projects')
const syncJsonRouter = require('./routes/syncJson')

const PORT = process.env.PORT || 3100
const HOST = process.env.HOST || '0.0.0.0'

// Projects folder is one level up from backend/ in the monorepo
const PROJECTS_ROOT = process.env.PROJECTS_ROOT || path.resolve(__dirname, '..', 'projects')
const FRONTEND_ROOT = process.env.FRONTEND_ROOT || path.resolve(__dirname, '..', 'frontend', 'dist')

const app = express()

app.use(cors())
app.use(express.json())

// Expose the resolved projects root to route handlers
app.set('projectsRoot', PROJECTS_ROOT)

// API routes
app.use('/api/comments', commentsRouter)
app.use('/api/project-meta', projectMetaRouter)
app.use('/api/projects', projectsRouter)
app.use('/api/sync-json', syncJsonRouter)

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, ts: new Date().toISOString(), projectsRoot: PROJECTS_ROOT })
})

// Serve project binary assets (GLB, PDF, images) as static files
app.use('/projects', express.static(PROJECTS_ROOT, { dotfiles: 'ignore' }))

// Serve the built React frontend
// HTML must never be cached (SPA routing), assets are content-hashed so can be cached forever.
app.use(express.static(FRONTEND_ROOT, {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) {
      res.set('Cache-Control', 'no-store')
    } else {
      res.set('Cache-Control', 'public, max-age=31536000, immutable')
    }
  },
}))

// SPA fallback: return index.html for all non-API, non-asset routes
app.get('*', (req, res) => {
  const indexPath = path.join(FRONTEND_ROOT, 'index.html')
  res.sendFile(indexPath, (err) => {
    if (err) {
      res.status(404).json({ error: 'Frontend not built yet. Run: cd frontend && npm run build' })
    }
  })
})

app.listen(PORT, HOST, () => {
  console.log(`LSC backend running on http://${HOST}:${PORT}`)
  console.log(`  Projects root : ${PROJECTS_ROOT}`)
  console.log(`  Frontend root : ${FRONTEND_ROOT}`)
})
