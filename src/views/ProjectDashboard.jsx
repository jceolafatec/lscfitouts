import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { Header } from '../components/layout/Header'
import { Sidebar } from '../components/layout/Sidebar'
import { loadProjectData, loadProjectFromUrl, resolveProjectAssetPath } from '../lib/projectData'
import { loadProjectFolderStatuses } from '../lib/projectFolders'
import { loadClientDrawingTree } from '../lib/clientFolders'
import { deleteProjectMeta, loadProjectMeta, saveProjectMeta } from '../lib/projectMetaXml'
import { withBasePath } from '../lib/pathing'

const INVALID_LINK_MESSAGE = 'This project link is invalid or expired. Please contact LSC Fitouts.'
const LazyThreeDViewer = lazy(() => import('../components/ThreeDViewer').then((module) => ({ default: module.ThreeDViewer })))
const LazyPdfViewer = lazy(() => import('../components/PdfViewer').then((module) => ({ default: module.PdfViewer })))
const folderStatuses = loadProjectFolderStatuses()
const clientTree = loadClientDrawingTree()
const DASHBOARD_LABEL_OVERRIDES_KEY = 'dashboard-label-overrides-v1'

function buildStandaloneViewerUrl(modelUrl) {
  const viewerUrl = withBasePath('/viewer.html')
  const params = new URLSearchParams({ model: modelUrl })
  return `${viewerUrl}?${params.toString()}`
}

function loadLabelOverrides() {
  try {
    const raw = localStorage.getItem(DASHBOARD_LABEL_OVERRIDES_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function buildJobFolderPath(clientSlug, jobSlug) {
  return `projects/${clientSlug}/${jobSlug}`
}

function buildJobShareUrl(clientSlug, jobSlug) {
  const base = withBasePath('/client.html')
  const params = new URLSearchParams({ client: clientSlug, job: jobSlug })
  return `${window.location.origin}${base}?${params.toString()}`
}

function buildJobModelViewerUrl(job) {
  const modelDrawing = (job?.drawings || []).find((drawing) => drawing.hasModel && drawing.modelFiles.length > 0)
  if (!modelDrawing) return ''
  return buildStandaloneViewerUrl(modelDrawing.modelFiles[0])
}

export function ProjectDashboard() {
  const [status, setStatus] = useState('loading')
  const [project, setProject] = useState(null)
  const [projectId, setProjectId] = useState('')
  const [activeTab, setActiveTab] = useState('3d')
  const [searchTerm, setSearchTerm] = useState('')
  const [sortMode, setSortMode] = useState('name-asc')
  const [labelOverrides, setLabelOverrides] = useState(() => loadLabelOverrides())
  const [apiOverrides, setApiOverrides] = useState({})
  const [copiedShareId, setCopiedShareId] = useState('')
  const [draftEdits, setDraftEdits] = useState({})
  const [editingJobs, setEditingJobs] = useState({})
  const [metaPresence, setMetaPresence] = useState({})

  useEffect(() => {
    async function bootstrap() {
      const params = new URLSearchParams(window.location.search)
      const requestedProjectId = params.get('p')

      if (!requestedProjectId) {
        setStatus('catalog')
        return
      }

      try {
        const map = await loadProjectData()
        const resolved = loadProjectFromUrl(map)
        setProject(resolved.project)
        setProjectId(resolved.projectId)
        setStatus('ready')
      } catch (error) {
        if (error instanceof Error && error.message === 'not-found') {
          setStatus('invalid')
          return
        }

        setStatus('error')
      }
    }

    bootstrap()
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(DASHBOARD_LABEL_OVERRIDES_KEY, JSON.stringify(labelOverrides))
    } catch {
      // Ignore localStorage write failures in private mode.
    }
  }, [labelOverrides])

  useEffect(() => {
    let alive = true

    async function bootstrapMetaOverrides() {
      const next = {}
      const jobs = []
      clientTree.forEach((client) => {
        client.jobs.forEach((job) => {
          jobs.push({ client, job })
        })
      })

      await Promise.all(
        jobs.map(async ({ client, job }) => {
          try {
            const meta = await loadProjectMeta(client.clientSlug, job.jobSlug)
            if (!meta) return

            next[`meta:${client.clientSlug}/${job.jobSlug}`] = true

            next[`client:${client.clientSlug}`] = meta.clientName || client.clientName
            next[`job:${client.clientSlug}/${job.jobSlug}`] = meta.jobName || job.jobName

            ;(meta.drawings || []).forEach((drawing) => {
              if (!drawing.slug) return
              next[`drawing:${client.clientSlug}/${job.jobSlug}/${drawing.slug}`] = drawing.name || drawing.slug
            })
          } catch {
            // Ignore missing/failed metadata and keep dashboard operational.
          }
        }),
      )

      if (alive) {
        const nextOverrides = { ...next }
        Object.keys(nextOverrides)
          .filter((key) => key.startsWith('meta:'))
          .forEach((key) => {
            delete nextOverrides[key]
          })

        const nextPresence = {}
        Object.keys(next)
          .filter((key) => key.startsWith('meta:'))
          .forEach((key) => {
            const jobId = key.replace('meta:', '')
            nextPresence[jobId] = true
          })

        setApiOverrides(nextOverrides)
        setMetaPresence(nextPresence)
      }
    }

    bootstrapMetaOverrides()
    return () => {
      alive = false
    }
  }, [])

  const resolvedModelUrl = withBasePath(resolveProjectAssetPath(projectId, project, project?.models?.[0]?.url || ''))
  const resolvedDrawingUrl = withBasePath(resolveProjectAssetPath(projectId, project, project?.drawings?.[0]?.url || ''))
  const normalizedSearchTerm = searchTerm.trim().toLowerCase()
  const filteredFolderStatuses = folderStatuses
    .filter((entry) => {
      if (!normalizedSearchTerm) return true
      const searchableText = `${entry.projectName} ${entry.projectFolder}`.toLowerCase()
      return searchableText.includes(normalizedSearchTerm)
    })
    .sort((left, right) => {
      if (sortMode === 'name-desc') {
        return right.projectName.localeCompare(left.projectName)
      }

      if (sortMode === 'model-first') {
        if (left.hasModel !== right.hasModel) return left.hasModel ? -1 : 1
        return left.projectName.localeCompare(right.projectName)
      }

      if (sortMode === 'pdf-first') {
        if (left.hasPdf !== right.hasPdf) return left.hasPdf ? -1 : 1
        return left.projectName.localeCompare(right.projectName)
      }

      return left.projectName.localeCompare(right.projectName)
    })

  const filteredClientTree = useMemo(() => {
    const decorate = (type, id, fallback) => {
      const key = `${type}:${id}`
      const value = labelOverrides[key]
      if (typeof value === 'string' && value.trim()) return value.trim()
      const fromApi = apiOverrides[key]
      return typeof fromApi === 'string' && fromApi.trim() ? fromApi.trim() : fallback
    }

    const source = clientTree
      .map((client) => {
        const clientId = `${client.clientSlug}`
        const jobs = client.jobs
          .map((job) => {
            const jobId = `${client.clientSlug}/${job.jobSlug}`
            const drawings = job.drawings.map((drawing) => {
              const drawingId = `${client.clientSlug}/${job.jobSlug}/${drawing.drawingSlug}`
              return {
                ...drawing,
                displayTitle: decorate('drawing', drawingId, drawing.title),
              }
            })

            return {
              ...job,
              displayJobName: decorate('job', jobId, job.jobName),
              drawings,
            }
          })

        return {
          ...client,
          displayClientName: decorate('client', clientId, client.clientName),
          jobs,
        }
      })

    if (!normalizedSearchTerm) return source

    return source
      .map((client) => {
        const jobs = client.jobs
          .map((job) => {
            const drawings = job.drawings.filter((drawing) => {
              const searchSpace = `${client.displayClientName} ${job.displayJobName} ${drawing.displayTitle}`.toLowerCase()
              return searchSpace.includes(normalizedSearchTerm)
            })
            return {
              ...job,
              drawings,
            }
          })
          .filter((job) => job.drawings.length > 0)

        return {
          ...client,
          jobs,
        }
      })
      .filter((client) => client.jobs.length > 0)
  }, [apiOverrides, labelOverrides, normalizedSearchTerm])
  const headerTitle = status === 'catalog' ? 'lscfitouts' : undefined
  const headerSubtitle = status === 'catalog' ? 'All project folders in ./projects' : undefined
  const headerStatus = status === 'catalog' ? `${folderStatuses.length} Projects` : undefined
  const catalogStats = {
    total: folderStatuses.length,
    withModel: folderStatuses.filter((entry) => entry.hasModel).length,
    withPdf: folderStatuses.filter((entry) => entry.hasPdf).length,
    missingBoth: folderStatuses.filter((entry) => !entry.hasModel && !entry.hasPdf).length,
  }

  function openCatalogEntry(entry) {
    const destination = entry.hasModel
      ? buildStandaloneViewerUrl(withBasePath(entry.modelFiles[0]))
      : entry.hasPdf
        ? withBasePath(entry.drawingFiles[0])
        : ''

    if (!destination) return
    window.open(destination, '_blank', 'noopener,noreferrer')
  }

  function beginEditJob(client, job) {
    const jobId = `${client.clientSlug}/${job.jobSlug}`
    const clientKey = `client:${client.clientSlug}`
    const jobKey = `job:${jobId}`

    const draft = {
      clientName: (labelOverrides[clientKey] || apiOverrides[clientKey] || client.clientName || '').trim(),
      jobName: (labelOverrides[jobKey] || apiOverrides[jobKey] || job.jobName || '').trim(),
      drawings: {},
    }

    job.drawings.forEach((drawing) => {
      const drawingKey = `drawing:${jobId}/${drawing.drawingSlug}`
      draft.drawings[drawing.drawingSlug] = (labelOverrides[drawingKey] || apiOverrides[drawingKey] || drawing.title || '').trim()
    })

    setDraftEdits((previous) => ({ ...previous, [jobId]: draft }))
    setEditingJobs((previous) => ({ ...previous, [jobId]: true }))
  }

  function cancelEditJob(jobId) {
    setEditingJobs((previous) => ({ ...previous, [jobId]: false }))
    setDraftEdits((previous) => {
      const next = { ...previous }
      delete next[jobId]
      return next
    })
  }

  function updateDraftField(jobId, field, value) {
    setDraftEdits((previous) => ({
      ...previous,
      [jobId]: {
        ...(previous[jobId] || { clientName: '', jobName: '', drawings: {} }),
        [field]: value,
      },
    }))
  }

  function updateDraftDrawing(jobId, drawingSlug, value) {
    setDraftEdits((previous) => {
      const current = previous[jobId] || { clientName: '', jobName: '', drawings: {} }
      return {
        ...previous,
        [jobId]: {
          ...current,
          drawings: {
            ...current.drawings,
            [drawingSlug]: value,
          },
        },
      }
    })
  }

  async function saveJobEdits(client, job) {
    const jobId = `${client.clientSlug}/${job.jobSlug}`
    const draft = draftEdits[jobId]
    if (!draft) return

    const clientName = (draft.clientName || client.clientName || '').trim()
    const jobName = (draft.jobName || job.jobName || '').trim()
    const drawings = job.drawings.map((drawing) => ({
      slug: drawing.drawingSlug,
      name: (draft.drawings?.[drawing.drawingSlug] || drawing.title || '').trim(),
    }))

    const nextLocalOverrides = { ...labelOverrides }
    nextLocalOverrides[`client:${client.clientSlug}`] = clientName
    nextLocalOverrides[`job:${jobId}`] = jobName
    drawings.forEach((drawing) => {
      nextLocalOverrides[`drawing:${jobId}/${drawing.slug}`] = drawing.name
    })
    setLabelOverrides(nextLocalOverrides)

    setApiOverrides((previous) => {
      const next = { ...previous }
      next[`client:${client.clientSlug}`] = clientName
      next[`job:${jobId}`] = jobName
      drawings.forEach((drawing) => {
        next[`drawing:${jobId}/${drawing.slug}`] = drawing.name
      })
      return next
    })

    try {
      await saveProjectMeta({
        clientSlug: client.clientSlug,
        jobSlug: job.jobSlug,
        clientName,
        jobName,
        drawings,
      })
      setMetaPresence((previous) => ({ ...previous, [jobId]: true }))
    } catch {
      // Keep local changes, even if remote metadata save fails.
    }

    cancelEditJob(jobId)
  }

  async function deleteJobEdits(client, job) {
    const jobId = `${client.clientSlug}/${job.jobSlug}`

    setLabelOverrides((previous) => {
      const next = { ...previous }
      delete next[`client:${client.clientSlug}`]
      delete next[`job:${jobId}`]
      job.drawings.forEach((drawing) => {
        delete next[`drawing:${jobId}/${drawing.drawingSlug}`]
      })
      return next
    })

    setApiOverrides((previous) => {
      const next = { ...previous }
      delete next[`client:${client.clientSlug}`]
      delete next[`job:${jobId}`]
      job.drawings.forEach((drawing) => {
        delete next[`drawing:${jobId}/${drawing.drawingSlug}`]
      })
      return next
    })

    setMetaPresence((previous) => ({ ...previous, [jobId]: false }))
    cancelEditJob(jobId)

    try {
      await deleteProjectMeta(client.clientSlug, job.jobSlug)
    } catch {
      // UI stays responsive even if remote delete fails.
    }
  }

  async function copyShareText(id, value) {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedShareId(id)
      window.setTimeout(() => {
        setCopiedShareId((current) => (current === id ? '' : current))
      }, 1200)
    } catch {
      // Clipboard API may be unavailable in some browsers.
    }
  }

  return (
    <div className="app-shell">
      <Header project={project} title={headerTitle} subtitle={headerSubtitle} statusLabel={headerStatus} />
      <main className="dashboard-main-shell" role="main" aria-label="Project dashboard content">
        {status === 'loading' && (
          <section className="dashboard-placeholder">
            <h1>Loading project...</h1>
            <p>Reading local JSON data</p>
          </section>
        )}

        {status === 'invalid' && (
          <section className="dashboard-placeholder">
            <h1>{INVALID_LINK_MESSAGE}</h1>
            <p>Share link required: ?p=projectId</p>
          </section>
        )}

        {status === 'error' && (
          <section className="dashboard-placeholder">
            <h1>Unable to load project data.</h1>
            <p>Please check /public/data/projects.json</p>
          </section>
        )}

        {status === 'catalog' && (
          <section className="project-catalog" aria-label="Project folder catalog">
            <header className="project-catalog-header">
              <h1>lscfitouts</h1>
              <p>Loaded from ./projects/&lt;client-name&gt;/glb and ./projects/&lt;client-name&gt;/pdf</p>
            </header>

            {folderStatuses.length === 0 ? (
              <section className="dashboard-placeholder">
                <h1>No project folders found.</h1>
                <p>Add client folders under ./projects to populate this list.</p>
              </section>
            ) : (
              <>
                <div className="catalog-summary-grid" aria-label="Dashboard summary stats">
                  <div className="catalog-summary-card">
                    <span>Total Projects</span>
                    <strong>{catalogStats.total}</strong>
                  </div>
                  <div className="catalog-summary-card">
                    <span>With Model</span>
                    <strong>{catalogStats.withModel}</strong>
                  </div>
                  <div className="catalog-summary-card">
                    <span>With PDF</span>
                    <strong>{catalogStats.withPdf}</strong>
                  </div>
                  <div className="catalog-summary-card">
                    <span>Missing Both</span>
                    <strong>{catalogStats.missingBoth}</strong>
                  </div>
                </div>

                <div className="project-catalog-tools" aria-label="Dashboard tools">
                  <label className="catalog-search">
                    <span>Search</span>
                    <input
                      type="search"
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      placeholder="Search project folders"
                    />
                  </label>

                  <label className="catalog-sort">
                    <span>Sort</span>
                    <select value={sortMode} onChange={(event) => setSortMode(event.target.value)}>
                      <option value="name-asc">Name A-Z</option>
                      <option value="name-desc">Name Z-A</option>
                      <option value="model-first">Model Available First</option>
                      <option value="pdf-first">PDF Available First</option>
                    </select>
                  </label>

                  <p className="catalog-results">Showing {filteredFolderStatuses.length} of {folderStatuses.length} projects</p>
                </div>

                <section className="client-organizer" aria-label="Client and job organizer">
                  <header className="client-organizer-header">
                    <h2>Client / Job Organizer</h2>
                    <p>Folder structure: projects/client/job-name/drawing-title</p>
                  </header>

                  {filteredClientTree.length === 0 ? (
                    <p className="client-organizer-empty">No client/job entries match your search.</p>
                  ) : (
                    <div className="client-organizer-grid">
                      {filteredClientTree.map((client) => (
                        <article key={client.clientSlug} className="client-organizer-card">
                          <label>
                            <span>Client</span>
                            <input
                              type="text"
                              value={client.displayClientName}
                              readOnly
                            />
                          </label>

                          <div className="client-organizer-jobs">
                            {client.jobs.map((job) => {
                              const jobId = `${client.clientSlug}/${job.jobSlug}`
                              const folderPath = buildJobFolderPath(client.clientSlug, job.jobSlug)
                              const shareUrl = buildJobShareUrl(client.clientSlug, job.jobSlug)
                              const modelViewerUrl = buildJobModelViewerUrl(job)
                              const modelCount = job.drawings.filter((drawing) => drawing.hasModel).length
                              const pdfCount = job.drawings.filter((drawing) => drawing.hasPdf).length
                              const draft = draftEdits[jobId]
                              const isEditing = Boolean(editingJobs[jobId])
                              const hasSavedMeta = Boolean(metaPresence[jobId])

                              return (
                                <section key={jobId} className="client-job-item">
                                  <div className="client-job-frame-head">
                                    <div className="client-job-frame-title">
                                      <strong>{client.displayClientName}</strong>
                                      <span>{isEditing ? draft?.jobName || '' : job.displayJobName}</span>
                                    </div>
                                    <div className="client-job-frame-stats">
                                      <span>{modelCount} model{modelCount === 1 ? '' : 's'}</span>
                                      <span>{pdfCount} drawing{pdfCount === 1 ? '' : 's'}</span>
                                    </div>
                                  </div>

                                  <label>
                                    <span>Job</span>
                                    <input
                                      type="text"
                                      value={isEditing ? draft?.jobName || '' : job.displayJobName}
                                      onChange={(event) => updateDraftField(jobId, 'jobName', event.target.value)}
                                      readOnly={!isEditing}
                                    />
                                  </label>

                                  <div className="client-job-controls">
                                    <button type="button" onClick={() => beginEditJob(client, job)} disabled={isEditing}>
                                      Edit
                                    </button>
                                    <button type="button" onClick={() => saveJobEdits(client, job)} disabled={!isEditing || hasSavedMeta}>
                                      Save
                                    </button>
                                    <button type="button" onClick={() => saveJobEdits(client, job)} disabled={!isEditing || !hasSavedMeta}>
                                      Update
                                    </button>
                                    <button type="button" onClick={() => deleteJobEdits(client, job)}>
                                      Delete
                                    </button>
                                  </div>

                                  {isEditing && (
                                    <label>
                                      <span>Client</span>
                                      <input
                                        type="text"
                                        value={draft?.clientName || ''}
                                        onChange={(event) => updateDraftField(jobId, 'clientName', event.target.value)}
                                      />
                                    </label>
                                  )}

                                  <div className="client-share-box">
                                    <p>{folderPath}</p>
                                    <div className="client-share-actions">
                                      <a href={shareUrl} target="_blank" rel="noreferrer">
                                        Open Client Page
                                      </a>
                                      {modelViewerUrl ? (
                                        <a href={modelViewerUrl} target="_blank" rel="noreferrer">
                                          Open Model Viewer
                                        </a>
                                      ) : (
                                        <span className="client-share-disabled">No Model Viewer</span>
                                      )}
                                      <button type="button" onClick={() => copyShareText(`${jobId}:folder`, folderPath)}>
                                        {copiedShareId === `${jobId}:folder` ? 'Copied' : 'Copy Folder'}
                                      </button>
                                      <button type="button" onClick={() => copyShareText(`${jobId}:link`, shareUrl)}>
                                        {copiedShareId === `${jobId}:link` ? 'Copied' : 'Copy Share Link'}
                                      </button>
                                    </div>
                                  </div>

                                  <div className="client-drawing-list">
                                    {job.drawings.map((drawing) => {
                                      const drawingId = `${client.clientSlug}/${job.jobSlug}/${drawing.drawingSlug}`
                                      return (
                                        <label key={drawingId}>
                                          <span>Drawing</span>
                                          <input
                                            type="text"
                                            value={isEditing ? draft?.drawings?.[drawing.drawingSlug] || '' : drawing.displayTitle}
                                            onChange={(event) => updateDraftDrawing(jobId, drawing.drawingSlug, event.target.value)}
                                            readOnly={!isEditing}
                                          />
                                        </label>
                                      )
                                    })}
                                  </div>
                                </section>
                              )
                            })}
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </section>

                <div className="project-catalog-grid">
                  {filteredFolderStatuses.map((entry) => {
                    const modelUrl = entry.hasModel ? buildStandaloneViewerUrl(withBasePath(entry.modelFiles[0])) : ''
                    const pdfUrl = entry.hasPdf ? withBasePath(entry.drawingFiles[0]) : ''

                    return (
                    <article
                      key={entry.projectFolder}
                      className={`project-status-card ${entry.hasModel || entry.hasPdf ? 'is-clickable' : ''}`}
                      onClick={() => openCatalogEntry(entry)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          openCatalogEntry(entry)
                        }
                      }}
                      tabIndex={entry.hasModel || entry.hasPdf ? 0 : -1}
                      role={entry.hasModel || entry.hasPdf ? 'link' : undefined}
                      aria-label={entry.hasModel || entry.hasPdf ? `Open ${entry.projectName}` : undefined}
                    >
                      <h2>{entry.projectName}</h2>
                      <p className="project-folder-path">projects/{entry.projectFolder}</p>

                      <div className="project-card-action-row">
                        <div className="project-card-media">
                          {entry.hasPreview ? (
                            <img src={withBasePath(entry.previewImage)} alt={`${entry.projectName} preview`} className="project-card-preview" />
                          ) : (
                            <div className="project-card-placeholder">No Preview</div>
                          )}
                        </div>

                        <div className="project-status-links" onClick={(event) => event.stopPropagation()}>
                          {modelUrl ? (
                            <a href={modelUrl} target="_blank" rel="noreferrer">
                              Open 3D
                            </a>
                          ) : (
                            <span className="project-status-link-disabled">No 3D</span>
                          )}

                          {pdfUrl ? (
                            <a href={pdfUrl} target="_blank" rel="noreferrer">
                              Open PDF
                            </a>
                          ) : (
                            <span className="project-status-link-disabled">No PDF</span>
                          )}
                        </div>
                      </div>

                      <div className="project-status-row">
                        <span>3D Model</span>
                        <strong className={entry.hasModel ? 'status-ok' : 'status-missing'}>
                          {entry.hasModel ? 'Available' : 'Missing'}
                        </strong>
                      </div>

                      <div className="project-status-row">
                        <span>PDF</span>
                        <strong className={entry.hasPdf ? 'status-ok' : 'status-missing'}>
                          {entry.hasPdf ? 'Available' : 'Missing'}
                        </strong>
                      </div>

                    </article>
                    )
                  })}
                </div>

                {filteredFolderStatuses.length === 0 && (
                  <section className="dashboard-placeholder">
                    <h1>No matching projects.</h1>
                    <p>Try a different search term.</p>
                  </section>
                )}
              </>
            )}
          </section>
        )}

        {status === 'ready' && project && (
          <div className="dashboard-layout" aria-label="Active project dashboard">
            <Sidebar project={project} activeTab={activeTab} onTabChange={setActiveTab} />

            <section className="dashboard-content">
              <div className="tab-switcher" aria-label="Viewer tab switcher">
                <button className={activeTab === '3d' ? 'active' : ''} onClick={() => setActiveTab('3d')}>
                  3D Viewer
                </button>
                <button className={activeTab === 'pdf' ? 'active' : ''} onClick={() => setActiveTab('pdf')}>
                  PDF Viewer
                </button>
                <span className="token-label">Token: {projectId}</span>
              </div>

              <section className="dashboard-summary" aria-label="Dashboard summary">
                <h2>Dashboard Summary</h2>
                <p>This is the main client dashboard view currently in use.</p>
                <div className="summary-grid">
                  <div className="summary-item">
                    <span>Project Token</span>
                    <strong>{projectId}</strong>
                  </div>
                  <div className="summary-item">
                    <span>Resolved 3D Model URL</span>
                    {resolvedModelUrl ? (
                      <a className="summary-url-link" href={resolvedModelUrl} target="_blank" rel="noreferrer">
                        {resolvedModelUrl}
                      </a>
                    ) : (
                      <strong className="summary-url">N/A</strong>
                    )}
                  </div>
                  <div className="summary-item">
                    <span>Resolved PDF URL</span>
                    {resolvedDrawingUrl ? (
                      <a className="summary-url-link" href={resolvedDrawingUrl} target="_blank" rel="noreferrer">
                        {resolvedDrawingUrl}
                      </a>
                    ) : (
                      <strong className="summary-url">N/A</strong>
                    )}
                  </div>
                </div>
              </section>

              <Suspense
                fallback={
                  <section className="dashboard-placeholder">
                    <h1>Loading viewer...</h1>
                    <p>Preparing {activeTab === '3d' ? '3D' : 'PDF'} tools</p>
                  </section>
                }
              >
                {activeTab === '3d' ? (
                  <LazyThreeDViewer modelUrl={resolvedModelUrl} />
                ) : (
                  <LazyPdfViewer
                    fileUrl={resolvedDrawingUrl}
                    drawingName={project?.drawings?.[0]?.name}
                    revision={project?.drawings?.[0]?.revision}
                    lastUpdated={project?.drawings?.[0]?.lastUpdated}
                  />
                )}
              </Suspense>
            </section>
          </div>
        )}
      </main>
    </div>
  )
}
