import React from 'react'
import { Block } from '@blocknote/core'
import { createReactBlockSpec } from '@blocknote/react'

interface MoreButtonBlockProps {
  block: Block
  onMoreClick?: (blockId: string) => void | Promise<void>
}

const MoreButtonBlock: React.FC<MoreButtonBlockProps> = ({ block, onMoreClick }) => {
  const handleClick = async () => {
    if (onMoreClick) {
      // Get toggleBlockId from block props (set when the moreButton is created)
      const toggleBlockId = (block.props as any)?.toggleBlockId || ''
      await onMoreClick(toggleBlockId)
    }
  }

  return (
    <div className="more-button-block">
      <button
        className="more-button"
        onClick={handleClick}
        type="button"
      >
        More
      </button>
    </div>
  )
}

// Export the BlockNote schema spec
export const moreButtonBlockSpec = createReactBlockSpec(
  {
    type: 'moreButton',
    propSchema: {},
    content: 'none',
  },
  {
    render: (props) => {
      // Access editor methods directly from the editor instance
      const handleAnalysisForListMore = (props.editor as any).handleAnalysisForListMore
      return (
        <MoreButtonBlock
          block={props.block as any}
          onMoreClick={handleAnalysisForListMore}
        />
      )
    },
  }
)

export default MoreButtonBlock

