import React, { Component } from 'react'
import { Editor as TiptapEditor } from '@tiptap/react'
import { TextSpanAnnotation, getTextSpans } from './types'

// Represents a connection line's geometry between two text spans
interface ConnectionLineGeometry {
  annotationId: string
  // First span (top or left)
  span1: { left: number; right: number; top: number; bottom: number }
  // Second span (bottom or right)
  span2: { left: number; right: number; top: number; bottom: number }
  // Are spans on the same line?
  sameLine: boolean
}

interface ConnectionLinesProps {
  editor: TiptapEditor | null
  annotations: TextSpanAnnotation[]
  onClick: (annotationId: string, position: { top: number; left: number }) => void
  // Function to find text span range in editor
  findTextSpan: (textSpan: string) => { from: number; to: number } | null
}

interface ConnectionLinesState {
  hoveredConnectionId: string | null
  resizeKey: number // Force re-render on window resize
}

// How far into the left margin the gutter line goes (from left edge of editor content area)
const GUTTER_OFFSET = -20

class ConnectionLines extends Component<ConnectionLinesProps, ConnectionLinesState> {
  state: ConnectionLinesState = {
    hoveredConnectionId: null,
    resizeKey: 0
  }

  private resizeHandler = () => {
    this.setState(state => ({ resizeKey: state.resizeKey + 1 }))
  }

  componentDidMount() {
    window.addEventListener('resize', this.resizeHandler)
  }

  componentWillUnmount() {
    window.removeEventListener('resize', this.resizeHandler)
  }

  // Get the bounding rect for a text span in document coordinates
  private getSpanRect(textSpan: string): { left: number; right: number; top: number; bottom: number } | null {
    const { editor, findTextSpan } = this.props
    if (!editor) return null

    const range = findTextSpan(textSpan)
    if (!range) return null

    const view = editor.view
    const editorRect = view.dom.getBoundingClientRect()

    // Get coordinates at start and end of the range
    const startCoords = view.coordsAtPos(range.from)
    const endCoords = view.coordsAtPos(range.to)

    // Convert to editor-relative coordinates
    return {
      left: startCoords.left - editorRect.left,
      right: endCoords.right - editorRect.left,
      top: startCoords.top - editorRect.top,
      bottom: endCoords.bottom - editorRect.top
    }
  }

  // Calculate geometry for all connection annotations
  private getConnectionGeometries(): ConnectionLineGeometry[] {
    const geometries: ConnectionLineGeometry[] = []

    for (const annotation of this.props.annotations) {
      if (annotation.annotation.type !== 'connection') continue

      const spans = getTextSpans(annotation.textSpan)
      if (spans.length < 2) continue

      const rect1 = this.getSpanRect(spans[0])
      const rect2 = this.getSpanRect(spans[1])

      if (!rect1 || !rect2) continue

      // Determine which span is "first" (top-most, or left-most if same line)
      let span1 = rect1
      let span2 = rect2

      // If rect2 is above rect1, swap them
      if (rect2.top < rect1.top - 5) { // 5px tolerance for same line
        span1 = rect2
        span2 = rect1
      }

      // Check if they're on the same line (within 5px tolerance)
      const sameLine = Math.abs(span1.top - span2.top) < 5

      // If same line, order by horizontal position
      if (sameLine && span2.left < span1.left) {
        const temp = span1
        span1 = span2
        span2 = temp
      }

      geometries.push({
        annotationId: annotation.annotationId,
        span1,
        span2,
        sameLine
      })
    }

    return geometries
  }

  // Handle hover - update local state and toggle CSS classes on spans
  private handleHover = (annotationId: string | null) => {
    const { editor } = this.props
    const { hoveredConnectionId } = this.state

    // Remove hover class from previously hovered spans
    if (hoveredConnectionId && editor) {
      const prevSpans = editor.view.dom.querySelectorAll(
        `span[data-annotation-id="${hoveredConnectionId}"]`
      )
      prevSpans.forEach(span => span.classList.remove('connection-hovered'))
    }

    // Add hover class to newly hovered spans
    if (annotationId && editor) {
      const newSpans = editor.view.dom.querySelectorAll(
        `span[data-annotation-id="${annotationId}"]`
      )
      newSpans.forEach(span => span.classList.add('connection-hovered'))
    }

    this.setState({ hoveredConnectionId: annotationId })
  }

  // Handle click on connection line
  private handleClick = (annotationId: string, event: React.MouseEvent) => {
    const { editor, onClick } = this.props
    if (!editor) return

    const editorRect = editor.view.dom.getBoundingClientRect()
    const position = {
      top: event.clientY - editorRect.top + 8,
      left: event.clientX - editorRect.left
    }

    onClick(annotationId, position)
  }

  render() {
    const { editor } = this.props
    const { hoveredConnectionId } = this.state

    if (!editor) return null

    const geometries = this.getConnectionGeometries()
    if (geometries.length === 0) return null

    return (
      <svg
        className="connection-lines-svg"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          overflow: 'visible'
        }}
      >
        {geometries.map(({ annotationId, span1, span2, sameLine }) => {
          const isHovered = hoveredConnectionId === annotationId
          const strokeColor = isHovered ? '#61dafb' : 'rgba(97, 218, 251, 0.6)'
          const strokeWidth = isHovered ? 2 : 1.5

          let pathD: string

          if (sameLine) {
            // Same line: horizontal line from right edge of span1 to left edge of span2
            // Draw just below the text baseline
            const y = span1.bottom - 2
            pathD = `M ${span1.right} ${y} L ${span2.left} ${y}`
          } else {
            // Different lines: segmented path
            // From bottom-left of span1 -> left gutter -> top-left of span2
            const x1 = span1.left
            const y1 = span1.bottom
            const x2 = span2.left
            const y2 = span2.top

            // Gutter x position: always in the left margin (negative X relative to editor content)
            // This ensures the line goes into the margin and never cuts through text
            const gutterX = -GUTTER_OFFSET

            // Path: from span1 bottom-left -> notch left to gutter -> down -> notch right to span2 top-left
            pathD = `M ${x1} ${y1} L ${gutterX} ${y1} L ${gutterX} ${y2} L ${x2} ${y2}`
          }

          return (
            <path
              key={annotationId}
              d={pathD}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                pointerEvents: 'stroke',
                cursor: 'pointer',
                transition: 'stroke 0.15s ease, stroke-width 0.15s ease'
              }}
              onMouseEnter={() => this.handleHover(annotationId)}
              onMouseLeave={() => this.handleHover(null)}
              onClick={(e) => this.handleClick(annotationId, e)}
            />
          )
        })}
      </svg>
    )
  }
}

export default ConnectionLines
