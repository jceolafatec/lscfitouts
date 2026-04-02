function canParseUrl(value) {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

function extractDriveFileId(url) {
  if (!url || !url.hostname) return ''
  const host = url.hostname.toLowerCase()
  if (host !== 'drive.google.com' && host !== 'docs.google.com') return ''

  const idFromQuery = url.searchParams.get('id')
  if (idFromQuery) return idFromQuery

  const fileMatch = url.pathname.match(/\/file\/d\/([^/]+)/i)
  if (fileMatch?.[1]) return fileMatch[1]

  const ucMatch = url.pathname.match(/\/uc$/i)
  if (ucMatch) {
    const id = url.searchParams.get('id')
    if (id) return id
  }

  return ''
}

export function isHttpAssetUrl(value) {
  return /^https?:\/\//i.test((value || '').trim())
}

export function normalizeExternalAssetUrl(value) {
  const raw = (value || '').trim()
  if (!raw) return ''
  if (!isHttpAssetUrl(raw)) return raw

  const parsed = canParseUrl(raw)
  if (!parsed) return raw

  const driveFileId = extractDriveFileId(parsed)
  if (driveFileId) {
    return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(driveFileId)}`
  }

  return raw
}

export function isGoogleDriveFolderUrl(value) {
  const parsed = canParseUrl((value || '').trim())
  if (!parsed) return false
  const host = parsed.hostname.toLowerCase()
  if (host !== 'drive.google.com') return false
  return /\/drive\/folders\//i.test(parsed.pathname)
}