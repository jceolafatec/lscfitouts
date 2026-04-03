import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { Header } from '../components/layout/Header'
import { Sidebar } from '../components/layout/Sidebar'
import { loadProjectData, loadProjectFromUrl, resolveProjectAssetPath } from '../lib/projectData'
import { loadProjectFolderStatuses } from '../lib/projectFolders'
import { loadClientDrawingTree } from '../lib/clientFolders'
import { deleteProjectMeta, loadProjectMeta, saveProjectMeta } from '../lib/projectMetaXml'
import { withBasePath } from '../lib/pathing'
import { normalizeExternalAssetUrl } from '../lib/externalAssets'

const INVALID_LINK_MESSAGE = 'This project link is invalid or expired. Please contact LSC Fitouts.'
const LazyThreeDViewer = lazy(() => import('../components/ThreeDViewer').then((module) => ({ default: module.ThreeDViewer })))
const LazyPdfViewer = lazy(() => import('../components/PdfViewer').then((module) => ({ default: module.PdfViewer })))
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
  const [expandedDrawings, setExpandedDrawings] = useState({})
  const [drawingPathDrafts, setDrawingPathDrafts] = useState({})
  const [metaPresence, setMetaPresence] = useState({})
  const [folderStatuses, setFolderStatuses] = useState([])
  const [clientTree, setClientTree] = useState([])
  const [syncState, setSyncState] = useState('idle') // idle | syncing | done | error

  // Load project from URL on mount
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

  // Load folder statuses and client tree from backend API
  useEffect(() => {
    loadProjectFolderStatuses().then(setFolderStatuses).catch(() => setFolderStatuses([]))
    loadClientDrawingTree().then(setClientTree).catch(() => setClientTree([]))
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
              if (drawing.modelUrl) {
                next[`modelUrl:${client.clientSlug}/${job.jobSlug}/${drawing.slug}`] = normalizeExternalAssetUrl(drawing.modelUrl)
              }
              if (drawing.pdfUrl) {
                next[`pdfUrl:${client.clientSlug}/${job.jobSlug}/${drawing.slug}`] = drawing.pdfUrl
              }
              if (drawing.imageUrl) {
                next[`imageUrl:${client.clientSlug}/${job.jobSlug}/${drawing.slug}`] = drawing.imageUrl
              }
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
  }, [clientTree])

  const resolvedModelUrl = withBasePath(resolveProjectAssetPath(projectId, project, project?.models?.[0]?.url || ''))
  const resolvedDrawingUrl = withBasePath(resolveProjectAssetPath(projectId, project, project?.drawings?.[0]?.url || ''))
  const normalizedSearchTerm = searchTerm.trim().toLowerCase()
  const filteredFolderStatuses = folderStatuses
    .filter((entry) => {
      if (!normalizedSearchTerm) return true
      const searchableText = `${entry.projectName} ${entry.clientName || ''} ${entry.projectFolder}`.toLowerCase()
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
              const overrideModelUrl = apiOverrides[`modelUrl:${drawingId}`] || ''
              const overridePdfUrl = apiOverrides[`pdfUrl:${drawingId}`] || ''
              const overrideImageUrl = apiOverrides[`imageUrl:${drawingId}`] || ''
              const modelFiles = overrideModelUrl ? [overrideModelUrl] : drawing.modelFiles
              const drawingFiles = overridePdfUrl ? [overridePdfUrl] : drawing.drawingFiles
              const imageFiles = overrideImageUrl ? [overrideImageUrl] : drawing.imageFiles
              return {
                ...drawing,
                displayTitle: decorate('drawing', drawingId, drawing.title),
                modelFiles,
                drawingFiles,
                imageFiles,
                coverImage: imageFiles[0] || '',
                hasModel: modelFiles.length > 0,
                hasPdf: drawingFiles.length > 0,
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
  const headerTitle = status === 'catalog' ? 'Dashboard' : undefined
  const headerSubtitle = status === 'catalog' ? 'All jobs discovered under ./projects/<client>/<job>' : undefined
  const headerStatus = status === 'catalog' ? 'LSC Fitouts' : undefined
  const catalogStats = {
    total: folderStatuses.length,
    withModel: folderStatuses.filter((entry) => entry.hasModel).length,
    withPdf: folderStatuses.filter((entry) => entry.hasPdf).length,
    missingBoth: folderStatuses.filter((entry) => !entry.hasModel && !entry.hasPdf).length,
  }

  async function syncProjectsJson() {
    setSyncState('syncing')
    try {
      const res = await fetch('/api/sync-json', { method: 'POST' })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      setSyncState('done')
      setTimeout(() => setSyncState('idle'), 3000)
    } catch {
      setSyncState('error')
      setTimeout(() => setSyncState('idle'), 4000)
    }
  }

  function openCatalogEntry(entry) {
    const destination = entry.hasModel
      ? buildStandaloneViewerUrl(entry.modelFiles[0])
      : entry.hasPdf
        ? entry.drawingFiles[0]
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

  function toggleDrawingExpanded(drawingId) {
    setExpandedDrawings((prev) => ({
      ...prev,
      [drawingId]: !prev[drawingId],
    }))
  }

  function updateDrawingPathDraft(drawingId, field, value) {
    setDrawingPathDrafts((prev) => ({
      ...prev,
      [drawingId]: {
        ...prev[drawingId],
        [field]: value,
      },
    }))
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
      modelUrl: drawing.modelFiles?.[0] || '',
      pdfUrl: drawing.drawingFiles?.[0] || '',
      imageUrl: drawing.imageFiles?.[0] || '',
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
        if (drawing.modelUrl) next[`modelUrl:${jobId}/${drawing.slug}`] = drawing.modelUrl
        if (drawing.pdfUrl) next[`pdfUrl:${jobId}/${drawing.slug}`] = drawing.pdfUrl
        if (drawing.imageUrl) next[`imageUrl:${jobId}/${drawing.slug}`] = drawing.imageUrl
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
        delete next[`modelUrl:${jobId}/${drawing.drawingSlug}`]
        delete next[`pdfUrl:${jobId}/${drawing.drawingSlug}`]
        delete next[`imageUrl:${jobId}/${drawing.drawingSlug}`]
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

  function handleAddDrawing(client, job) {
    // TODO: wire to POST /api/projects/add-drawing to create folder structure
    window.alert(`Add drawing to ${client.displayClientName} / ${job.displayJobName} — coming soon`)
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
              <div>
                <h1>Dashboard</h1>
                <p>Loaded from ./projects/&lt;client-name&gt;/&lt;job-name&gt;/...</p>
              </div>
              <button
                type="button"
                className={`sync-json-btn${syncState === 'syncing' ? ' is-syncing' : syncState === 'done' ? ' is-done' : syncState === 'error' ? ' is-error' : ''}`}
                onClick={syncProjectsJson}
                disabled={syncState === 'syncing'}
                title="Write all project data + file paths to projects/projects.json"
              >
                {syncState === 'syncing' && (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true" className="spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                )}
                {syncState === 'done' && (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
                )}
                {syncState === 'error' && (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                )}
                {syncState === 'idle' && (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3"/></svg>
                )}
                {syncState === 'syncing' ? 'Syncing…' : syncState === 'done' ? 'Saved!' : syncState === 'error' ? 'Failed' : 'Sync JSON'}
              </button>
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
                    <p>Folder structure: projects/client/job-name/pdf-or-glb/drawing-folder/files</p>
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

                                  <div className="client-job-name-row">
                                    {!isEditing && (
                                      <button
                                        type="button"
                                        className="drawing-btn drawing-btn-edit"
                                        onClick={() => beginEditJob(client, job)}
                                        title="Edit"
                                        aria-label="Edit job metadata"
                                      >
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                      </button>
                                    )}
                                    <label className="client-job-name-label">
                                      <span>Job</span>
                                      <input
                                        type="text"
                                        value={isEditing ? draft?.jobName || '' : job.displayJobName}
                                        onChange={(event) => updateDraftField(jobId, 'jobName', event.target.value)}
                                        readOnly={!isEditing}
                                      />
                                    </label>
                                    <button
                                      type="button"
                                      className="drawing-btn drawing-btn-add"
                                      onClick={() => handleAddDrawing(client, job)}
                                      title="Add drawing"
                                      aria-label="Add a drawing"
                                    >
                                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                                    </button>
                                  </div>

                                  {isEditing && (
                                    <div className="client-edit-row">
                                      <button
                                        type="button"
                                        className="drawing-btn drawing-btn-edit"
                                        disabled
                                        title="Editing"
                                        aria-label="In edit mode"
                                      >
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                      </button>
                                      <label className="client-edit-label">
                                        <span>Client</span>
                                        <input
                                          type="text"
                                          value={draft?.clientName || ''}
                                          onChange={(event) => updateDraftField(jobId, 'clientName', event.target.value)}
                                        />
                                      </label>
                                    </div>
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
                                      const drawingPdfUrl = drawing.drawingFiles?.[0] || ''
                                      const drawingModelUrl = drawing.modelFiles?.[0]
                                        ? buildStandaloneViewerUrl(drawing.modelFiles[0])
                                        : ''
                                      const pdfFileName = drawingPdfUrl ? drawingPdfUrl.split('/').pop() : 'No PDF'
                                      const modelFileName = drawing.modelFiles?.[0] ? drawing.modelFiles[0].split('/').pop() : 'No Model'
                                      const isDrawingExpanded = expandedDrawings[drawingId]
                                      const pathDraft = drawingPathDrafts[drawingId] || { pdf: drawingPdfUrl, model: drawingModelUrl }
                                      
                                      return (
                                        <div key={drawingId} className="client-drawing-crud">
                                          <div className="client-drawing-row">
                                            <div className="drawing-media-half">
                                              <button
                                                type="button"
                                                className={`drawing-btn drawing-btn-pdf${drawing.hasPdf ? '' : ' is-disabled'}`}
                                                disabled={!drawing.hasPdf}
                                                onClick={() => drawingPdfUrl && window.open(drawingPdfUrl, '_blank', 'noopener,noreferrer')}
                                                title="Open PDF"
                                                aria-label={`Open PDF — ${pdfFileName}`}
                                              >
                                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/></svg>
                                              </button>
                                              <span className="drawing-file-name">{pdfFileName}</span>
                                              {isEditing && (
                                                <>
                                                  <button
                                                    type="button"
                                                    className="drawing-btn drawing-btn-edit-path"
                                                    onClick={() => toggleDrawingExpanded(drawingId)}
                                                    title="Edit PDF"
                                                    aria-label="Edit PDF"
                                                  >
                                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                                  </button>
                                                  <button
                                                    type="button"
                                                    className="drawing-btn drawing-btn-upload"
                                                    title="Upload PDF"
                                                    aria-label="Upload new PDF"
                                                    disabled
                                                  >
                                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                                                  </button>
                                                </>
                                              )}
                                            </div>

                                            <div className="drawing-media-half">
                                              <button
                                                type="button"
                                                className={`drawing-btn drawing-btn-3d${drawing.hasModel ? '' : ' is-disabled'}`}
                                                disabled={!drawing.hasModel}
                                                onClick={() => drawingModelUrl && window.open(drawingModelUrl, '_blank', 'noopener,noreferrer')}
                                                title="Open 3D Model"
                                                aria-label={`Open 3D — ${modelFileName}`}
                                              >
                                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
                                              </button>
                                              <span className="drawing-file-name">{modelFileName}</span>
                                              {isEditing && (
                                                <>
                                                  <button
                                                    type="button"
                                                    className="drawing-btn drawing-btn-edit-path"
                                                    onClick={() => toggleDrawingExpanded(drawingId)}
                                                    title="Edit 3D"
                                                    aria-label="Edit 3D Model"
                                                  >
                                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                                  </button>
                                                  <button
                                                    type="button"
                                                    className="drawing-btn drawing-btn-upload"
                                                    title="Upload 3D Model"
                                                    aria-label="Upload new 3D model"
                                                    disabled
                                                  >
                                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                                                  </button>
                                                </>
                                              )}
                                            </div>

                                            {isEditing ? (
                                              <>
                                                <button
                                                  type="button"
                                                  className="drawing-btn drawing-btn-save"
                                                  onClick={() => saveJobEdits(client, job)}
                                                  title="Save"
                                                  aria-label="Save changes"
                                                >
                                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                                                </button>
                                                <button
                                                  type="button"
                                                  className="drawing-btn drawing-btn-cancel"
                                                  onClick={() => cancelEditJob(jobId)}
                                                  title="Cancel"
                                                  aria-label="Cancel editing"
                                                >
                                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                                </button>
                                              </>
                                            ) : (
                                              <button
                                                type="button"
                                                className="drawing-btn drawing-btn-delete"
                                                onClick={() => deleteJobEdits(client, job)}
                                                title="Delete metadata"
                                                aria-label="Delete job metadata"
                                              >
                                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                                              </button>
                                            )}
                                          </div>

                                          {isEditing && isDrawingExpanded && (
                                            <div className="client-drawing-expand">
                                              <div className="drawing-path-group">
                                                <label className="drawing-path-label">
                                                  <span>PDF Path</span>
                                                  <input
                                                    type="text"
                                                    value={pathDraft.pdf || ''}
                                                    onChange={(e) => updateDrawingPathDraft(drawingId, 'pdf', e.target.value)}
                                                    placeholder="e.g., pdf/drawing.pdf"
                                                  />
                                                </label>
                                              </div>
                                              <div className="drawing-path-group">
                                                <label className="drawing-path-label">
                                                  <span>3D Model Path</span>
                                                  <input
                                                    type="text"
                                                    value={pathDraft.model || ''}
                                                    onChange={(e) => updateDrawingPathDraft(drawingId, 'model', e.target.value)}
                                                    placeholder="e.g., glb/model.glb"
                                                  />
                                                </label>
                                              </div>
                                            </div>
                                          )}
                                        </div>
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
