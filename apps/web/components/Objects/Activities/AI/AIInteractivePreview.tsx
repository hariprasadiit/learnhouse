'use client'

import React from 'react'

type PreviewKind = 'html' | 'mermaid'

const MAX_PREVIEW_LENGTH = 40_000
const PREVIEW_CSP = "default-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-src 'none'; connect-src 'none'; worker-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:"

export function buildHtmlPreviewDocument(source: string): string {
  const innerDocument = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}"><style>html,body{margin:0;min-height:100%;font-family:system-ui,sans-serif}*{box-sizing:border-box}</style></head><body>${source}</body></html>`
  const escapedDocument = innerDocument.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  // The trusted outer policy also governs navigation of the generated frame.
  // A CSP inside generated HTML alone cannot stop it navigating itself.
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}"><style>html,body{margin:0;height:100%}iframe{display:block;width:100%;height:100%;border:0}</style></head><body><iframe title="Interactive content" sandbox="allow-scripts" referrerpolicy="no-referrer" srcdoc="${escapedDocument}"></iframe></body></html>`
}

let mermaidPromise: Promise<typeof import('mermaid').default> | undefined

export function isSupportedMermaidSource(source: string): boolean {
  // Mermaid prepares SVG in the app document. Only plain diagrams may reach it;
  // image nodes and custom CSS can otherwise fetch resources before isolation.
  const plainDiagram = /^(?:(?:graph|flowchart)\s+(?:TB|TD|BT|RL|LR)\b|sequenceDiagram\b|stateDiagram(?:-v2)?\b|classDiagram\b|erDiagram\b|pie\b|mindmap\b|timeline\b)/
  const resourceOrConfig = /%%\s*\{|@\s*\{|\\|&|#[^;\r\n]{1,32};|!\s*\[|<\s*[a-z!/?]|(?:^|[;\r\n])\s*(?:style|classDef|linkStyle|click|links?)\b/i
  return source.length <= 10_000 && plainDiagram.test(source.trimStart()) && !resourceOrConfig.test(source)
}

function getMermaid() {
  mermaidPromise ??= import('mermaid').then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      htmlLabels: false,
      maxTextSize: 10_000,
      maxEdges: 200,
      suppressErrorRendering: true,
    })
    return mermaid
  })
  return mermaidPromise
}

export default function AIInteractivePreview({ kind, source, isStreaming = false }: {
  kind: PreviewKind
  source: string
  isStreaming?: boolean
}) {
  const [showSource, setShowSource] = React.useState(false)
  const [diagramResult, setDiagramResult] = React.useState<{
    source: string
    svg?: string
    error?: boolean
  } | null>(null)
  const sourceId = React.useId()
  const tooLarge = source.length > MAX_PREVIEW_LENGTH
  const unsupportedDiagram = kind === 'mermaid' && !isSupportedMermaidSource(source)

  React.useEffect(() => {
    if (kind !== 'mermaid' || isStreaming || tooLarge || unsupportedDiagram) return

    let cancelled = false
    getMermaid()
      .then((mermaid) => mermaid.render(`ai-diagram-${crypto.randomUUID()}`, source))
      .then(({ svg }) => {
        if (!cancelled) setDiagramResult({ source, svg })
      })
      .catch(() => {
        if (!cancelled) setDiagramResult({ source, error: true })
      })

    return () => { cancelled = true }
  }, [kind, source, isStreaming, tooLarge, unsupportedDiagram])

  const label = kind === 'html' ? 'Interactive example' : 'Diagram'
  const diagram = diagramResult?.source === source ? diagramResult.svg : undefined
  const diagramError = diagramResult?.source === source && diagramResult.error
  return (
    <div className="my-3 overflow-hidden rounded-lg border border-white/15 bg-white/5 not-prose">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-2 text-xs text-white/70">
        <span className="font-medium">{label}</span>
        {!isStreaming && (
          <button
            type="button"
            aria-expanded={showSource}
            aria-controls={sourceId}
            onClick={() => setShowSource((shown) => !shown)}
            className="rounded px-2 py-1 text-purple-300 hover:bg-white/10 hover:text-purple-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-300"
          >
            {showSource ? 'Hide source' : 'View source'}
          </button>
        )}
      </div>
      {isStreaming ? (
        <p role="status" className="px-3 py-5 text-sm text-white/60">Creating {label.toLowerCase()}…</p>
      ) : tooLarge ? (
        <p className="px-3 py-5 text-sm text-white/60">Preview is too large to render.</p>
      ) : unsupportedDiagram ? (
        <p className="px-3 py-5 text-sm text-white/60">This diagram uses unsupported features. View its source for details.</p>
      ) : kind === 'html' ? (
        <iframe
          title="AI interactive example"
          srcDoc={buildHtmlPreviewDocument(source)}
          sandbox="allow-scripts"
          allow="camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'"
          referrerPolicy="no-referrer"
          className="block h-80 w-full bg-white"
        />
      ) : diagram ? (
        <iframe
          title="AI diagram"
          srcDoc={buildHtmlPreviewDocument(diagram)}
          sandbox=""
          referrerPolicy="no-referrer"
          className="block h-80 w-full bg-white"
        />
      ) : (
        <p role="status" className="px-3 py-5 text-sm text-white/60">
          {diagramError ? 'Could not render this diagram. View its source for details.' : 'Rendering diagram…'}
        </p>
      )}
      {showSource && (
        <pre id={sourceId} className="max-h-80 overflow-auto border-t border-white/10 bg-black/40 p-3 text-xs text-white/80"><code>{source}</code></pre>
      )}
    </div>
  )
}
