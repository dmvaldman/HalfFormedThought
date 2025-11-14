import { createReactBlockSpec, ToggleWrapper } from '@blocknote/react'
import { BlockNoteEditor } from '@blocknote/core'
import { BaseBlock } from './types'

// Custom toggle block that matches the docs pattern
export const toggleBlockSpec = createReactBlockSpec(
  {
    type: 'toggle',
    propSchema: {
      textContent: {
        default: 'More examples',
      },
    },
    content: 'none',
  },
  {
    render: (props) => (
      <ToggleWrapper block={props.block} editor={props.editor}>
        <span>{(props.block.props as any).textContent}</span>
      </ToggleWrapper>
    ),
  }
)

// Toggle block utilities
export const toggleBlockUtils = {
  /**
   * Recursively deletes all children of a toggle block
   */
  deleteChildren(editor: BlockNoteEditor, toggleBlock: BaseBlock): void {
    if (!Array.isArray(toggleBlock.children) || toggleBlock.children.length === 0) {
      return
    }

    // Recursively collect all child blocks
    const collectChildBlocks = (block: BaseBlock): BaseBlock[] => {
      const childBlocks: BaseBlock[] = []
      if (Array.isArray(block.children)) {
        for (const child of block.children) {
          childBlocks.push(child)
          // Recursively collect nested children
          if (Array.isArray(child.children)) {
            childBlocks.push(...collectChildBlocks(child))
          }
        }
      }
      return childBlocks
    }

    const blocksToDelete = collectChildBlocks(toggleBlock)

    if (blocksToDelete.length > 0) {
      editor.removeBlocks(blocksToDelete)
    }
  },


  /**
   * Detects when a toggle block is converted to a paragraph and deletes its children
   */
  detectToggleDeletion(
    changes: any[],
    editor: BlockNoteEditor,
    onDelete?: (updatedBlock: BaseBlock) => void
  ): void {
    for (const ch of changes) {
      // Handle update case: when a toggle block is converted to a paragraph
      if (ch.type === 'update' && ch.block) {
        const updatedBlock = ch.block as BaseBlock
        const prevBlock = ch.prevBlock as BaseBlock

        // If a toggle block is being converted to a paragraph, delete its children
        if (prevBlock && prevBlock.type === 'toggle' && updatedBlock.type === 'paragraph') {
          if (Array.isArray(prevBlock.children) && prevBlock.children.length > 0) {
            toggleBlockUtils.deleteChildren(editor, prevBlock)
            // Optionally delete the updated block itself
            if (onDelete) {
              onDelete(updatedBlock)
            }
          }
        }
      }
    }
  },
}

