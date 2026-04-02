import { withBasePath } from './pathing'

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

function collectAssets() {
  const fileMap = import.meta.glob('/projects/*/*/**/*.{glb,gltf,GLB,GLTF,pdf,PDF,png,jpg,jpeg,webp,PNG,JPG,JPEG,WEBP}', {
    eager: true,
    import: 'default',
    query: '?url',
  })

  const hierarchy = new Map()

  for (const [assetPath, assetUrl] of Object.entries(fileMap)) {
    const match = assetPath.match(/^\/projects\/([^/]+)\/([^/]+)\/(.+)$/)
    if (!match) continue

    const clientSlug = decodeURIComponent(match[1])
    const jobSlug = decodeURIComponent(match[2])
    const subPath = match[3]
    const drawingSlug = getDrawingSlug(subPath)
    const entry = ensureEntry(hierarchy, clientSlug, jobSlug, drawingSlug)

    const resolvedUrl = typeof assetUrl === 'string' ? assetUrl : withBasePath(assetPath)
    const ext = getFileExt(subPath)

    if (ext === 'glb' || ext === 'gltf') {
      entry.modelFiles.push(resolvedUrl)
    } else if (ext === 'pdf') {
      entry.drawingFiles.push(resolvedUrl)
    } else if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
      entry.imageFiles.push(resolvedUrl)
    }
  }

  const clients = Array.from(hierarchy.entries())
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

  return clients
}

export function loadClientDrawingTree() {
  return collectAssets()
}
