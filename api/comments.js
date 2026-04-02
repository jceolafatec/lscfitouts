import { put, head, del } from '@vercel/blob';

/**
 * Serverless API for storing 3D model comments as XML in Vercel Blob Storage
 * Endpoints: GET/PUT/DELETE /api/comments?modelPath=<path>&project=<project>
 * Same XML format as local development
 */

export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const { modelPath, project } = req.query;

  // Validate request
  if (!modelPath || !project) {
    return res.status(400).json({ error: 'Missing modelPath or project parameter' });
  }

  // Prevent directory traversal
  if (modelPath.includes('..') || project.includes('..')) {
    return res.status(400).json({ error: 'Invalid path' });
  }

  // Create blob key: comments/projects/<project>/comments.xml
  const blobKey = `comments/projects/${project}/comments.xml`;

  try {
    if (req.method === 'GET') {
      return handleGet(blobKey, res);
    } else if (req.method === 'PUT') {
      return handlePut(blobKey, req, res);
    } else if (req.method === 'DELETE') {
      return handleDelete(blobKey, res);
    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Comments API error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function handleGet(blobKey, res) {
  try {
    const blob = await head(blobKey);
    const response = await fetch(blob.url);
    if (!response.ok) {
      return res.status(404).json({ error: 'No comments found' });
    }
    const xml = await response.text();
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    return res.status(200).send(xml);
  } catch (error) {
    if (isBlobNotFound(error)) {
      return res.status(404).json({ error: 'No comments found' });
    }
    throw error;
  }
}

async function handlePut(blobKey, req, res) {
  try {
    const { xml } = req.body;
    if (!xml) {
      return res.status(400).json({ error: 'Missing xml body' });
    }

    await putXmlWithStoreModeFallback(blobKey, xml);

    return res.status(200).json({ 
      success: true, 
      message: 'Comments saved',
      blobKey 
    });
  } catch (error) {
    throw error;
  }
}

async function putXmlWithStoreModeFallback(blobKey, xml) {
  try {
    // Public stores require explicit public access.
    await put(blobKey, xml, {
      contentType: 'application/xml',
      access: 'public',
      addRandomSuffix: false,
    });
    return;
  } catch (error) {
    const message = String((error && error.message) || '');
    // Private stores reject public access; retry without explicit access.
    if (message.includes('private store')) {
      await put(blobKey, xml, {
        contentType: 'application/xml',
        addRandomSuffix: false,
      });
      return;
    }
    throw error;
  }
}

async function handleDelete(blobKey, res) {
  try {
    await del(blobKey);
    return res.status(200).json({ 
      success: true, 
      message: 'Comments deleted' 
    });
  } catch (error) {
    if (isBlobNotFound(error)) {
      return res.status(404).json({ error: 'No comments to delete' });
    }
    throw error;
  }
}

function isBlobNotFound(error) {
  const code = error && error.code;
  const message = String((error && error.message) || '');
  return code === 'NOT_FOUND' || message.includes('does not exist');
}

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
