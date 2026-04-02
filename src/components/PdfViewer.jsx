import { useEffect, useRef, useState } from 'react'

let pdfjsLibPromise

async function getPdfJsLib() {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = import('pdfjs-dist').then((module) => {
      module.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
      return module
    })
  }

  return pdfjsLibPromise
}

export function PdfViewer({ fileUrl, drawingName, revision, lastUpdated }) {
  const canvasRef = useRef(null)
  const pdfRef = useRef(null)
  const [numPages, setNumPages] = useState(0)
  const [page, setPage] = useState(1)
  const [zoom, setZoom] = useState(1.2)
  const [error, setError] = useState('')

  useEffect(() => {
    let canceled = false

    async function load() {
      if (!fileUrl) return
      try {
        setError('')
        const pdfjs = await getPdfJsLib()
        if (canceled) return
        const task = pdfjs.getDocument(fileUrl)
        const pdf = await task.promise
        if (canceled) return
        pdfRef.current = pdf
        setNumPages(pdf.numPages)
        setPage(1)
      } catch (err) {
        setError('Unable to load drawing PDF.')
        pdfRef.current = null
      }
    }

    load()
    return () => {
      canceled = true
    }
  }, [fileUrl])

  useEffect(() => {
    async function renderPage() {
      if (!pdfRef.current || !canvasRef.current) return
      const current = await pdfRef.current.getPage(page)
      const viewport = current.getViewport({ scale: zoom })
      const canvas = canvasRef.current
      const context = canvas.getContext('2d')
      canvas.width = viewport.width
      canvas.height = viewport.height
      await current.render({ canvasContext: context, viewport }).promise
    }

    renderPage()
  }, [page, zoom, numPages])

  if (!fileUrl) {
    return <div className="empty-panel">No drawing available for this project.</div>
  }

  return (
    <div className="pdf-viewer">
      <div className="pdf-toolbar">
        <button onClick={() => setZoom((z) => Math.max(0.6, z - 0.2))}>Zoom -</button>
        <button onClick={() => setZoom((z) => Math.min(3, z + 0.2))}>Zoom +</button>
        <button onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</button>
        <span>{page} / {numPages || 1}</span>
        <button onClick={() => setPage((p) => Math.min(numPages || 1, p + 1))}>Next</button>
        <span className="pdf-meta">{drawingName || 'Drawing'} · Rev {revision || 'A'} · Updated {lastUpdated || 'N/A'}</span>
      </div>
      {error ? <div className="panel-error">{error}</div> : <canvas ref={canvasRef} className="pdf-canvas" />}
    </div>
  )
}
