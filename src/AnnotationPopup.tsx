import { Component, createRef, ReactNode } from 'react'
import { createPortal } from 'react-dom'

export interface AnnotationPopupProps {
  annotationId: string
  isVisible: boolean
  popupLabel: string
  position: { top: number; left: number } | null // Position passed from TipTap
  onPopupOpen: () => void
  onPopupClose: () => void
  getPortalRoot?: () => HTMLElement | null
  onRequestFocus?: () => void
  children: ReactNode
}

export interface AnnotationPopupState {
  isHovered: boolean
  isPinned: boolean
  isDragging: boolean
  dragOffset: { x: number; y: number } | null
  draggedPosition: { top: number; left: number } | null // Store dragged position separately
}

export class AnnotationPopup extends Component<AnnotationPopupProps, AnnotationPopupState> {
  protected popupRef = createRef<HTMLDivElement>()
  protected closeTimeout: NodeJS.Timeout | null = null

  constructor(props: AnnotationPopupProps) {
    super(props)
    this.state = {
      isHovered: false,
      isPinned: false,
      isDragging: false,
      dragOffset: { x: 0, y: 0 },
      draggedPosition: null
    }
  }

  componentDidMount() {
    // Add click outside listener when popup is visible
    if (this.props.isVisible) {
      document.addEventListener('click', this.handleClickOutside)
    }
  }

  componentDidUpdate(prevProps: AnnotationPopupProps) {
    // Add/remove click outside listener based on visibility
    if (this.props.isVisible && !prevProps.isVisible) {
      document.addEventListener('click', this.handleClickOutside)
    } else if (!this.props.isVisible && prevProps.isVisible) {
      document.removeEventListener('click', this.handleClickOutside)
    }
  }

  componentWillUnmount() {
    this.cancelClose()
    this.removeDragListeners()
    document.removeEventListener('click', this.handleClickOutside)
  }

  protected cancelClose = () => {
    if (this.closeTimeout) {
      clearTimeout(this.closeTimeout)
      this.closeTimeout = null
    }
  }

  protected scheduleClose = () => {
    if (this.state.isPinned) return
    this.cancelClose()
    this.closeTimeout = setTimeout(() => {
      this.closeTimeout = null
      // Only close if we're still not hovered after the timeout and still visible
      if (!this.state.isHovered && this.props.isVisible && !this.state.isPinned) {
        this.props.onPopupClose()
      }
    }, 500)
  }

  // Handle click outside to close popup
  protected handleClickOutside = (e: MouseEvent) => {
    if (this.state.isPinned) return

    const popupElement = this.popupRef.current
    const target = e.target as Node

    // Check if click is outside popup
    if (popupElement && popupElement.contains(target)) {
      return // Click is inside popup
    }

    // Check if click is in the editor (TipTap handles mark clicks)
    const portalRoot = this.props.getPortalRoot?.()
    if (portalRoot) {
      const editorElement = portalRoot.parentElement?.querySelector('.editor-content')
      if (editorElement && editorElement.contains(target)) {
        // Click is in the editor - TipTap will handle mark clicks
        return
      }
    }

    // Click is outside both popup and editor
    this.props.onPopupClose()
  }

  protected handlePopupMouseEnter = () => {
    // Cancel close when mouse enters popup
    this.cancelClose()
    this.setState({ isHovered: true })
  }

  protected handlePopupMouseLeave = () => {
    if (this.state.isPinned) return
    this.setState({ isHovered: false })
    this.scheduleClose()
  }

  protected handleCloseClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    this.props.onPopupClose()
  }

  protected handleDragStart = (e: React.MouseEvent) => {
    if (e.button !== 0) return // Only handle left mouse button
    e.preventDefault()

    const portalRoot = this.props.getPortalRoot?.()
    if (!portalRoot || !this.popupRef.current || !this.props.position) return

    const popupRect = this.popupRef.current.getBoundingClientRect()
    const containerRect = portalRoot.getBoundingClientRect()

    const startX = e.clientX - containerRect.left
    const startY = e.clientY - containerRect.top

    const currentPosition = this.state.draggedPosition || this.props.position
    const offsetX = startX - currentPosition.left
    const offsetY = startY - currentPosition.top

    this.setState({
      isDragging: true,
      dragOffset: { x: offsetX, y: offsetY },
      isPinned: true,
      draggedPosition: currentPosition
    })

    this.addDragListeners()
  }

  private addDragListeners = () => {
    document.addEventListener('mousemove', this.handleDragMove)
    document.addEventListener('mouseup', this.handleDragEnd)
  }

  private removeDragListeners = () => {
    document.removeEventListener('mousemove', this.handleDragMove)
    document.removeEventListener('mouseup', this.handleDragEnd)
  }

  private handleDragMove = (e: MouseEvent) => {
    if (!this.state.isDragging || !this.state.dragOffset) return

    const portalRoot = this.props.getPortalRoot?.()
    if (!portalRoot) return

    const containerRect = portalRoot.getBoundingClientRect()
    const newX = e.clientX - containerRect.left - this.state.dragOffset.x
    const newY = e.clientY - containerRect.top - this.state.dragOffset.y

    this.setState({
      draggedPosition: {
        left: Math.max(0, Math.min(newX, containerRect.width - 200)),
        top: Math.max(0, newY)
      }
    })
  }

  private handleDragEnd = () => {
    this.setState({ isDragging: false })
    this.removeDragListeners()
  }

  render() {
    const { isVisible, popupLabel, children, position } = this.props
    const { isPinned, isDragging, draggedPosition } = this.state
    const portalRoot = this.props.getPortalRoot?.() || null

    // Use dragged position if available, otherwise use prop position
    const popupPosition = draggedPosition || position
    const shouldShowPopup = (isVisible || isPinned) && popupPosition !== null && portalRoot

    return (
      <>
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
                <span className="annotation-popup-label">{popupLabel}</span>
                <div className="annotation-popup-actions">
                  <button
                    className={`annotation-popup-pin ${isPinned ? 'active' : ''}`}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation()
                      this.setState(prev => ({ isPinned: !prev.isPinned }))
                    }}
                    aria-label={isPinned ? `Unpin ${popupLabel}` : `Pin ${popupLabel}`}
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
                    aria-label={`Close ${popupLabel}`}
                  >
                    ×
                  </button>
                </div>
              </div>
              <div className="annotation-popup-body">
                {children}
              </div>
            </div>,
            portalRoot
          )}
      </>
    )
  }
}
