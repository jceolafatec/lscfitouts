import { useEffect, useMemo, useState } from 'react'
import { loadClientDrawingTree } from '../lib/clientFolders'
import { loadProjectMeta } from '../lib/projectMetaXml'
import { withBasePath } from '../lib/pathing'
import { normalizeExternalAssetUrl } from '../lib/externalAssets'

function buildViewerUrl(modelUrl) {
  const viewerUrl = withBasePath('/viewer.html')
  const params = new URLSearchParams({ model: modelUrl })
  return `${viewerUrl}?${params.toString()}`
}

export function ClientPage() {
  const logoSrc = `${import.meta.env.BASE_URL}assets/logo.png`
  const [search, setSearch] = useState('')
  const [activeClient, setActiveClient] = useState('')
  const [activeJob, setActiveJob] = useState('')
  const [apiOverrides, setApiOverrides] = useState({})
  const [allClients, setAllClients] = useState([])

  useEffect(() => {
    loadClientDrawingTree().then(setAllClients).catch(() => setAllClients([]))
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const clientParam = params.get('client') || ''
    const jobParam = params.get('job') || ''

    if (clientParam) {
      setActiveClient(clientParam)
    }
    if (jobParam) {
      setActiveJob(jobParam)
    }
  }, [])

  useEffect(() => {
    let alive = true

    async function bootstrapMetaOverrides() {
      const next = {}
      const jobs = []
      allClients.forEach((client) => {
        client.jobs.forEach((job) => jobs.push({ client, job }))
      })

      await Promise.all(
        jobs.map(async ({ client, job }) => {
          try {
            const meta = await loadProjectMeta(client.clientSlug, job.jobSlug)
            if (!meta) return

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
            // Keep page functional if metadata endpoint is unavailable.
          }
        }),
      )

      if (alive) {
        setApiOverrides(next)
      }
    }

    bootstrapMetaOverrides()
    return () => {
      alive = false
    }
  }, [allClients])

  const filteredClients = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const source = allClients
      .map((client) => {
        const clientName = apiOverrides[`client:${client.clientSlug}`] || client.clientName
        const jobs = client.jobs.map((job) => {
          const jobKey = `${client.clientSlug}/${job.jobSlug}`
          const jobName = apiOverrides[`job:${jobKey}`] || job.jobName
          const drawings = job.drawings.map((drawing) => ({
            ...drawing,
            title: apiOverrides[`drawing:${jobKey}/${drawing.drawingSlug}`] || drawing.title,
            modelFiles: apiOverrides[`modelUrl:${jobKey}/${drawing.drawingSlug}`]
              ? [apiOverrides[`modelUrl:${jobKey}/${drawing.drawingSlug}`]]
              : drawing.modelFiles,
            drawingFiles: apiOverrides[`pdfUrl:${jobKey}/${drawing.drawingSlug}`]
              ? [apiOverrides[`pdfUrl:${jobKey}/${drawing.drawingSlug}`]]
              : drawing.drawingFiles,
            imageFiles: apiOverrides[`imageUrl:${jobKey}/${drawing.drawingSlug}`]
              ? [apiOverrides[`imageUrl:${jobKey}/${drawing.drawingSlug}`]]
              : drawing.imageFiles,
          })).map((drawing) => ({
            ...drawing,
            coverImage: drawing.imageFiles?.[0] || '',
            hasModel: (drawing.modelFiles || []).length > 0,
            hasPdf: (drawing.drawingFiles || []).length > 0,
          }))
          return {
            ...job,
            jobName,
            drawings,
          }
        })

        return {
          ...client,
          clientName,
          jobs,
        }
      })

    if (!needle) return source

    return source
      .map((client) => {
        const jobs = client.jobs
          .map((job) => {
            const drawings = job.drawings.filter((drawing) => {
              const searchSpace = `${client.clientName} ${job.jobName} ${drawing.title}`.toLowerCase()
              return searchSpace.includes(needle)
            })
            return { ...job, drawings }
          })
          .filter((job) => job.drawings.length > 0)

        return { ...client, jobs }
      })
      .filter((client) => client.jobs.length > 0)
  }, [allClients, apiOverrides, search])

  const activeClientSlug = activeClient || filteredClients[0]?.clientSlug || ''
  const activeClientData = filteredClients.find((item) => item.clientSlug === activeClientSlug) || null
  const activeJobSlug = activeJob || activeClientData?.jobs[0]?.jobSlug || ''
  const activeJobData = activeClientData?.jobs.find((job) => job.jobSlug === activeJobSlug) || null
  const brandClientLabel = activeClientData?.clientName || 'Client'
  const brandJobLabel = activeJobData?.jobName || 'Job'

  const modelDrawings = activeJobData?.drawings.filter((drawing) => drawing.hasModel) || []
  const pdfDrawings = activeJobData?.drawings.filter((drawing) => drawing.hasPdf) || []

  return (
    <div className="client-page-shell">
      <aside className="client-sidebar" aria-label="Client list">
        <div className="client-brand-wrap">
          <img
            src={logoSrc}
            alt="LSC Fitouts"
            className="client-logo"
            onError={(event) => {
              event.currentTarget.onerror = null
              event.currentTarget.src = 'assets/logo.png'
            }}
          />
          <p className="client-kicker">LSC Fitouts</p>
          <h1>{brandClientLabel}</h1>
          <p>Job: {brandJobLabel}</p>
        </div>

        <label className="client-search">
          <span>Search</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Find client, job, drawing"
          />
        </label>

        <nav className="client-nav-list">
          {filteredClients.map((client) => (
            <button
              key={client.clientSlug}
              className={`client-nav-item ${client.clientSlug === activeClientSlug ? 'is-active' : ''}`}
              onClick={() => {
                setActiveClient(client.clientSlug)
                setActiveJob('')
              }}
            >
              <strong>{client.clientName}</strong>
              <span>{client.jobs.length} jobs</span>
            </button>
          ))}
        </nav>
      </aside>

      <main className="client-main" aria-label="Client drawings">
        {!activeClientData && (
          <section className="client-empty-state">
            <h2>No matching client folders found</h2>
            <p>Expected format: projects/client-name/job-name/drawing-title</p>
          </section>
        )}

        {activeClientData && (
          <>
            <header className="client-main-header">
              <div>
                <h2>{activeClientData.clientName}</h2>
                <p>{activeClientData.jobs.length} jobs available</p>
              </div>

              <div className="client-stat-pills">
                <span>{activeClientData.jobs.reduce((acc, job) => acc + job.drawings.length, 0)} drawings</span>
                <span>{activeClientData.jobs.reduce((acc, job) => acc + job.drawings.filter((item) => item.hasModel).length, 0)} with 3D</span>
                <span>{activeClientData.jobs.reduce((acc, job) => acc + job.drawings.filter((item) => item.hasPdf).length, 0)} with PDF</span>
              </div>
            </header>

            <div className="job-tabs" role="tablist" aria-label="Jobs">
              {activeClientData.jobs.map((job) => (
                <button
                  key={job.jobSlug}
                  className={`job-tab-btn ${job.jobSlug === activeJobSlug ? 'is-active' : ''}`}
                  onClick={() => setActiveJob(job.jobSlug)}
                >
                  <strong>{job.jobName}</strong>
                  <span>{job.drawings.length} drawings</span>
                </button>
              ))}
            </div>

            {activeJobData && (
              <section className="job-sections-wrap" aria-label="Job assets">
                <header className="job-sections-header">
                  <h3>{activeJobData.jobName}</h3>
                  <p>projects/{activeClientData.clientSlug}/{activeJobData.jobSlug}</p>
                </header>

                <div className="job-sections-grid">
                  <section className="asset-section" aria-label="3D models section">
                    <div className="asset-section-header">
                      <h4>3D Models</h4>
                      <span>{modelDrawings.length}</span>
                    </div>

                    {modelDrawings.length === 0 ? (
                      <p className="asset-empty">No 3D models in this job.</p>
                    ) : (
                      <div className="drawing-card-stack">
                        {modelDrawings.map((drawing, index) => (
                          <article
                            key={`${activeJobData.jobSlug}-${drawing.drawingSlug}-model`}
                            className="drawing-card"
                            style={{ animationDelay: `${Math.min(index * 50, 400)}ms` }}
                          >
                            <div className="drawing-cover-wrap">
                              {drawing.coverImage ? (
                                <img src={drawing.coverImage} alt={`${drawing.title} preview`} className="drawing-cover" />
                              ) : (
                                <div className="drawing-cover-placeholder">No preview</div>
                              )}
                            </div>

                            <div className="drawing-content">
                              <h5>{drawing.title}</h5>
                              <p>Interactive GLB/GLTF model ready</p>
                            </div>

                            <div className="drawing-actions">
                              <a href={buildViewerUrl(drawing.modelFiles[0])} target="_blank" rel="noreferrer">
                                Open 3D
                              </a>
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                  </section>

                  <section className="asset-section" aria-label="PDF drawings section">
                    <div className="asset-section-header">
                      <h4>Shopdrawings</h4>
                      <span>{pdfDrawings.length}</span>
                    </div>

                    {pdfDrawings.length === 0 ? (
                      <p className="asset-empty">No Shopdrawings in this job.</p>
                    ) : (
                      <div className="drawing-card-stack">
                        {pdfDrawings.map((drawing, index) => (
                          <article
                            key={`${activeJobData.jobSlug}-${drawing.drawingSlug}-pdf`}
                            className="drawing-card"
                            style={{ animationDelay: `${Math.min(index * 50, 400)}ms` }}
                          >
                            <div className="drawing-cover-wrap">
                              {drawing.coverImage ? (
                                <img src={drawing.coverImage} alt={`${drawing.title} preview`} className="drawing-cover" />
                              ) : (
                                <div className="drawing-cover-placeholder">No preview</div>
                              )}
                            </div>

                            <div className="drawing-content">
                              <h5>{drawing.title}</h5>
                              <p>Drawing pack ready for review</p>
                            </div>

                            <div className="drawing-actions">
                              <a href={drawing.drawingFiles[0]} target="_blank" rel="noreferrer">
                                Open PDF
                              </a>
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              </section>
            )}

            {!activeJobData && (
              <section className="client-empty-state">
                <h2>No jobs found for this client</h2>
                <p>Try a different client or search filter.</p>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  )
}
