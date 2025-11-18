import { Component, createRef } from 'react'
import { RoughNotation } from 'react-rough-notation'
import { AnnotationType } from './types'

interface AnnotationProps {
  textSpan: string
  annotations: AnnotationType[]
  content: string
}

interface AnnotationState {
  isHovered: boolean
  popupPosition: { top: number; left: number } | null
  isVisible: boolean
}

class AnnotationComponent extends Component<AnnotationProps, AnnotationState> {
  private containerRef = createRef<HTMLSpanElement>()
  private popupRef = createRef<HTMLDivElement>()
  private closeTimeout: NodeJS.Timeout | null = null

  constructor(props: AnnotationProps) {
    super(props)
    this.state = {
      isHovered: false,
      popupPosition: null,
      isVisible: false
    }
  }

  componentDidMount() {
    // Add document-level mouse move listener to detect when mouse enters popup
    document.addEventListener('mousemove', this.handleDocumentMouseMove)
  }

  componentWillUnmount() {
    document.removeEventListener('mousemove', this.handleDocumentMouseMove)
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
      this.setState({ isHovered: false, isVisible: false })
      this.closeTimeout = null
    }, 1000)
  }

  handleDocumentMouseMove = (e: MouseEvent) => {
    // Check if mouse is over the popup
    if (this.popupRef.current && this.state.isHovered) {
      const popupRect = this.popupRef.current.getBoundingClientRect()
      const mouseX = e.clientX
      const mouseY = e.clientY

      if (
        mouseX >= popupRect.left &&
        mouseX <= popupRect.right &&
        mouseY >= popupRect.top &&
        mouseY <= popupRect.bottom
      ) {
        // Mouse is over popup, cancel the close and ensure it's visible
        this.cancelClose()
        if (!this.state.isVisible) {
          this.setState({ isVisible: true })
        }
      }
    }
  }

  handleMouseEnter = () => {
    if (this.containerRef.current) {
      const rect = this.containerRef.current.getBoundingClientRect()
      const overlay = this.containerRef.current.closest('.annotations-overlay')
      const overlayRect = overlay?.getBoundingClientRect() || { top: 0, left: 0 }

      // Cancel any pending close
      this.cancelClose()

      this.setState({
        isHovered: true,
        isVisible: true,
        popupPosition: {
          top: rect.bottom - overlayRect.top + 8,
          left: rect.left - overlayRect.left
        }
      })
    }
  }

  handleMouseLeave = () => {
    // Schedule close after 1 second
    this.scheduleClose()
  }

  handlePopupMouseEnter = () => {
    // Cancel close when mouse enters popup
    this.cancelClose()
    this.setState({ isVisible: true })
  }

  handlePopupMouseLeave = () => {
    // Schedule close when mouse leaves popup
    this.scheduleClose()
  }

  render() {
    const { textSpan, annotations } = this.props
    const { isHovered, popupPosition, isVisible } = this.state

    return (
      <>
        <span
          ref={this.containerRef}
          className="annotation-container"
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
        {isHovered && popupPosition && (
          <div
            ref={this.popupRef}
            className={`annotation-popup ${isVisible ? 'visible' : ''}`}
            style={{
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

