'use strict'

const express = require('express')
const fs = require('fs')
const path = require('path')

const router = express.Router()

const MODEL_EXTS = new Set(['glb', 'gltf'])
const PDF_EXTS = new Set(['pdf'])
const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'webp'])

function getExt(filePath) {
  return (filePath.split('.').pop() || '').toLowerCase()
}

function titleFromSlug(slug) {
  if (!slug) return 'Untitled'
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ')
}

/**
 * Recursively collect files under a directory.
 * Returns an array of relative POSIX paths from the given root.
 */
function collectFiles(dir, root) {
  const results = []
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return results
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'Icon') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...collectFiles(full, root))
    } else {
      results.push(path.relative(root, full).split(path.sep).join('/'))
    }
  }
  return results
}

/**
 * GET /api/projects
 * Scans the projects root and returns a map of "client/job" → project descriptor.
 */
router.get('/', (req, res) => {
  const projectsRoot = req.app.get('projectsRoot')

  let clientDirs
  try {
    clientDirs = fs.readdirSync(projectsRoot, { withFileTypes: true })
  } catch {
    return res.status(500).json({ error: 'Cannot read projects directory' })
  }

  const result = {}

  for (const clientEntry of clientDirs) {
    if (!clientEntry.isDirectory()) continue
    if (clientEntry.name.startsWith('.') || clientEntry.name === 'Icon') continue

    const clientSlug = clientEntry.name
    const clientDir = path.join(projectsRoot, clientSlug)

    let jobDirs
    try {
      jobDirs = fs.readdirSync(clientDir, { withFileTypes: true })
    } catch {
      continue
    }

    for (const jobEntry of jobDirs) {
      if (!jobEntry.isDirectory()) continue
      if (jobEntry.name.startsWith('.') || jobEntry.name === 'Icon') continue

      const jobSlug = jobEntry.name
      const jobDir = path.join(clientDir, jobSlug)
      const folderKey = `${clientSlug}/${jobSlug}`

      const files = collectFiles(jobDir, jobDir)
      const modelFiles = []
      const drawingFiles = []
      const previewFiles = []

      for (const rel of files) {
        const ext = getExt(rel)
        const url = `/projects/${clientSlug}/${jobSlug}/${rel}`
        if (MODEL_EXTS.has(ext)) modelFiles.push(url)
        else if (PDF_EXTS.has(ext)) drawingFiles.push(url)
        else if (IMAGE_EXTS.has(ext)) previewFiles.push(url)
      }

      const modelPreviewImage =
        previewFiles.find((f) => /\/model\.(png|jpg|jpeg|webp)$/i.test(f)) ||
        previewFiles[0] ||
        ''

      result[folderKey] = {
        clientSlug,
        clientName: titleFromSlug(clientSlug),
        jobSlug,
        jobName: titleFromSlug(jobSlug),
        projectFolder: folderKey,
        modelFiles: modelFiles.sort(),
        drawingFiles: drawingFiles.sort(),
        previewFiles: previewFiles.sort(),
        modelPreviewImage,
        previewImage: modelPreviewImage,
        hasModel: modelFiles.length > 0,
        hasPdf: drawingFiles.length > 0,
        hasPreview: Boolean(modelPreviewImage),
      }
    }
  }

  res.json(result)
})

module.exports = router
