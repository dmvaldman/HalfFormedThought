import React from 'react'
import { Block } from '@blocknote/core'
import { createReactBlockSpec } from '@blocknote/react'

interface ListBlockProps {
  block: Block
  onUpdateBlock: (blockId: string, updates: { props: any }) => void
  onGenerateMore?: (
    listBlockId: string,
    sourceListId: string,
    currentItems: string[]
  ) => void | Promise<void>
}

const ListBlock: React.FC<ListBlockProps> = ({ block, onUpdateBlock, onGenerateMore }) => {
  const sourceListId = (block.props as any)?.sourceListId || ''
  const items: string[] = JSON.parse((block.props as any)?.itemsJson || '[]')
  const isExpanded = (block.props as any)?.isExpanded || false
  const isGenerating = (block.props as any)?.isGenerating || false

  const toggleExpand = () => {
    onUpdateBlock(block.id, {
      props: {
        ...block.props,
        isExpanded: !isExpanded,
      },
    })
  }

  const handleGenerateMore = async () => {
    if (!onGenerateMore || !sourceListId || isGenerating) return

    onUpdateBlock(block.id, {
      props: {
        ...block.props,
        isGenerating: true,
      },
    })

    try {
      await onGenerateMore(block.id, sourceListId, items)
    } catch (error) {
      console.error('Error generating more list items:', error)
      onUpdateBlock(block.id, {
        props: {
          ...block.props,
          isGenerating: false,
        },
      })
    }
  }

  if (items.length === 0) {
    return null
  }

  return (
    <div className="list-block">
      {/* Collapsed header */}
      <div className="list-block-header" onClick={toggleExpand}>
        <span className="list-block-header-text">
          {items.length} generated item{items.length !== 1 ? 's' : ''}
        </span>
        <span className="list-block-header-text">
          {isExpanded ? '▼' : '▶'}
        </span>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="list-block-content">
          <ul className="list-block-items">
            {items.map((item, index) => (
              <li key={index} className="list-block-item">
                {item}
              </li>
            ))}
          </ul>

          {/* Generate more button */}
          {sourceListId && (
            <button
              className="list-block-generate-more"
              onClick={handleGenerateMore}
              disabled={isGenerating}
              title="Generate more items"
            >
              {isGenerating ? '...' : '+'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// Module-level variable to store the callback
let _onGenerateMoreCallback: ((
  listBlockId: string,
  sourceListId: string,
  currentItems: string[]
) => void | Promise<void>) | undefined

// Function to set the callback before creating the editor
export function setListCallback(
  callback: (
    listBlockId: string,
    sourceListId: string,
    currentItems: string[]
  ) => void | Promise<void>
) {
  _onGenerateMoreCallback = callback
}

// Export the BlockNote schema spec (defined at module level)
export const listBlockSpec = createReactBlockSpec(
  {
    type: 'listBlock',
    propSchema: {
      itemsJson: {
        default: '[]',
      },
      sourceListId: {
        default: '',
      },
      isExpanded: {
        default: false,
      },
      isGenerating: {
        default: false,
      },
    },
    content: 'none',
  },
  {
    render: (props) => {
      return (
        <ListBlock
          block={props.block as any}
          onUpdateBlock={(blockId, updates) => props.editor.updateBlock(blockId, updates)}
          onGenerateMore={_onGenerateMoreCallback}
        />
      )
    },
  }
)

export default ListBlock

