import { Component, createRef } from 'react'
import { RoughNotation } from 'react-rough-notation'
import { AnnotationType } from './types'

interface AnnotationProps {
  textSpan: string
  annotations: AnnotationType[]
  isVisible: boolean
  onPopupOpen: () => void
  onPopupClose: () => void
}

interface AnnotationState {
  popupPosition: { top: number; left: number } | null
  isHovered: boolean
}

class AnnotationComponent extends Component<AnnotationProps, AnnotationState> {
  private containerRef = createRef<HTMLDivElement>()
  private closeTimeout: NodeJS.Timeout | null = null

  constructor(props: AnnotationProps) {
    super(props)
    this.state = {
      popupPosition: null,
      isHovered: false
    }
  }
  componentWillUnmount() {
    this.cancelClose()
  }

  private cancelClose = () => {
    if (this.closeTimeout) {
      clearTimeout(this.closeTimeout)
      this.closeTimeout = null
    }
  }

  private scheduleClose = () => {
    this.cancelClose()
    this.closeTimeout = setTimeout(() => {
      this.closeTimeout = null
      // Only close if we're still not hovered after the timeout
      if (!this.state.isHovered) {
        this.props.onPopupClose()
      }
    }, 500)
  }

  handleMouseEnter = () => {
    if (this.containerRef.current) {
      const rect = this.containerRef.current.getBoundingClientRect()
      const container = this.containerRef.current.closest('.editor-content')
      const containerRect = container?.getBoundingClientRect() || { top: 0, left: 0 }

      // Cancel any pending close
      this.cancelClose()

      this.setState({
        popupPosition: {
          top: rect.bottom - containerRect.top + 8,
          left: rect.left - containerRect.left
        },
        isHovered: true
      })

      this.props.onPopupOpen()
    }
  }

  handleMouseLeave = () => {
    this.setState({ isHovered: false })
    // Schedule close after 2000ms if we're no longer hovered
    this.scheduleClose()
  }

  handlePopupMouseEnter = () => {
    // Cancel close when mouse enters popup
    this.cancelClose()
    this.setState({ isHovered: true })
    this.props.onPopupOpen()
  }

  handlePopupMouseLeave = () => {
    this.setState({ isHovered: false })
    // Schedule close after 2000ms if we're no longer hovered
    this.scheduleClose()
  }

  render() {
    const { textSpan, annotations, isVisible: isVisible } = this.props
    const { popupPosition } = this.state
    // Show popup if hovered and we have position
    const shouldShowPopup = isVisible && popupPosition !== null

    return (
      <>
        <span
          ref={this.containerRef}
          className="annotation-span-wrapper"
          onMouseEnter={this.handleMouseEnter}
          onMouseLeave={this.handleMouseLeave}
        >
          <RoughNotation
            type="highlight"
            color="#333"
            strokeWidth={2}
            show={true}
          >
            {textSpan}
          </RoughNotation>
        </span>
        {shouldShowPopup && (
          <div
            className={`annotation-popup ${isVisible ? 'visible' : ''}`}
            style={{
              position: 'absolute',
              top: `${popupPosition.top}px`,
              left: `${popupPosition.left}px`
            }}
            onMouseEnter={this.handlePopupMouseEnter}
            onMouseLeave={this.handlePopupMouseLeave}
          >
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
        )}
      </>
    )
  }
}

export default AnnotationComponent

