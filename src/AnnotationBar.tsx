import { Component } from 'react'
import { Annotation } from './types'

interface AnnotationBarProps {
  annotations: Annotation[]
  isExpanded: boolean
  onToggle: () => void
  onDeleteAnnotation: (annotationId: string) => void
  onDragStart?: (annotationId: string) => void
}

class AnnotationBar extends Component<AnnotationBarProps> {
  render() {
    const { annotations, isExpanded, onToggle, onDeleteAnnotation } = this.props

    if (annotations.length === 0) {
      return null
    }

    return (
      <div className="annotation-bar">
        <div
          className="annotation-line"
          onClick={(e) => {
            e.preventDefault()
            onToggle()
          }}
        >
          <div className="annotation-line-indicator">
            {isExpanded ? '▼' : '▶'} {annotations.length} annotation{annotations.length !== 1 ? 's' : ''}
          </div>
        </div>
        {isExpanded && (
          <div className="annotation-content">
            {annotations.map((annotation) => (
              <div key={annotation.id} className="annotation-item">
                <div className="annotation-markdown">{annotation.content}</div>
                <button
                  className="annotation-delete"
                  onClick={() => onDeleteAnnotation(annotation.id)}
                >
                  ×
                </button>
                <button
                  className="annotation-drag"
                  onDragStart={() => this.props.onDragStart?.(annotation.id)}
                >
                  ⋮⋮
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }
}

export default AnnotationBar

