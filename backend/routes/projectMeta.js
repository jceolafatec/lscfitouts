'use strict'

const express = require('express')
const fs = require('fs')
const path = require('path')

const router = express.Router()

function resolveMetaPath(req, client, job) {
  const projectsRoot = req.app.get('projectsRoot')
  if (!client || !job) return null
  if (String(client).includes('..') || String(job).includes('..')) return null

  const metaDir = path.resolve(projectsRoot, client, job)
  if (!metaDir.startsWith(projectsRoot + path.sep) && metaDir !== projectsRoot) return null

  return path.join(metaDir, 'project-meta.xml')
}

// GET /api/project-meta?client=<slug>&job=<slug>
router.get('/', (req, res) => {
  const metaPath = resolveMetaPath(req, req.query.client, req.query.job)
  if (!metaPath) return res.status(400).json({ error: 'Invalid client or job parameter' })

  try {
    const xml = fs.readFileSync(metaPath, 'utf8')
    res.setHeader('Content-Type', 'application/xml; charset=utf-8')
    return res.status(200).send(xml)
  } catch (err) {
    if (err.code === 'ENOENT') return res.status(404).json({ error: 'No metadata found' })
    throw err
  }
})

// PUT /api/project-meta?client=<slug>&job=<slug>  body: { xml }
router.put('/', (req, res) => {
  const { xml } = req.body || {}
  if (!xml || typeof xml !== 'string') return res.status(400).json({ error: 'Missing xml body' })

  const { client, job } = req.query
  const metaPath = resolveMetaPath(req, client, job)
  if (!metaPath) return res.status(400).json({ error: 'Invalid client or job parameter' })

  fs.mkdirSync(path.dirname(metaPath), { recursive: true })
  fs.writeFileSync(metaPath, xml, 'utf8')
  return res.status(200).json({ success: true })
})

// DELETE /api/project-meta?client=<slug>&job=<slug>
router.delete('/', (req, res) => {
  const { client, job } = req.query
  const metaPath = resolveMetaPath(req, client, job)
  if (!metaPath) return res.status(400).json({ error: 'Invalid client or job parameter' })

  try {
    fs.unlinkSync(metaPath)
    return res.status(200).json({ success: true })
  } catch (err) {
    if (err.code === 'ENOENT') return res.status(404).json({ error: 'No metadata found' })
    throw err
  }
})

module.exports = router
