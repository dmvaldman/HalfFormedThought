import React, { useContext } from 'react'
import { Block } from '@blocknote/core'
import { createReactBlockSpec } from '@blocknote/react'
import { Annotation } from './types'
import { BlockNoteContext } from './BlockNoteWrapper'

interface AnnotationBlockProps {
  block: Block
  onUpdateBlock: (blockId: string, updates: { props: any }) => void
}

const AnnotationBlock: React.FC<AnnotationBlockProps> = ({ block, onUpdateBlock }) => {
  const sourceBlockId = (block.props as any)?.sourceBlockId || ''
  const annotations: Annotation[] = JSON.parse((block.props as any)?.annotationsJson || '[]')
  const isExpanded = (block.props as any)?.isExpanded || false
  const isFetching = (block.props as any)?.isFetching || false

  const { onFetchMoreAnnotations } = useContext(BlockNoteContext)

  const handleDelete = (index: number) => {
    const updatedAnnotations = annotations.filter((_, i) => i !== index)
    onUpdateBlock(block.id, {
      props: {
        ...block.props,
        annotationsJson: JSON.stringify(updatedAnnotations),
      },
    })
  }

  const toggleExpand = () => {
    onUpdateBlock(block.id, {
      props: {
        ...block.props,
        isExpanded: !isExpanded,
      },
    })
  }

  const handleFetchMore = async () => {
    if (!onFetchMoreAnnotations || !sourceBlockId || isFetching) return

    onUpdateBlock(block.id, {
      props: {
        ...block.props,
        isFetching: true,
      },
    })

    try {
      await onFetchMoreAnnotations(block.id, sourceBlockId, annotations)
    } catch (error) {
      console.error('Error fetching more annotations:', error)
    } finally {
      onUpdateBlock(block.id, {
        props: {
          ...block.props,
          isFetching: false,
        },
      })
    }
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

            {/* Fetch more button */}
            {sourceBlockId && (
              <button
                className="annotation-block-fetch-more"
                onClick={handleFetchMore}
                disabled={isFetching}
                title="Fetch more annotations"
              >
                {isFetching ? '...' : '>'}
              </button>
            )}
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
      sourceBlockId: {
        default: '',
      },
      isExpanded: {
        default: false,
      },
      isFetching: {
        default: false,
      },
    },
    content: 'none',
  },
  {
    render: (props) => {
      return (
        <AnnotationBlock
          block={props.block as any}
          onUpdateBlock={(blockId, updates) => props.editor.updateBlock(blockId, updates)}
        />
      )
    },
  }
)

export default AnnotationBlock
