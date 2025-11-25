import { Component, createRef, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { RoughNotation } from 'react-rough-notation'

export interface AnnotationPopupProps {
  textSpan: string
  notationType: 'box' | 'underline'
  notationColor: string
  isVisible: boolean
  popupLabel: string
  onPopupOpen: () => void
  onPopupClose: () => void
  getPortalRoot?: () => HTMLElement | null
  onRequestFocus?: () => void
  children: ReactNode
}

export interface AnnotationPopupState {
  popupPosition: { top: number; left: number } | null
  isHovered: boolean
  isPinned: boolean
  isDragging: boolean
  dragOffset: { x: number; y: number } | null
}

export class AnnotationPopup extends Component<AnnotationPopupProps, AnnotationPopupState> {
  protected containerRef = createRef<HTMLSpanElement>()
  protected popupRef = createRef<HTMLDivElement>()
  protected closeTimeout: NodeJS.Timeout | null = null

  constructor(props: AnnotationPopupProps) {
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

  protected handleMouseEnter = () => {
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

  protected handleMouseLeave = () => {
    if (this.state.isPinned) return
    this.setState({ isHovered: false })
    // Schedule close after 500ms if we're no longer hovered
    this.scheduleClose()
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
    if (!portalRoot || !this.popupRef.current) return

    const popupRect = this.popupRef.current.getBoundingClientRect()
    const containerRect = portalRoot.getBoundingClientRect()

    const startX = e.clientX - containerRect.left
    const startY = e.clientY - containerRect.top

    const offsetX = startX - (this.state.popupPosition?.left || popupRect.left - containerRect.left)
    const offsetY = startY - (this.state.popupPosition?.top || popupRect.top - containerRect.top)

    this.setState({
      isDragging: true,
      dragOffset: { x: offsetX, y: offsetY },
      isPinned: true
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
      popupPosition: {
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
    const { textSpan, notationType, notationColor, isVisible, popupLabel, children, onRequestFocus } = this.props
    const { popupPosition, isPinned, isDragging } = this.state
    const portalRoot = this.props.getPortalRoot?.() || null
    const shouldShowPopup = (isVisible || isPinned) && popupPosition !== null && portalRoot

    return (
      <>
        <span
          ref={this.containerRef}
          className="annotation-span-wrapper"
          onMouseEnter={this.handleMouseEnter}
          onMouseLeave={this.handleMouseLeave}
          onMouseDown={onRequestFocus}
        >
          <RoughNotation
            type={notationType}
            color={notationColor}
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
