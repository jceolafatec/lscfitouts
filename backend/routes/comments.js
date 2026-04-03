'use strict'

const express = require('express')
const fs = require('fs')
const path = require('path')

const router = express.Router()

function resolveProjectDir(req, modelPath) {
  const projectsRoot = req.app.get('projectsRoot')
  if (!modelPath || typeof modelPath !== 'string') return null

  // Normalise and strip any leading /projects/ prefix coming from the frontend URL
  const normalized = modelPath.replace(/\\/g, '/').replace(/^\/+/, '').replace(/^projects\//, '')
  const parts = normalized.split('/').filter(Boolean)
  if (parts.length < 1) return null

  // Expect format: <client>/<job>[/<anything…>]
  const clientSlug = parts[0]
  const jobSlug = parts[1]
  if (!clientSlug || !jobSlug) return null

  // Prevent path traversal
  if (clientSlug.includes('..') || jobSlug.includes('..')) return null

  const projectDir = path.resolve(projectsRoot, clientSlug, jobSlug)
  if (!projectDir.startsWith(projectsRoot + path.sep) && projectDir !== projectsRoot) return null

  return projectDir
}

// GET /api/comments?modelPath=<path>
router.get('/', (req, res) => {
  const projectDir = resolveProjectDir(req, req.query.modelPath)
  if (!projectDir) return res.status(400).json({ error: 'Invalid modelPath' })

  const commentsPath = path.join(projectDir, 'comments.xml')
  try {
    const xml = fs.readFileSync(commentsPath, 'utf8')
    res.setHeader('Content-Type', 'application/xml; charset=utf-8')
    return res.status(200).send(xml)
  } catch (err) {
    if (err.code === 'ENOENT') return res.status(404).json({ error: 'No comments found' })
    throw err
  }
})

// PUT /api/comments  body: { modelPath, xml }
router.put('/', (req, res) => {
  const { modelPath, xml } = req.body || {}
  if (!xml || typeof xml !== 'string') return res.status(400).json({ error: 'Missing xml body' })

  const projectDir = resolveProjectDir(req, modelPath)
  if (!projectDir) return res.status(400).json({ error: 'Invalid modelPath' })

  fs.mkdirSync(projectDir, { recursive: true })
  fs.writeFileSync(path.join(projectDir, 'comments.xml'), xml, 'utf8')
  return res.status(200).json({ success: true })
})

// DELETE /api/comments?modelPath=<path>
router.delete('/', (req, res) => {
  const projectDir = resolveProjectDir(req, req.query.modelPath)
  if (!projectDir) return res.status(400).json({ error: 'Invalid modelPath' })

  const commentsPath = path.join(projectDir, 'comments.xml')
  try {
    fs.unlinkSync(commentsPath)
    return res.status(200).json({ success: true })
  } catch (err) {
    if (err.code === 'ENOENT') return res.status(404).json({ error: 'No comments found' })
    throw err
  }
})

module.exports = router
