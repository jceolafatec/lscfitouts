function titleFromFolderName(folderName) {
  if (!folderName) return 'Untitled Project'
  return folderName
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function loadProjectFolderStatuses() {
  const modelFileMap = import.meta.glob('/projects/*/glb/*.{glb,gltf,GLB,GLTF}', {
    eager: true,
    import: 'default',
    query: '?url',
  })
  const drawingFileMap = import.meta.glob('/projects/*/pdf/*.{pdf,PDF}', {
    eager: true,
    import: 'default',
    query: '?url',
  })
  const previewFileMap = import.meta.glob('/projects/*/glb/*.{png,jpg,jpeg,webp,PNG,JPG,JPEG,WEBP}', {
    eager: true,
    import: 'default',
    query: '?url',
  })
  const pdfPreviewFileMap = import.meta.glob('/projects/*/pdf/*.{png,jpg,jpeg,webp,PNG,JPG,JPEG,WEBP}', {
    eager: true,
    import: 'default',
    query: '?url',
  })

  const folders = new Map()

  for (const [assetPath, assetUrl] of Object.entries(modelFileMap)) {
    const match = assetPath.match(/^\/projects\/([^/]+)\/glb\//)
    if (!match) continue

    const folder = decodeURIComponent(match[1])
    const row = folders.get(folder) || { folder, modelFiles: [], drawingFiles: [], previewFiles: [], pdfPreviewFiles: [] }
    row.modelFiles.push(typeof assetUrl === 'string' ? assetUrl : assetPath)
    folders.set(folder, row)
  }

  for (const [assetPath, assetUrl] of Object.entries(drawingFileMap)) {
    const match = assetPath.match(/^\/projects\/([^/]+)\/pdf\//)
    if (!match) continue

    const folder = decodeURIComponent(match[1])
    const row = folders.get(folder) || { folder, modelFiles: [], drawingFiles: [], previewFiles: [], pdfPreviewFiles: [] }
    row.drawingFiles.push(typeof assetUrl === 'string' ? assetUrl : assetPath)
    folders.set(folder, row)
  }

  for (const [assetPath, assetUrl] of Object.entries(previewFileMap)) {
    const match = assetPath.match(/^\/projects\/([^/]+)\/glb\//)
    if (!match) continue

    const folder = decodeURIComponent(match[1])
    const row = folders.get(folder) || { folder, modelFiles: [], drawingFiles: [], previewFiles: [], pdfPreviewFiles: [] }
    row.previewFiles.push(typeof assetUrl === 'string' ? assetUrl : assetPath)
    folders.set(folder, row)
  }

  for (const [assetPath, assetUrl] of Object.entries(pdfPreviewFileMap)) {
    const match = assetPath.match(/^\/projects\/([^/]+)\/pdf\//)
    if (!match) continue

    const folder = decodeURIComponent(match[1])
    const row = folders.get(folder) || { folder, modelFiles: [], drawingFiles: [], previewFiles: [], pdfPreviewFiles: [] }
    row.pdfPreviewFiles.push(typeof assetUrl === 'string' ? assetUrl : assetPath)
    folders.set(folder, row)
  }

  return Array.from(folders.values())
    .map((row) => {
      const modelFiles = row.modelFiles.sort()
      const drawingFiles = row.drawingFiles.sort()
      const previewFiles = row.previewFiles.sort()
      const pdfPreviewFiles = row.pdfPreviewFiles.sort()
      const modelPreviewImage = previewFiles.find((file) => /\/model\.(png|jpg|jpeg|webp)$/i.test(file)) || previewFiles[0] || ''
      const pdfPreviewImage = pdfPreviewFiles.find((file) => /\/(drawing|pdf|cover|preview)\.(png|jpg|jpeg|webp)$/i.test(file)) || pdfPreviewFiles[0] || ''
      const previewImage = modelPreviewImage || pdfPreviewImage

      return {
        projectName: titleFromFolderName(row.folder),
        projectFolder: row.folder,
        modelFiles,
        drawingFiles,
        previewFiles,
        pdfPreviewFiles,
        modelPreviewImage,
        pdfPreviewImage,
        previewImage,
        hasModel: modelFiles.length > 0,
        hasPdf: drawingFiles.length > 0,
        hasPreview: Boolean(previewImage),
      }
    })
    .sort((a, b) => a.projectName.localeCompare(b.projectName))
}