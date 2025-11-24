import { Component, createRef } from 'react'
import { createPortal } from 'react-dom'
import { RoughNotation } from 'react-rough-notation'
import { AnnotationType } from './types'

interface AnnotationProps {
  textSpan: string
  annotations: AnnotationType[]
  isVisible: boolean
  annotationId: number
  onPopupOpen: () => void
  onPopupClose: (id: number) => void
  getPortalRoot?: () => HTMLElement | null
  onRequestFocus?: () => void
}

interface AnnotationState {
  popupPosition: { top: number; left: number } | null
  isHovered: boolean
  isPinned: boolean
  isDragging: boolean
  dragOffset: { x: number; y: number } | null
}

class AnnotationComponent extends Component<AnnotationProps, AnnotationState> {
  private containerRef = createRef<HTMLDivElement>()
  private popupRef = createRef<HTMLDivElement>()
  private closeTimeout: NodeJS.Timeout | null = null

  constructor(props: AnnotationProps) {
    super(props)
    this.state = {
      popupPosition: null,
      isHovered: false,
      isPinned: false,
      isDragging: false,
      dragOffset: null
    }
  }
  componentWillUnmount() {
    this.cancelClose()
    this.removeDragListeners()
  }

  private cancelClose = () => {
    if (this.closeTimeout) {
      clearTimeout(this.closeTimeout)
      this.closeTimeout = null
    }
  }

  private scheduleClose = () => {
    if (this.state.isPinned) return
    this.cancelClose()
    this.closeTimeout = setTimeout(() => {
      this.closeTimeout = null
      // Only close if we're still not hovered after the timeout and still visible
      if (!this.state.isHovered && this.props.isVisible && !this.state.isPinned) {
        this.props.onPopupClose(this.props.annotationId)
      }
    }, 500)
  }

  handleMouseEnter = () => {
    const portalRoot = this.props.getPortalRoot?.()
    if (this.containerRef.current && portalRoot) {
      const rect = this.containerRef.current.getBoundingClientRect()
      const containerRect = portalRoot.getBoundingClientRect()

      // Cancel any pending close
      this.cancelClose()

      this.setState(prevState => {
        const shouldPreservePosition = prevState.isPinned && prevState.popupPosition
        return {
          popupPosition: shouldPreservePosition
            ? prevState.popupPosition
            : {
                top: rect.bottom - containerRect.top + 8,
                left: rect.left - containerRect.left
              },
          isHovered: true,
          isPinned: shouldPreservePosition ? true : false
        }
      })

      this.props.onPopupOpen()
    }
  }

  handleMouseLeave = () => {
    if (this.state.isPinned) return
    this.setState({ isHovered: false })
    // Schedule close after 500ms if we're no longer hovered
    this.scheduleClose()
  }

  handlePopupMouseEnter = () => {
    // Cancel close when mouse enters popup
    this.cancelClose()
    this.setState({ isHovered: true })
    this.props.onPopupOpen()
  }

  handlePopupMouseLeave = () => {
    if (this.state.isPinned) return
    this.setState({ isHovered: false })
    // Schedule close after 2000ms if we're no longer hovered
    this.scheduleClose()
  }

  handleCloseClick = () => {
    this.setState({ isPinned: false })
    this.props.onPopupClose(this.props.annotationId)
  }

  private removeDragListeners() {
    window.removeEventListener('mousemove', this.handleDragMove)
    window.removeEventListener('mouseup', this.handleDragEnd)
  }

  handleDragStart = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    if (!this.state.popupPosition) return
    const portalRoot = this.props.getPortalRoot?.()
    if (!portalRoot) return
    const containerRect = portalRoot.getBoundingClientRect()
    const offsetX = event.clientX - (containerRect.left + this.state.popupPosition.left)
    const offsetY = event.clientY - (containerRect.top + this.state.popupPosition.top)

    this.setState({
      isDragging: true,
      dragOffset: { x: offsetX, y: offsetY },
      isPinned: true
    })
    window.addEventListener('mousemove', this.handleDragMove)
    window.addEventListener('mouseup', this.handleDragEnd)
  }

  handleDragMove = (event: MouseEvent) => {
    const { dragOffset } = this.state
    if (!dragOffset) return
    const portalRoot = this.props.getPortalRoot?.()
    if (!portalRoot) return
    const containerRect = portalRoot.getBoundingClientRect()
    this.setState({
      popupPosition: {
        top: event.clientY - containerRect.top - dragOffset.y,
        left: event.clientX - containerRect.left - dragOffset.x
      }
    })
  }

  handleDragEnd = () => {
    this.removeDragListeners()
    this.setState({
      isDragging: false,
      dragOffset: null
    })
  }

  render() {
    const { textSpan, annotations, isVisible: isVisible } = this.props
    const { popupPosition, isPinned, isDragging } = this.state
    const portalRoot = this.props.getPortalRoot?.() || null
    // Show popup if hovered and we have position
    const shouldShowPopup = (isVisible || isPinned) && popupPosition !== null && portalRoot

    return (
      <>
        <span
          ref={this.containerRef}
          className="annotation-span-wrapper"
          onMouseEnter={this.handleMouseEnter}
          onMouseLeave={this.handleMouseLeave}
          onMouseDown={this.props.onRequestFocus}
        >
          <RoughNotation
            type="box"
            color="rgba(100, 100, 100, 0.55)"
            strokeWidth={2}
            show={true}
          >
            {textSpan}
          </RoughNotation>
        </span>
        {shouldShowPopup &&
          createPortal(
            <div
              ref={this.popupRef}
              className={`annotation-popup ${isVisible ? 'visible' : ''} ${isPinned ? 'pinned' : ''} ${isDragging ? 'dragging' : ''}`}
              style={{
                top: `${popupPosition.top}px`,
                left: `${popupPosition.left}px`
              }}
              onMouseEnter={this.handlePopupMouseEnter}
              onMouseLeave={this.handlePopupMouseLeave}
            >
              <div
                className="annotation-popup-header"
                onMouseDown={this.handleDragStart}
              >
                <span className="annotation-popup-label">Annotations</span>
                <div className="annotation-popup-actions">
                  <button
                    className={`annotation-popup-pin ${isPinned ? 'active' : ''}`}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation()
                      this.setState(prev => ({ isPinned: !prev.isPinned }))
                    }}
                    aria-label={isPinned ? 'Unpin annotations' : 'Pin annotations'}
                  >
                    <svg
                      className="annotation-popup-pin-icon"
                      viewBox="0 0 24 24"
                      role="presentation"
                      focusable="false"
                    >
                      <path d="M8 3h8l-.4 5.5H19v2h-6.5V21h-1V10.5H5v-2h3.4z" />
                    </svg>
                  </button>
                  <button
                    className="annotation-popup-close"
                    onClick={this.handleCloseClick}
                    onMouseDown={(e) => e.stopPropagation()}
                    aria-label="Close annotations"
                  >
                    ×
                  </button>
                </div>
              </div>
              <div className="annotation-popup-body">
                {annotations.map((ann, index) => (
                  <div key={index} className="annotation-item">
                    {ann.title && (
                      <div className="annotation-title">{ann.title}</div>
                    )}
                    {ann.author && (
                      <div className="annotation-author">{ann.author}</div>
                    )}
                    {ann.domain && (
                      <div className="annotation-domain">{ann.domain}</div>
                    )}
                    {ann.description && (
                      <div className="annotation-description">{ann.description}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>,
            portalRoot
          )}
      </>
    )
  }
}

export default AnnotationComponent
