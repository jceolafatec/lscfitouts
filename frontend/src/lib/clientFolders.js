function titleFromSlug(value) {
  if (!value) return 'Untitled'
  return value
    .split(/[\-_]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function getFileStem(filePath) {
  const fileName = filePath.split('/').pop() || ''
  return fileName.replace(/\.[^.]+$/, '')
}

function getFileExt(filePath) {
  const match = filePath.match(/\.([^.]+)$/)
  return match ? match[1].toLowerCase() : ''
}

/**
 * Derive a drawing slug from the sub-path inside a job folder.
 * e.g. "glb/J01/model.glb" → "J01"
 *      "pdf/J03/sheet.pdf" → "J03"
 *      "preview.png"       → "preview"
 */
function getDrawingSlug(subPath) {
  const parts = subPath.split('/').filter(Boolean)
  if (parts.length >= 3 && ['glb', 'pdf'].includes(parts[0].toLowerCase())) {
    return parts[1]
  }
  if (parts.length >= 2) {
    return parts[parts.length - 2]
  }
  return getFileStem(subPath)
}

/**
 * Given a full URL like "/projects/byproxy/knobby-pacificfair/glb/J01/model.glb"
 * extract clientSlug, jobSlug, and the sub-path relative to the job folder.
 */
function parseProjectUrl(url) {
  const match = url.match(/^\/projects\/([^/]+)\/([^/]+)\/(.+)$/)
  if (!match) return null
  return {
    clientSlug: decodeURIComponent(match[1]),
    jobSlug: decodeURIComponent(match[2]),
    subPath: match[3],
  }
}

function ensureEntry(index, clientSlug, jobSlug, drawingSlug) {
  if (!index.has(clientSlug)) {
    index.set(clientSlug, new Map())
  }
  const jobMap = index.get(clientSlug)
  if (!jobMap.has(jobSlug)) {
    jobMap.set(jobSlug, new Map())
  }
  const drawingMap = jobMap.get(jobSlug)
  if (!drawingMap.has(drawingSlug)) {
    drawingMap.set(drawingSlug, {
      clientSlug,
      jobSlug,
      drawingSlug,
      title: titleFromSlug(drawingSlug),
      modelFiles: [],
      drawingFiles: [],
      imageFiles: [],
    })
  }
  return drawingMap.get(drawingSlug)
}

/**
 * Fetch the project list from the Express backend and build the
 * client → job → drawing hierarchy used by the dashboard and client pages.
 */
export async function loadClientDrawingTree() {
  const response = await fetch('/api/projects')
  if (!response.ok) throw new Error('fetch-failed')
  const data = await response.json()

  const hierarchy = new Map()

  for (const entry of Object.values(data)) {
    const allFiles = [
      ...entry.modelFiles,
      ...entry.drawingFiles,
      ...entry.previewFiles,
    ]

    for (const url of allFiles) {
      const parsed = parseProjectUrl(url)
      if (!parsed) continue

      const { clientSlug, jobSlug, subPath } = parsed
      const drawingSlug = getDrawingSlug(subPath)
      const drawingEntry = ensureEntry(hierarchy, clientSlug, jobSlug, drawingSlug)

      const ext = getFileExt(subPath)
      if (ext === 'glb' || ext === 'gltf') {
        drawingEntry.modelFiles.push(url)
      } else if (ext === 'pdf') {
        drawingEntry.drawingFiles.push(url)
      } else if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
        drawingEntry.imageFiles.push(url)
      }
    }
  }

  return Array.from(hierarchy.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([clientSlug, jobMap]) => {
      const jobs = Array.from(jobMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([jobSlug, drawingMap]) => {
          const drawings = Array.from(drawingMap.values())
            .sort((a, b) => a.title.localeCompare(b.title))
            .map((drawing) => {
              const modelFiles = drawing.modelFiles.sort()
              const drawingFiles = drawing.drawingFiles.sort()
              const imageFiles = drawing.imageFiles.sort()
              return {
                ...drawing,
                modelFiles,
                drawingFiles,
                imageFiles,
                coverImage: imageFiles[0] || '',
                hasModel: modelFiles.length > 0,
                hasPdf: drawingFiles.length > 0,
              }
            })

          return {
            jobSlug,
            jobName: titleFromSlug(jobSlug),
            drawings,
          }
        })

      return {
        clientSlug,
        clientName: titleFromSlug(clientSlug),
        jobs,
      }
    })
}
