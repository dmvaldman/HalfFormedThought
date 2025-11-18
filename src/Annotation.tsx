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
}

class AnnotationComponent extends Component<AnnotationProps, AnnotationState> {
  private containerRef = createRef<HTMLSpanElement>()

  constructor(props: AnnotationProps) {
    super(props)
    this.state = {
      isHovered: false,
      popupPosition: null
    }
  }

  handleMouseEnter = () => {
    if (this.containerRef.current) {
      const rect = this.containerRef.current.getBoundingClientRect()
      const overlay = this.containerRef.current.closest('.annotations-overlay')
      const overlayRect = overlay?.getBoundingClientRect() || { top: 0, left: 0 }

      this.setState({
        isHovered: true,
        popupPosition: {
          top: rect.bottom - overlayRect.top + 8,
          left: rect.left - overlayRect.left
        }
      })
    }
  }

  handleMouseLeave = () => {
    this.setState({ isHovered: false, popupPosition: null })
  }

  render() {
    const { textSpan, annotations } = this.props
    const { isHovered, popupPosition } = this.state

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
            color="#ffd54f"
            strokeWidth={2}
            show={true}
          >
            {textSpan}
          </RoughNotation>
        </span>
        {isHovered && popupPosition && (
          <div
            className="annotation-popup"
            style={{
              top: `${popupPosition.top}px`,
              left: `${popupPosition.left}px`
            }}
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

