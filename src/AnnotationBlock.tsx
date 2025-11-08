import React, { useState } from 'react'
import { Block } from '@blocknote/core'
import { createReactBlockSpec } from '@blocknote/react'
import { Annotation } from './types'

interface AnnotationBlockProps {
  block: Block
  editor: any
}

const AnnotationBlock: React.FC<AnnotationBlockProps> = ({ block, editor }) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const annotationsJson = (block.props as any)?.annotationsJson || '[]'
  const annotations: Annotation[] = JSON.parse(annotationsJson)

  const handleDelete = (index: number) => {
    const updatedAnnotations = annotations.filter((_, i) => i !== index)
    editor.updateBlock(block.id, {
      props: {
        ...block.props,
        annotationsJson: JSON.stringify(updatedAnnotations),
      },
    })
  }

  const toggleExpand = () => {
    setIsExpanded(!isExpanded)
  }

  if (annotations.length === 0) {
    return null
  }

  return (
    <div className="annotation-block">
      {/* Collapsed header */}
      <div className="annotation-block-header" onClick={toggleExpand}>
        <span className="annotation-block-header-text">
          {annotations.length} annotation{annotations.length !== 1 ? 's' : ''}
        </span>
        <span className="annotation-block-header-text">
          {isExpanded ? '▼' : '▶'}
        </span>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="annotation-block-content">
          <div className="annotation-block-list">
            {annotations.map((annotation, index) => (
              <div key={index} className="annotation-block-card">
                {/* Delete button */}
                <button
                  className="annotation-block-delete-btn"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDelete(index)
                  }}
                  title="Delete annotation"
                >
                  ×
                </button>

                {/* Annotation content */}
                {annotation.source && (
                  <div className="annotation-block-source">
                    {annotation.source}
                  </div>
                )}
                {annotation.domain && (
                  <div className="annotation-block-domain">
                    {annotation.domain}
                  </div>
                )}
                {annotation.description && (
                  <div className="annotation-block-description">
                    {annotation.description}
                  </div>
                )}
                {annotation.relevance && (
                  <div className="annotation-block-relevance">
                    {annotation.relevance}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Export the BlockNote schema spec
export const annotationBlockSpec = createReactBlockSpec(
  {
    type: 'annotation',
    propSchema: {
      annotationsJson: {
        default: '[]',
      },
    },
    content: 'none',
  },
  {
    render: (props) => {
      return <AnnotationBlock block={props.block as any} editor={props.editor} />
    },
  }
)

export default AnnotationBlock
