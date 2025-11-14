import React from 'react'
import { Block } from '@blocknote/core'
import { createReactBlockSpec } from '@blocknote/react'
import { Annotation } from './types'

interface AnnotationBlockProps {
  block: Block
  onUpdateBlock: (blockId: string, updates: { props: any }) => void
  onFetchMore?: (
    annotationBlockId: string,
    sourceBlockId: string,
    currentAnnotations: Annotation[]
  ) => void | Promise<void>
}

const AnnotationBlock: React.FC<AnnotationBlockProps> = ({ block, onUpdateBlock, onFetchMore }) => {
  const sourceBlockId = (block.props as any)?.sourceBlockId || ''
  const annotations: Annotation[] = JSON.parse((block.props as any)?.annotationsJson || '[]')
  const isExpanded = (block.props as any)?.isExpanded || false
  const isFetching = (block.props as any)?.isFetching || false

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
    if (!onFetchMore || !sourceBlockId || isFetching) return

    onUpdateBlock(block.id, {
      props: {
        ...block.props,
        isFetching: true,
      },
    })

    try {
      await onFetchMore(block.id, sourceBlockId, annotations)
    } catch (error) {
      console.error('Error fetching more annotations:', error)
      // Reset isFetching on error
      onUpdateBlock(block.id, {
        props: {
          ...block.props,
          isFetching: false,
        },
      })
    }
    // Note: isFetching is set to false in appendToAnnotationBlock on success
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
                  className="delete-btn"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDelete(index)
                  }}
                  title="Delete annotation"
                >
                  ×
                </button>

                {/* Annotation content */}
                {annotation.title && (
                  <div className="annotation-block-source">
                    {annotation.title}
                    {annotation.author && `, ${annotation.author}`}
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

// No longer needed - methods are accessed via editor instance

// Export the BlockNote schema spec (defined at module level)
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
      // Access editor methods directly from the editor instance
      const handleAnalysisForAnnotationMore = (props.editor as any).handleAnalysisForAnnotationMore
      return (
        <AnnotationBlock
          block={props.block as any}
          onUpdateBlock={(blockId, updates) => props.editor.updateBlock(blockId, updates)}
          onFetchMore={handleAnalysisForAnnotationMore}
        />
      )
    },
  }
)

// Annotation block utilities
export const annotationBlockUtils = {
  /**
   * Checks if a block is empty (paragraph with no text content)
   */
  isEmpty(block: any): boolean {
    if (!block || block.type !== 'paragraph') return false
    const inlines = block.content || []
    const text = inlines.map((n: any) => (n.text || '')).join('')
    return text.trim() === ''
  },

  /**
   * Detects double line break (empty paragraph between two non-empty paragraphs)
   * and triggers analysis on the paragraph before the empty one
   */
  detectAnnotation(
    changes: any[],
    editorInstance: any,
    onAnalysis: (blockId: string) => void
  ): void {
    for (const ch of changes) {
      if (ch.type !== 'insert') continue
      const inserted = ch.block
      if (!inserted || inserted.type !== 'paragraph') continue
      const docArr = editorInstance.document
      const idx = docArr.findIndex((b: any) => b.id === inserted.id)
      if (idx < 2) continue
      const prev = docArr[idx - 1]
      const prevPrev = docArr[idx - 2]
      const isPrevEmpty = annotationBlockUtils.isEmpty(prev)
      const isPrevPrevNonEmpty = prevPrev?.type === 'paragraph' && !annotationBlockUtils.isEmpty(prevPrev)
      if (isPrevEmpty && isPrevPrevNonEmpty) {
        onAnalysis(prevPrev.id)
      }
    }
  },
}

export default AnnotationBlock
