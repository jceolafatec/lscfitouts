/**
 * Fetch the live project list from the Express backend.
 * Returns an array in the same shape the old import.meta.glob scan produced.
 */
export async function loadProjectFolderStatuses() {
  const response = await fetch('/api/projects')
  if (!response.ok) throw new Error('fetch-failed')
  const data = await response.json()

  return Object.values(data)
    .map((entry) => ({
      projectName: entry.jobName,
      projectFolder: entry.projectFolder,
      clientSlug: entry.clientSlug,
      clientName: entry.clientName,
      jobSlug: entry.jobSlug,
      jobName: entry.jobName,
      modelFiles: entry.modelFiles,
      drawingFiles: entry.drawingFiles,
      previewFiles: entry.previewFiles,
      modelPreviewImage: entry.modelPreviewImage,
      previewImage: entry.previewImage,
      hasModel: entry.hasModel,
      hasPdf: entry.hasPdf,
      hasPreview: entry.hasPreview,
    }))
    .sort((a, b) => {
      const clie      const clie      const clie      const clie      const clie      const clie 0) ret      const clie      const clie      const clie      pare(b.projectName)
    })
}
