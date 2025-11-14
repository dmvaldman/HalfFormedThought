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
   * Appends new list items to a toggle block, keeping the moreButton as the last child
   */
  appendItems(editor: BlockNoteEditor, toggleBlockId: string, newItems: string[]): void {
    if (!editor || newItems.length === 0) return

    const doc = editor.document as BaseBlock[]
    const toggleBlock = doc.find((b) => b.id === toggleBlockId && b.type === 'toggle')
    if (!toggleBlock) return

    const existingChildren = Array.isArray(toggleBlock.children) ? toggleBlock.children : []
    const appendedChildren = newItems.map((text) => ({
      type: 'bulletListItem',
      content: text,
    }))

    // Check if the last child is a moreButton - if so, insert before it to keep it last
    const lastChild = existingChildren[existingChildren.length - 1]
    const hasMoreButton = lastChild && lastChild.type === 'moreButton'

    const updatedChildren = hasMoreButton
      ? [...existingChildren.slice(0, -1), ...appendedChildren, lastChild]
      : [...existingChildren, ...appendedChildren]

    editor.updateBlock(toggleBlock.id, {
      children: updatedChildren as any,
    })
  },

  /**
   * Extracts text from toggle block's children (excluding moreButton blocks)
   */
  getListText(toggleBlock: BaseBlock, getText: (block: BaseBlock) => string): string {
    if (!toggleBlock || toggleBlock.type !== 'toggle') {
      return ''
    }

    const children = Array.isArray(toggleBlock.children) ? toggleBlock.children : []
    // Filter out moreButton blocks - they're not actual list items
    return children
      .filter((child) => child.type !== 'moreButton')
      .map((child) => {
        // Handle both string content and array content formats
        if (typeof child.content === 'string') {
          return child.content
        }
        return getText(child)
      })
      .filter(Boolean)
      .join('\n')
  },

  /**
   * Creates a toggle block structure with list items and a moreButton
   */
  createToggleBlock(items: string[], toggleBlockId?: string) {
    return {
      type: 'toggle',
      props: {
        textContent: 'More examples',
      },
      children: [
        ...items.map((text) => ({
          type: 'bulletListItem',
          content: text,
        })),
        {
          type: 'moreButton',
          props: toggleBlockId ? { toggleBlockId } : {},
        },
      ],
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

