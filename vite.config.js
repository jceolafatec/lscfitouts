import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs/promises'
import path from 'node:path'

function createCommentsApiPlugin() {
  const workspaceRoot = process.cwd()
  const projectsRoot = path.resolve(workspaceRoot, 'projects')

  function resolveProjectDirFromModelPath(modelPath) {
    if (!modelPath || typeof modelPath !== 'string') return null
    const normalized = modelPath.replace(/\\/g, '/').replace(/^\/+/, '')
    const parts = normalized.split('/').filter(Boolean)
    const projectsIndex = parts.indexOf('projects')
    const projectName = projectsIndex >= 0 ? parts[projectsIndex + 1] : null
    if (!projectName) return null

    const projectDir = path.resolve(projectsRoot, projectName)
    const projectsRootWithSep = `${projectsRoot}${path.sep}`
    if (projectDir !== projectsRoot && !projectDir.startsWith(projectsRootWithSep)) {
      return null
    }
    return projectDir
  }

  async function readJsonBody(req) {
    const chunks = []
    for await (const chunk of req) {
      chunks.push(chunk)
    }
    const raw = Buffer.concat(chunks).toString('utf8')
    return raw ? JSON.parse(raw) : {}
  }

  return {
    name: 'comments-api-plugin',
    configureServer(server) {
      const handler = async (req, res) => {
        try {
          const url = new URL(req.url || '/', 'http://localhost')

          if (req.method === 'GET') {
            const modelPath = url.searchParams.get('modelPath') || ''
            const projectDir = resolveProjectDirFromModelPath(modelPath)
            if (!projectDir) {
              res.statusCode = 400
              res.end('Invalid modelPath')
              return
            }

            const commentsPath = path.join(projectDir, 'comments.xml')
            try {
              const xml = await fs.readFile(commentsPath, 'utf8')
              res.setHeader('Content-Type', 'application/xml; charset=utf-8')
              res.end(xml)
            } catch (error) {
              if (error && error.code === 'ENOENT') {
                res.statusCode = 404
                res.end('No comments file')
                return
              }
              throw error
            }
            return
          }

          if (req.method === 'PUT') {
            const body = await readJsonBody(req)
            const modelPath = body && body.modelPath
            const xml = body && body.xml
            const projectDir = resolveProjectDirFromModelPath(modelPath)
            if (!projectDir || typeof xml !== 'string') {
              res.statusCode = 400
              res.end('Invalid payload')
              return
            }

            await fs.mkdir(projectDir, { recursive: true })
            const commentsPath = path.join(projectDir, 'comments.xml')
            await fs.writeFile(commentsPath, xml, 'utf8')
            res.statusCode = 200
            res.end('ok')
            return
          }

          if (req.method === 'DELETE') {
            const modelPath = url.searchParams.get('modelPath') || ''
            const projectDir = resolveProjectDirFromModelPath(modelPath)
            if (!projectDir) {
              res.statusCode = 400
              res.end('Invalid modelPath')
              return
            }

            const commentsPath = path.join(projectDir, 'comments.xml')
            try {
              await fs.unlink(commentsPath)
              res.statusCode = 200
              res.end('deleted')
            } catch (error) {
              if (error && error.code === 'ENOENT') {
                res.statusCode = 404
                res.end('No comments file')
                return
              }
              throw error
            }
            return
          }

          res.statusCode = 405
          res.end('Method not allowed')
        } catch (error) {
          res.statusCode = 500
          res.end(error && error.message ? error.message : 'Server error')
        }
      }

      server.middlewares.use('/api/comments', handler)
    },
    configurePreviewServer(server) {
      const handler = async (req, res) => {
        try {
          const url = new URL(req.url || '/', 'http://localhost')

          if (req.method === 'GET') {
            const modelPath = url.searchParams.get('modelPath') || ''
            const projectDir = resolveProjectDirFromModelPath(modelPath)
            if (!projectDir) {
              res.statusCode = 400
              res.end('Invalid modelPath')
              return
            }

            const commentsPath = path.join(projectDir, 'comments.xml')
            try {
              const xml = await fs.readFile(commentsPath, 'utf8')
              res.setHeader('Content-Type', 'application/xml; charset=utf-8')
              res.end(xml)
            } catch (error) {
              if (error && error.code === 'ENOENT') {
                res.statusCode = 404
                res.end('No comments file')
                return
              }
              throw error
            }
            return
          }

          if (req.method === 'PUT') {
            const body = await readJsonBody(req)
            const modelPath = body && body.modelPath
            const xml = body && body.xml
            const projectDir = resolveProjectDirFromModelPath(modelPath)
            if (!projectDir || typeof xml !== 'string') {
              res.statusCode = 400
              res.end('Invalid payload')
              return
            }

            await fs.mkdir(projectDir, { recursive: true })
            const commentsPath = path.join(projectDir, 'comments.xml')
            await fs.writeFile(commentsPath, xml, 'utf8')
            res.statusCode = 200
            res.end('ok')
            return
          }

          if (req.method === 'DELETE') {
            const modelPath = url.searchParams.get('modelPath') || ''
            const projectDir = resolveProjectDirFromModelPath(modelPath)
            if (!projectDir) {
              res.statusCode = 400
              res.end('Invalid modelPath')
              return
            }

            const commentsPath = path.join(projectDir, 'comments.xml')
            try {
              await fs.unlink(commentsPath)
              res.statusCode = 200
              res.end('deleted')
            } catch (error) {
              if (error && error.code === 'ENOENT') {
                res.statusCode = 404
                res.end('No comments file')
                return
              }
              throw error
            }
            return
          }

          res.statusCode = 405
          res.end('Method not allowed')
        } catch (error) {
          res.statusCode = 500
          res.end(error && error.message ? error.message : 'Server error')
        }
      }

      server.middlewares.use('/api/comments', handler)
    },
  }
}

function createProjectMetaApiPlugin() {
  const workspaceRoot = process.cwd()
  const projectsRoot = path.resolve(workspaceRoot, 'projects')

  function resolveJobDir(client, job) {
    if (!client || !job) return null
    if (typeof client !== 'string' || typeof job !== 'string') return null

    const normalizedClient = client.replace(/\\/g, '/').replace(/^\/+/, '')
    const normalizedJob = job.replace(/\\/g, '/').replace(/^\/+/, '')
    if (!normalizedClient || !normalizedJob) return null

    const jobDir = path.resolve(projectsRoot, normalizedClient, normalizedJob)
    const projectsRootWithSep = `${projectsRoot}${path.sep}`
    if (jobDir !== projectsRoot && !jobDir.startsWith(projectsRootWithSep)) {
      return null
    }
    return jobDir
  }

  async function readJsonBody(req) {
    const chunks = []
    for await (const chunk of req) {
      chunks.push(chunk)
    }
    const raw = Buffer.concat(chunks).toString('utf8')
    return raw ? JSON.parse(raw) : {}
  }

  function createHandler() {
    return async (req, res) => {
      try {
        const url = new URL(req.url || '/', 'http://localhost')

        if (req.method === 'GET') {
          const client = url.searchParams.get('client') || ''
          const job = url.searchParams.get('job') || ''
          const jobDir = resolveJobDir(client, job)
          if (!jobDir) {
            res.statusCode = 400
            res.end('Invalid client/job')
            return
          }

          const metaPath = path.join(jobDir, 'project-meta.xml')
          try {
            const xml = await fs.readFile(metaPath, 'utf8')
            res.setHeader('Content-Type', 'application/xml; charset=utf-8')
            res.end(xml)
          } catch (error) {
            if (error && error.code === 'ENOENT') {
              res.statusCode = 404
              res.end('No project metadata file')
              return
            }
            throw error
          }
          return
        }

        if (req.method === 'PUT') {
          const client = url.searchParams.get('client') || ''
          const job = url.searchParams.get('job') || ''
          const jobDir = resolveJobDir(client, job)
          const body = await readJsonBody(req)
          const xml = body && body.xml
          if (!jobDir || typeof xml !== 'string') {
            res.statusCode = 400
            res.end('Invalid payload')
            return
          }

          await fs.mkdir(jobDir, { recursive: true })
          const metaPath = path.join(jobDir, 'project-meta.xml')
          await fs.writeFile(metaPath, xml, 'utf8')
          res.statusCode = 200
          res.end('ok')
          return
        }

        if (req.method === 'DELETE') {
          const client = url.searchParams.get('client') || ''
          const job = url.searchParams.get('job') || ''
          const jobDir = resolveJobDir(client, job)
          if (!jobDir) {
            res.statusCode = 400
            res.end('Invalid client/job')
            return
          }

          const metaPath = path.join(jobDir, 'project-meta.xml')
          try {
            await fs.unlink(metaPath)
            res.statusCode = 200
            res.end('deleted')
          } catch (error) {
            if (error && error.code === 'ENOENT') {
              res.statusCode = 404
              res.end('No project metadata file')
              return
            }
            throw error
          }
          return
        }

        res.statusCode = 405
        res.end('Method not allowed')
      } catch (error) {
        res.statusCode = 500
        res.end(error && error.message ? error.message : 'Server error')
      }
    }
  }

  return {
    name: 'project-meta-api-plugin',
    configureServer(server) {
      server.middlewares.use('/api/project-meta', createHandler())
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/project-meta', createHandler())
    },
  }
}

export default defineConfig(({ command }) => ({
  plugins: [react(), createCommentsApiPlugin(), createProjectMetaApiPlugin()],
  base: command === 'build' ? '/lscfitouts/' : '/',
  assetsInclude: ['**/*.glb', '**/*.gltf'],
  build: {
    outDir: 'dist',
  },
}))
