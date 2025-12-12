import { Component, createRef, ReactNode } from 'react'

export interface AnnotationPopupProps {
  annotationId: string
  isVisible: boolean
  popupLabel: string
  position: { top: number; left: number } | null // Position passed from TipTap
  onPopupOpen: () => void
  onPopupClose: () => void
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
    const target = e.target as Element

    // Check if click is inside popup
    if (popupElement && popupElement.contains(target)) {
      return // Click is inside popup
    }

    // Check if click is on a mark (has data-annotation-id attribute)
    // TipTap will handle mark clicks separately, so we don't want to close here
    const markElement = target.closest('span[data-annotation-id]')
    if (markElement) {
      return // Click is on a mark - TipTap will handle it
    }

    // Check if click is on an SVG path (connection line)
    // ConnectionAnnotation will handle these clicks
    if (target.tagName === 'path' || target.closest('svg')) {
      return // Click is on SVG - ConnectionAnnotation will handle it
    }

    // Click is outside popup and not on a mark - close the popup
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
    // Clear pinned state when closing
    this.setState({ isPinned: false })
    this.props.onPopupClose()
  }

  protected handleDragStart = (e: React.MouseEvent) => {
    if (e.button !== 0) return // Only handle left mouse button
    e.preventDefault()

    if (!this.popupRef.current || !this.props.position) return

    const popupRect = this.popupRef.current.getBoundingClientRect()
    // Find the annotation layer container (parent of the popup)
    const container = this.popupRef.current.closest('.annotation-layer')
    if (!container) return
    const containerRect = (container as HTMLElement).getBoundingClientRect()

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
    if (!this.state.isDragging || !this.state.dragOffset || !this.popupRef.current) return

    // Find the annotation layer container (parent of the popup)
    const container = this.popupRef.current.closest('.annotation-layer')
    if (!container) return
    const containerRect = (container as HTMLElement).getBoundingClientRect()
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

    // Use dragged position if available, otherwise use prop position
    const popupPosition = draggedPosition || position
    const shouldShowPopup = (isVisible || isPinned) && popupPosition !== null

    if (!shouldShowPopup) {
      return null
    }

    return (
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
                viewBox="0 0 384 512"
                role="presentation"
                focusable="false"
              >
                {isPinned ? (
                  // Pinned: filled path
                  <path d="M298.028 214.267L285.793 96H328c13.255 0 24-10.745 24-24V24c0-13.255-10.745-24-24-24H56C42.745 0 32 10.745 32 24v48c0 13.255 10.745 24 24 24h42.207L85.972 214.267C37.465 236.82 0 277.261 0 328c0 13.255 10.745 24 24 24h136v104.007c0 1.242.289 2.467.845 3.578l24 48c2.941 5.882 11.364 5.893 14.311 0l24-48a8.008 8.008 0 0 0 .845-3.578V352h136c13.255 0 24-10.745 24-24-.001-51.183-37.983-91.42-85.973-113.733z" />
                ) : (
                  // Unpinned: stroked path
                  <path d="M306.5 186.6l-5.7-42.6H328c13.2 0 24-10.8 24-24V24c0-13.2-10.8-24-24-24H56C42.8 0 32 10.8 32 24v96c0 13.2 10.8 24 24 24h27.2l-5.7 42.6C29.6 219.4 0 270.7 0 328c0 13.2 10.8 24 24 24h144v104c0 .9.1 1.7.4 2.5l16 48c2.4 7.3 12.8 7.3 15.2 0l16-48c.3-.8.4-1.7.4-2.5V352h144c13.2 0 24-10.8 24-24 0-57.3-29.6-108.6-77.5-141.4zM50.5 304c8.3-38.5 35.6-70 71.5-87.8L138 96H80V48h224v48h-58l16 120.2c35.8 17.8 63.2 49.4 71.5 87.8z" />
                )}
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
      </div>
    )
  }
}
