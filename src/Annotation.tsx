import { Component, createRef } from 'react'
import { RoughNotation } from 'react-rough-notation'
import { AnnotationType } from './types'

interface AnnotationProps {
  textSpan: string
  annotations: AnnotationType[]
}

interface AnnotationState {
  popupPosition: { top: number; left: number } | null
  isVisible: boolean
}

class AnnotationComponent extends Component<AnnotationProps, AnnotationState> {
  private containerRef = createRef<HTMLDivElement>()
  private popupRef = createRef<HTMLDivElement>()
  private closeTimeout: NodeJS.Timeout | null = null

  constructor(props: AnnotationProps) {
    super(props)
    this.state = {
      popupPosition: null,
      isVisible: false
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
      this.setState({ isVisible: false })
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
        isVisible: true,
        popupPosition: {
          top: rect.bottom - containerRect.top + 8,
          left: rect.left - containerRect.left
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
    // Schedule close immediately when mouse leaves popup
    this.cancelClose()
    this.setState({ isVisible: false })
  }

  render() {
    const { textSpan, annotations } = this.props
    const { popupPosition, isVisible } = this.state
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
            ref={this.popupRef}
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

