import React, { Component } from 'react'
import { Editor as TiptapEditor } from '@tiptap/react'
import { TextSpanAnnotation, ConnectionAnnotation as ConnectionAnnotationType } from './types'
import { AnnotationPopup } from './AnnotationPopup'
import ReferenceAnnotationContent from './ReferenceAnnotation'

interface ConnectionAnnotationProps {
  annotation: TextSpanAnnotation
  editor: TiptapEditor
  annotationLayerRef: React.RefObject<HTMLDivElement>
  isPopupOpen: boolean
  popupPosition: { top: number; left: number } | null
  onPopupOpen: (annotationId: string, position: { top: number; left: number }) => void
  onPopupClose: () => void
  onDeleteRecord: (annotationId: string, recordIndex: number) => void
}

interface ConnectionAnnotationState {
  isHovered: boolean
  resizeKey: number
  isReady: boolean // True once marks are laid out in DOM
}

// How far into the left margin the gutter line extends
const GUTTER_MARGIN = 6

class ConnectionAnnotationComponent extends Component<ConnectionAnnotationProps, ConnectionAnnotationState> {
  state: ConnectionAnnotationState = {
    isHovered: false,
    resizeKey: 0,
    isReady: false
  }

  private resizeHandler = () => {
    this.setState(prev => ({ resizeKey: prev.resizeKey + 1 }))
  }

  private handleMouseEnterSpan = (event: Event) => {
    const target = event.target as HTMLElement
    const markElement = target.closest('span[data-annotation-id]') as HTMLElement | null
    if (!markElement) return

    const foundId = markElement.getAttribute('data-annotation-id')
    if (foundId !== this.props.annotation.annotationId) return

    this.setHovered(true)
  }

  private handleMouseLeaveSpan = (event: Event) => {
    const target = event.target as HTMLElement
    const markElement = target.closest('span[data-annotation-id]') as HTMLElement | null
    if (!markElement) return

    const foundId = markElement.getAttribute('data-annotation-id')
    if (foundId !== this.props.annotation.annotationId) return

    this.setHovered(false)
  }

  private handleSpanClick = (event: Event) => {
    const mouseEvent = event as MouseEvent
    const target = event.target as HTMLElement
    const markElement = target.closest('span[data-annotation-id]') as HTMLElement | null
    if (!markElement) return // Not clicking any annotation span

    const foundId = markElement.getAttribute('data-annotation-id')
    const myId = this.props.annotation.annotationId

    if (foundId !== myId) return // Not our annotation

    const { editor, annotation, onPopupOpen } = this.props
    const editorRect = editor.view.dom.getBoundingClientRect()
    const position = {
      top: mouseEvent.clientY - editorRect.top + 8,
      left: mouseEvent.clientX - editorRect.left
    }
    onPopupOpen(annotation.annotationId, position)
  }

  private resizeObserver: ResizeObserver | null = null

  componentDidMount() {
    const { editor } = this.props
    const editorDom = editor.view.dom

    // Add hover listeners
    editorDom.addEventListener('mouseover', this.handleMouseEnterSpan)
    editorDom.addEventListener('mouseout', this.handleMouseLeaveSpan)
    // Add click listener for spans
    editorDom.addEventListener('click', this.handleSpanClick)

    // Add ResizeObserver for the editor-content-wrapper
    // Catches both window resizes and sidebar collapse/expand
    const editorWrapper = editorDom.closest('.editor-content-wrapper')
    this.resizeObserver = new ResizeObserver(this.resizeHandler)
    if (editorWrapper) {
      this.resizeObserver.observe(editorWrapper)
    }

    // Wait for DOM layout before rendering SVG lines (avoids flicker)
    requestAnimationFrame(() => {
      this.setState({ isReady: true })
    })
  }

  componentWillUnmount() {
    const { editor } = this.props
    const editorDom = editor.view.dom

    editorDom.removeEventListener('mouseover', this.handleMouseEnterSpan)
    editorDom.removeEventListener('mouseout', this.handleMouseLeaveSpan)
    editorDom.removeEventListener('click', this.handleSpanClick)

    if (this.resizeObserver) {
      this.resizeObserver.disconnect()
      this.resizeObserver = null
    }
  }

  private setHovered(isHovered: boolean) {
    this.setState({ isHovered })
  }

  // Render a dynamic style tag that activates hover styles for this annotation
  // The actual styles are defined in CSS - we just add a selector that matches
  private renderHoverStyle(): React.ReactNode {
    const { annotation } = this.props
    const { isHovered } = this.state

    if (!isHovered) return null

    // Use attribute selector to match, styles defined in CSS
    const css = `
      .annotation-mark-connection[data-annotation-id="${annotation.annotationId}"] {
        background-color: var(--connection-color-hover);
        border-color: var(--connection-color-hover);
      }
    `

    return <style dangerouslySetInnerHTML={{ __html: css }} />
  }

  private handleLineMouseEnter = () => {
    this.setHovered(true)
  }

  private handleLineMouseLeave = () => {
    this.setHovered(false)
  }

  private handleLineClick = (event: React.MouseEvent) => {
    const { editor, annotation, onPopupOpen } = this.props

    const editorRect = editor.view.dom.getBoundingClientRect()
    const position = {
      top: event.clientY - editorRect.top + 8,
      left: event.clientX - editorRect.left
    }

    onPopupOpen(annotation.annotationId, position)
  }

  // Get bounding rects for all mark elements with this annotation ID, relative to the annotation layer
  // Returns an array of rects (one per span element in the DOM)
  private getMarkRects(): Array<{ left: number; right: number; top: number; bottom: number }> {
    const { editor, annotation, annotationLayerRef } = this.props
    if (!annotationLayerRef.current) return []

    const layerRect = annotationLayerRef.current.getBoundingClientRect()
    const markElements = editor.view.dom.querySelectorAll(
      `span[data-annotation-id="${annotation.annotationId}"]`
    )

    const rects: Array<{ left: number; right: number; top: number; bottom: number }> = []

    markElements.forEach(el => {
      const rect = el.getBoundingClientRect()
      rects.push({
        left: rect.left - layerRect.left,
        right: rect.right - layerRect.left,
        top: rect.top - layerRect.top,
        bottom: rect.bottom - layerRect.top
      })
    })

    return rects
  }

  // Get the left edge of the text content area, relative to annotation layer
  private getContentLeftEdge(): number {
    const { editor, annotationLayerRef } = this.props
    if (!annotationLayerRef.current) return 0

    const view = editor.view
    const layerRect = annotationLayerRef.current.getBoundingClientRect()
    const firstCharCoords = view.coordsAtPos(1)

    return firstCharCoords.left - layerRect.left
  }

  private renderLine(): React.ReactNode {
    const { isHovered, isReady } = this.state

    // Don't render until DOM is ready (avoids flicker)
    if (!isReady) return null

    // Get rects directly from DOM mark elements (survives text edits)
    const rects = this.getMarkRects()
    if (rects.length < 2) return null

    // Use the first two mark elements found
    const rect1 = rects[0]
    const rect2 = rects[1]

    // Determine which span is "first" (top-most, or left-most if same line)
    let span1 = rect1
    let span2 = rect2

    if (rect2.top < rect1.top - 5) {
      span1 = rect2
      span2 = rect1
    }

    const sameLine = Math.abs(span1.top - span2.top) < 5

    if (sameLine && span2.left < span1.left) {
      const temp = span1
      span1 = span2
      span2 = temp
    }

    const lineClassName = isHovered ? 'connection-line connection-line-hovered' : 'connection-line'

    let pathD: string

    // Length of the 45-degree tick at each endpoint
    const tickLen = 3

    if (sameLine) {
      const y = span1.bottom + 3
      // Line from span1 bottom-right to span2 bottom-left
      // First tick: "\" direction (down-left to down-right), second tick: "/" direction (up-left to up-right)
      pathD = `M ${span1.right - tickLen} ${y - tickLen} L ${span1.right} ${y} L ${span2.left} ${y} L ${span2.left + tickLen} ${y - tickLen}`
    } else {
      const x1 = span1.left
      const y1 = span1.bottom + 3
      const x2 = span2.left
      const y2 = span2.bottom + 3

      const contentLeftEdge = this.getContentLeftEdge()
      const gutterX = contentLeftEdge - GUTTER_MARGIN

      // Segmented path with 45-deg ticks going up-right at each end
      pathD = `M ${x1 + tickLen} ${y1 - tickLen} L ${x1} ${y1} L ${gutterX} ${y1} L ${gutterX} ${y2} L ${x2} ${y2} L ${x2 + tickLen} ${y2 - tickLen}`
    }

    return (
      <svg
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
        {/* Invisible wider path for better hit detection */}
        <path
          d={pathD}
          stroke="transparent"
          strokeWidth={12}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            pointerEvents: 'stroke',
            cursor: 'pointer'
          }}
          onMouseEnter={this.handleLineMouseEnter}
          onMouseLeave={this.handleLineMouseLeave}
          onClick={this.handleLineClick}
        />
        {/* Visible path */}
        <path
          d={pathD}
          className={lineClassName}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ pointerEvents: 'none' }}
        />
      </svg>
    )
  }

  private renderPopup(): React.ReactNode {
    const { annotation, isPopupOpen, popupPosition, onPopupClose, onDeleteRecord } = this.props

    if (annotation.annotation.type !== 'connection') return null

    const connectionAnnotation = annotation.annotation as ConnectionAnnotationType

    return (
      <AnnotationPopup
        annotationId={annotation.annotationId}
        popupLabel="Connection"
        isVisible={isPopupOpen}
        position={popupPosition}
        onPopupOpen={() => {}} // Already handled by click
        onPopupClose={onPopupClose}
      >
        <ReferenceAnnotationContent
          records={connectionAnnotation.records}
          onDeleteRecord={(recordIndex) => onDeleteRecord(annotation.annotationId, recordIndex)}
        />
      </AnnotationPopup>
    )
  }

  render() {
    return (
      <>
        {this.renderHoverStyle()}
        {this.renderLine()}
        {this.renderPopup()}
      </>
    )
  }
}

export default ConnectionAnnotationComponent
