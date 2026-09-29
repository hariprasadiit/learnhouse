import { describe, expect, test } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import AIMarkdownRenderer from '../components/Objects/Activities/AI/AIMarkdownRenderer'
import { buildHtmlPreviewDocument, isSupportedMermaidSource } from '../components/Objects/Activities/AI/AIInteractivePreview'

describe('activity AI interactive answers', () => {
  test('renders HTML automatically with source collapsed and an isolated frame', () => {
    const output = renderToStaticMarkup(
      React.createElement(AIMarkdownRenderer, { content: 'Try this:\n\n```html\n<button onclick="this.textContent=\'Done\'">Start</button>\n```' })
    )

    expect(output).toContain('Try this:')
    expect(output).toContain('title="AI interactive example"')
    expect(output).toContain('sandbox="allow-scripts"')
    expect(output).toContain('aria-expanded="false"')
    expect(output).toContain('View source')
    expect(output).not.toContain('<pre id=')
  })

  test('renders Mermaid as a diagram placeholder while it loads', () => {
    const output = renderToStaticMarkup(
      React.createElement(AIMarkdownRenderer, { content: '```mermaid\ngraph LR\nA-->B\n```' })
    )
    expect(output).toContain('Rendering diagram')
    expect(output).toContain('View source')
  })

  test('waits for a completed answer before running HTML', () => {
    const output = renderToStaticMarkup(
      React.createElement(AIMarkdownRenderer, {
        content: '```html\n<button>Start</button>',
        isStreaming: true,
      })
    )
    expect(output).toContain('Creating interactive example')
    expect(output).not.toContain('<iframe')
    expect(output).not.toContain('View source')
  })

  test('allows plain diagrams and blocks resource features before Mermaid runs', () => {
    expect(isSupportedMermaidSource('flowchart LR\nA[Camera] --> B[Recorder]')).toBe(true)
    expect(isSupportedMermaidSource('sequenceDiagram\nCamera->>Recorder: Video')).toBe(true)
    for (const source of [
      'flowchart LR\nA@{ img: "https://example.com/image", label: "Image" }',
      '---\nconfig:\n  themeCSS: "url(https://example.com)"\n---\nflowchart LR\nA-->B',
      '%%{init: {"themeCSS":"url(https://example.com)"}}%%\nflowchart LR\nA-->B',
      'flowchart LR\nA-->B;style A fill:red',
      'flowchart LR\nA["<img src=https://example.com>"]',
      'flowchart LR\nA["#60;img src=https://example.com#62;"]',
      'flowchart LR\nA["![image](https://example.com)"]',
    ]) expect(isSupportedMermaidSource(source)).toBe(false)
  })

  test('keeps model output inside a frame governed by a trusted navigation policy', () => {
    const document = buildHtmlPreviewDocument('</iframe><script>location.href="https://example.com"</script>')
    expect(document).not.toContain('<script>')
    expect(document).toContain('&lt;/iframe&gt;&lt;script&gt;')
    expect(document).toContain('srcdoc="')
    expect(document).toContain("frame-src 'none'")
    expect(document).toContain("connect-src 'none'")
    expect(document).toContain("form-action 'none'")
    expect(document).toContain("default-src 'none'")
  })
})
