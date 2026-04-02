function titleFromFolderName(folderName) {
  if (!folderName) return 'Untitled Project'
  return folderName
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function getFileExt(filePath) {
  const match = filePath.match(/\.([^.]+)$/)
  return match ? match[1].toLowerCase() : ''
}

export function loadProjectFolderStatuses() {
  const assetFileMap = import.meta.glob('/projects/*/*/**/*.{glb,gltf,GLB,GLTF,pdf,PDF,png,jpg,jpeg,webp,PNG,JPG,JPEG,WEBP}', {
    eager: true,
    import: 'default',
    query: '?url',
  })

  const folders = new Map()

  for (const [assetPath, assetUrl] of Object.entries(assetFileMap)) {
    const match = assetPath.match(/^\/projects\/([^/]+)\/([^/]+)\/(.+)$/)
    if (!match) continue

    const clientSlug = decodeURIComponent(match[1])
    const jobSlug = decodeURIComponent(match[2])
    const folderKey = `${clientSlug}/${jobSlug}`
    const row = folders.get(folderKey) || {
      clientSlug,
      jobSlug,
      folder: folderKey,
      modelFiles: [],
      drawingFiles: [],
      previewFiles: [],
    }

    const resolvedUrl = typeof assetUrl === 'string' ? assetUrl : assetPath
    const ext = getFileExt(assetPath)

    if (ext === 'glb' || ext === 'gltf') {
      row.modelFiles.push(resolvedUrl)
    } else if (ext === 'pdf') {
      row.drawingFiles.push(resolvedUrl)
    } else if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
      row.previewFiles.push(resolvedUrl)
    }

    folders.set(folderKey, row)
  }

  return Array.from(folders.values())
    .map((row) => {
      const modelFiles = row.modelFiles.sort()
      const drawingFiles = row.drawingFiles.sort()
      const previewFiles = row.previewFiles.sort()
      const modelPreviewImage = previewFiles.find((file) => /\/model\.(png|jpg|jpeg|webp)$/i.test(file)) || previewFiles[0] || ''
      const previewImage = modelPreviewImage

      return {
        projectName: titleFromFolderName(row.jobSlug),
        projectFolder: row.folder,
        clientSlug: row.clientSlug,
        clientName: titleFromFolderName(row.clientSlug),
        jobSlug: row.jobSlug,
        jobName: titleFromFolderName(row.jobSlug),
        modelFiles,
        drawingFiles,
        previewFiles,
        modelPreviewImage,
        previewImage,
        hasModel: modelFiles.length > 0,
        hasPdf: drawingFiles.length > 0,
        hasPreview: Boolean(previewImage),
      }
    })
    .sort((a, b) => {
      const clientCompare = a.clientName.localeCompare(b.clientName)
      if (clientCompare !== 0) return clientCompare
      return a.projectName.localeCompare(b.projectName)
    })
}