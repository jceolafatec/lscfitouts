import { withBasePath } from './pathing'

export async function loadProjectData() {
  const response = await fetch(withBasePath('/data/projects.json'))
  if (!response.ok) {
    throw new Error('fetch-failed')
  }

  const payload = await response.json()
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('invalid-json')
  }

  return payload
}

export function loadProjectFromUrl(dataMap, search = window.location.search) {
  const params = new URLSearchParams(search)
  const projectId = params.get('p')

  if (!projectId) {
    throw new Error('missing-token')
  }

  const project = dataMap[projectId]
  if (!project) {
    throw new Error('not-found')
  }

  return { projectId, project }
}

export function resolveProjectAssetPath(projectId, project, assetPath) {
  if (!assetPath) return ''
  if (/^https?:\/\//i.test(assetPath)) return assetPath
  if (assetPath.startsWith('/')) return assetPath

  const folder = project?.projectFolder || projectId
  const normalized = assetPath.replace(/^\.?\//, '')
  return `/projects/${folder}/${normalized}`
}
