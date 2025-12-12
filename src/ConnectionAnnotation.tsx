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

// Delay before unhover (allows time to move between span and line)
const UNHOVER_DELAY = 50

// How far into the left margin the gutter line extends
const GUTTER_MARGIN = 20

class ConnectionAnnotationComponent extends Component<ConnectionAnnotationProps, ConnectionAnnotationState> {
  state: ConnectionAnnotationState = {
    isHovered: false,
    resizeKey: 0,
    isReady: false
  }

  private unhoverTimeout: ReturnType<typeof setTimeout> | null = null

  private resizeHandler = () => {
    this.setState(prev => ({ resizeKey: prev.resizeKey + 1 }))
  }

  private cancelUnhover = () => {
    if (this.unhoverTimeout) {
      clearTimeout(this.unhoverTimeout)
      this.unhoverTimeout = null
    }
  }

  private scheduleUnhover = () => {
    this.cancelUnhover()
    this.unhoverTimeout = setTimeout(() => {
      this.unhoverTimeout = null
      this.setHovered(false)
    }, UNHOVER_DELAY)
  }

  private handleMouseEnterSpan = (event: Event) => {
    const target = event.target as HTMLElement
    const markElement = target.closest('span[data-annotation-id]') as HTMLElement | null
    if (!markElement) return // Not entering any annotation span

    const foundId = markElement.getAttribute('data-annotation-id')
    const myId = this.props.annotation.annotationId

    if (foundId !== myId) return // Not our annotation

    this.cancelUnhover()
    this.setHovered(true)
  }

  private handleMouseLeaveSpan = (event: Event) => {
    const target = event.target as HTMLElement
    const markElement = target.closest('span[data-annotation-id]') as HTMLElement | null
    if (!markElement) return // Not leaving any annotation span

    const foundId = markElement.getAttribute('data-annotation-id')
    const myId = this.props.annotation.annotationId

    if (foundId !== myId) return // Not our annotation

    // Schedule unhover with delay - if we enter another element of this connection, it will cancel
    this.scheduleUnhover()
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

  componentDidMount() {
    const { editor } = this.props
    const editorDom = editor.view.dom

    // Add hover listeners
    editorDom.addEventListener('mouseover', this.handleMouseEnterSpan)
    editorDom.addEventListener('mouseout', this.handleMouseLeaveSpan)
    // Add click listener for spans
    editorDom.addEventListener('click', this.handleSpanClick)

    // Add resize listener
    window.addEventListener('resize', this.resizeHandler)

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

    window.removeEventListener('resize', this.resizeHandler)

    // Clean up
    this.cancelUnhover()
  }

  private setHovered(isHovered: boolean) {
    this.setState({ isHovered })
  }

  // Render a dynamic style tag to highlight spans - survives TipTap re-renders
  private renderHoverStyle(): React.ReactNode {
    const { annotation } = this.props
    const { isHovered } = this.state

    if (!isHovered) return null

    const css = `
      span[data-annotation-id="${annotation.annotationId}"] {
        filter: brightness(1.5) !important;
        background-color: rgba(97, 218, 251, 0.4) !important;
      }
    `

    return <style dangerouslySetInnerHTML={{ __html: css }} />
  }

  private handleLineMouseEnter = () => {
    this.cancelUnhover()
    if (!this.state.isHovered) {
      this.setHovered(true)
    }
  }

  private handleLineMouseLeave = () => {
    this.scheduleUnhover()
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

    const strokeColor = isHovered ? '#61dafb' : 'rgba(97, 218, 251, 0.6)'
    const strokeWidth = isHovered ? 2 : 1.5

    let pathD: string

    if (sameLine) {
      const y = span1.bottom - 2
      pathD = `M ${span1.right} ${y} L ${span2.left} ${y}`
    } else {
      const x1 = span1.left
      const y1 = span1.bottom
      const x2 = span2.left
      const y2 = span2.bottom

      const contentLeftEdge = this.getContentLeftEdge()
      const gutterX = contentLeftEdge - GUTTER_MARGIN

      pathD = `M ${x1} ${y1} L ${gutterX} ${y1} L ${gutterX} ${y2} L ${x2} ${y2}`
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
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            pointerEvents: 'none',
            transition: 'stroke 0.15s ease, stroke-width 0.15s ease'
          }}
        />
      </svg>
    )
  }

  private renderPopup(): React.ReactNode {
    const { annotation, isPopupOpen, popupPosition, onPopupClose, onDeleteRecord } = this.props

    console.log('[ConnectionAnnotation] renderPopup', {
      annotationId: annotation.annotationId,
      isPopupOpen,
      popupPosition,
      type: annotation.annotation.type
    })

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
