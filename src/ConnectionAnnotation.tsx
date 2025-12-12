import React, { Component } from 'react'
import { Editor as TiptapEditor } from '@tiptap/react'
import { TextSpanAnnotation, ConnectionAnnotation as ConnectionAnnotationType, getTextSpans } from './types'
import { AnnotationPopup } from './AnnotationPopup'
import ReferenceAnnotationContent from './ReferenceAnnotation'

interface ConnectionAnnotationProps {
  annotation: TextSpanAnnotation
  editor: TiptapEditor
  annotationLayerRef: React.RefObject<HTMLDivElement>
  findTextSpan: (textSpan: string) => { from: number; to: number } | null
  isPopupOpen: boolean
  popupPosition: { top: number; left: number } | null
  onPopupOpen: (annotationId: string, position: { top: number; left: number }) => void
  onPopupClose: () => void
  onDeleteRecord: (annotationId: string, recordIndex: number) => void
}

interface ConnectionAnnotationState {
  isHovered: boolean
  resizeKey: number
}

// Delay before unhover (allows time to move between span and line)
const UNHOVER_DELAY = 50

// How far into the left margin the gutter line extends
const GUTTER_MARGIN = 20

class ConnectionAnnotationComponent extends Component<ConnectionAnnotationProps, ConnectionAnnotationState> {
  state: ConnectionAnnotationState = {
    isHovered: false,
    resizeKey: 0
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

    console.log('[ConnectionAnnotation] mouseenter MY span', { foundId })
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

    console.log('[ConnectionAnnotation] mouseleave MY span', { foundId })
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

    console.log('[ConnectionAnnotation] click MY span', { foundId })
    const { editor, annotation, onPopupOpen } = this.props
    const editorRect = editor.view.dom.getBoundingClientRect()
    const position = {
      top: mouseEvent.clientY - editorRect.top + 8,
      left: mouseEvent.clientX - editorRect.left
    }
    console.log('[ConnectionAnnotation] calling onPopupOpen', { annotationId: annotation.annotationId, position })
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
    console.log('[ConnectionAnnotation] setHovered', {
      isHovered,
      annotationId: this.props.annotation.annotationId
    })

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
    console.log('[ConnectionAnnotation] line mouseenter, current isHovered:', this.state.isHovered)
    this.cancelUnhover()
    if (!this.state.isHovered) {
      this.setHovered(true)
    }
  }

  private handleLineMouseLeave = (event: React.MouseEvent) => {
    const relatedTarget = event.relatedTarget as HTMLElement | null
    console.log('[ConnectionAnnotation] line mouseleave, relatedTarget:', relatedTarget?.tagName, relatedTarget?.className)
    this.scheduleUnhover()
  }

  private handleLineClick = (event: React.MouseEvent) => {
    console.log('[ConnectionAnnotation] line click')
    const { editor, annotation, onPopupOpen } = this.props

    const editorRect = editor.view.dom.getBoundingClientRect()
    const position = {
      top: event.clientY - editorRect.top + 8,
      left: event.clientX - editorRect.left
    }

    console.log('[ConnectionAnnotation] line click calling onPopupOpen', { annotationId: annotation.annotationId, position })
    onPopupOpen(annotation.annotationId, position)
  }

  // Get the bounding rect for a text span, relative to the annotation layer
  private getSpanRect(textSpan: string): { left: number; right: number; top: number; bottom: number } | null {
    const { editor, findTextSpan, annotationLayerRef } = this.props
    if (!annotationLayerRef.current) return null

    const range = findTextSpan(textSpan)
    if (!range) return null

    const view = editor.view
    const layerRect = annotationLayerRef.current.getBoundingClientRect()

    const startCoords = view.coordsAtPos(range.from)
    const endCoords = view.coordsAtPos(range.to)

    return {
      left: startCoords.left - layerRect.left,
      right: endCoords.right - layerRect.left,
      top: startCoords.top - layerRect.top,
      bottom: endCoords.bottom - layerRect.top
    }
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
    const { annotation } = this.props
    const { isHovered } = this.state

    const spans = getTextSpans(annotation.textSpan)
    if (spans.length < 2) return null

    const rect1 = this.getSpanRect(spans[0])
    const rect2 = this.getSpanRect(spans[1])

    if (!rect1 || !rect2) return null

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
