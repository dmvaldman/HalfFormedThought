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
      await onMoreClick(block.id)
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

// Module-level variable to store the callback
let _onMoreClickCallback: ((blockId: string) => void | Promise<void>) | undefined

// Function to set the callback before creating the editor
export function setMoreButtonCallback(
  callback: (blockId: string) => void | Promise<void>
) {
  _onMoreClickCallback = callback
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
      return (
        <MoreButtonBlock
          block={props.block as any}
          onMoreClick={_onMoreClickCallback}
        />
      )
    },
  }
)

export default MoreButtonBlock

