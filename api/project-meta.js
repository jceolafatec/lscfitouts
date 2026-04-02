import { put, head, del } from '@vercel/blob'

export default async function handler(req, res) {
  setCorsHeaders(res)

  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  const { client, job } = req.query
  if (!client || !job) {
    return res.status(400).json({ error: 'Missing client or job parameter' })
  }

  if (String(client).includes('..') || String(job).includes('..')) {
    return res.status(400).json({ error: 'Invalid path' })
  }

  const blobKey = `meta/projects/${client}/${job}/project-meta.xml`

  try {
    if (req.method === 'GET') return handleGet(blobKey, res)
    if (req.method === 'PUT') return handlePut(blobKey, req, res)
    if (req.method === 'DELETE') return handleDelete(blobKey, res)
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    console.error('Project meta API error:', error)
    return res.status(500).json({ error: error.message || 'Server error' })
  }
}

async function handleGet(blobKey, res) {
  try {
    const blob = await head(blobKey)
    const upstream = await fetch(blob.url)
    if (!upstream.ok) {
      return res.status(404).json({ error: 'No metadata found' })
    }

    const xml = await upstream.text()
    res.setHeader('Content-Type', 'application/xml; charset=utf-8')
    return res.status(200).send(xml)
  } catch (error) {
    if (isBlobNotFound(error)) {
      return res.status(404).json({ error: 'No metadata found' })
    }
    throw error
  }
}

async function handlePut(blobKey, req, res) {
  const { xml } = req.body || {}
  if (!xml || typeof xml !== 'string') {
    return res.status(400).json({ error: 'Missing xml body' })
  }

  await putWithStoreModeFallback(blobKey, xml)
  return res.status(200).json({ success: true, message: 'Metadata saved', blobKey })
}

async function putWithStoreModeFallback(blobKey, xml) {
  try {
    await put(blobKey, xml, {
      contentType: 'application/xml',
      access: 'public',
      addRandomSuffix: false,
    })
    return
  } catch (error) {
    const message = String((error && error.message) || '')
    if (message.includes('private store')) {
      await put(blobKey, xml, {
        contentType: 'application/xml',
        addRandomSuffix: false,
      })
      return
    }
    throw error
  }
}

async function handleDelete(blobKey, res) {
  try {
    await del(blobKey)
    return res.status(200).json({ success: true, message: 'Metadata deleted' })
  } catch (error) {
    if (isBlobNotFound(error)) {
      return res.status(404).json({ error: 'No metadata found' })
    }
    throw error
  }
}

function isBlobNotFound(error) {
  const code = error && error.code
  const message = String((error && error.message) || '')
  return code === 'NOT_FOUND' || message.includes('does not exist')
}

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}
