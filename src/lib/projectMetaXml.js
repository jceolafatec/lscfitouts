const META_VERSION = '1'

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function getMetaApiBaseUrl() {
  return (import.meta.env.VITE_PROJECT_META_API_URL || '').trim() || '/api/project-meta'
}

function buildMetaUrl(clientSlug, jobSlug) {
  const base = getMetaApiBaseUrl()
  const params = new URLSearchParams({ client: clientSlug, job: jobSlug })
  return `${base}?${params.toString()}`
}

export function serializeProjectMetaXml(payload) {
  const { clientSlug, jobSlug, clientName, jobName, drawings } = payload
  const lines = [
    `<projectMeta version="${META_VERSION}" clientSlug="${escapeXml(clientSlug)}" jobSlug="${escapeXml(jobSlug)}">`,
    `  <clientName>${escapeXml(clientName || '')}</clientName>`,
    `  <jobName>${escapeXml(jobName || '')}</jobName>`,
    '  <drawings>',
  ]

  ;(drawings || []).forEach((item) => {
    const attrs = [
      `slug="${escapeXml(item.slug)}"`,
      `name="${escapeXml(item.name)}"`,
    ]
    if (item.modelUrl) attrs.push(`modelUrl="${escapeXml(item.modelUrl)}"`)
    if (item.pdfUrl) attrs.push(`pdfUrl="${escapeXml(item.pdfUrl)}"`)
    if (item.imageUrl) attrs.push(`imageUrl="${escapeXml(item.imageUrl)}"`)
    lines.push(`    <drawing ${attrs.join(' ')} />`)
  })

  lines.push('  </drawings>')
  lines.push('</projectMeta>')
  return lines.join('\n')
}

export function parseProjectMetaXml(xmlText) {
  if (!xmlText || !xmlText.trim()) return null

  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlText, 'application/xml')
  const root = doc.querySelector('projectMeta')
  if (!root) return null

  const clientSlug = root.getAttribute('clientSlug') || ''
  const jobSlug = root.getAttribute('jobSlug') || ''
  const clientName = (doc.querySelector('clientName')?.textContent || '').trim()
  const jobName = (doc.querySelector('jobName')?.textContent || '').trim()
  const drawings = Array.from(doc.querySelectorAll('drawings > drawing')).map((node) => ({
    slug: node.getAttribute('slug') || '',
    name: node.getAttribute('name') || '',
    modelUrl: node.getAttribute('modelUrl') || '',
    pdfUrl: node.getAttribute('pdfUrl') || '',
    imageUrl: node.getAttribute('imageUrl') || '',
  }))

  return {
    clientSlug,
    jobSlug,
    clientName,
    jobName,
    drawings,
  }
}

export async function loadProjectMeta(clientSlug, jobSlug) {
  const response = await fetch(buildMetaUrl(clientSlug, jobSlug), { method: 'GET' })
  if (response.status === 404) return null
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || 'Failed to load project metadata')
  }

  const xml = await response.text()
  return parseProjectMetaXml(xml)
}

export async function saveProjectMeta(metaPayload) {
  const xml = serializeProjectMetaXml(metaPayload)
  const response = await fetch(buildMetaUrl(metaPayload.clientSlug, metaPayload.jobSlug), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ xml }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || 'Failed to save project metadata')
  }

  return xml
}

export async function deleteProjectMeta(clientSlug, jobSlug) {
  const response = await fetch(buildMetaUrl(clientSlug, jobSlug), {
    method: 'DELETE',
  })

  if (response.status === 404) {
    return false
  }

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || 'Failed to delete project metadata')
  }

  return true
}
