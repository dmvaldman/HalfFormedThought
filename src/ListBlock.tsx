import { BlockNoteEditor } from '@blocknote/core'
import { BaseBlock } from './types'
import { analyzeListItems } from './analyzer'

// Helper function to extract text from a block
const getText = (block: BaseBlock): string => {
  if (!block || !Array.isArray(block.content)) {
    return ''
  }
  return block.content
    .map((item: any) => {
      if (item.type === 'text' && item.text) {
        return item.text
      }
      return ''
    })
    .join('')
}

// List block utilities
export const listBlockUtils = {
  /**
   * Gets text from an array of list item blocks
   */
  getText(listItems: BaseBlock[]): string {
    return listItems
      .map((item) => {
        // Handle both string content and array content formats
        if (typeof item.content === 'string') {
          return item.content
        }
        return getText(item)
      })
      .filter(Boolean)
      .join('\n')
  },


  /**
   * Appends new list items after the given list item
   * Finds the parent block (could be toggle or any other container) and appends to its children
   */
  appendListItems(
    editor: BlockNoteEditor,
    listItemId: string,
    newItems: string[],
    findParentBlock: (blocks: BaseBlock[], targetId: string) => BaseBlock | null
  ): void {
    if (!editor || newItems.length === 0) return

    const doc = editor.document as BaseBlock[]

    // First check if it's a top-level block
    const topLevelItem = doc.find((b) => b.id === listItemId)
    if (topLevelItem && (topLevelItem.type === 'bulletListItem' || topLevelItem.type === 'numberedListItem')) {
      // It's a top-level list item, insert after it
      const newBlocks = newItems.map((text) => ({
        type: 'bulletListItem',
        content: text,
      }))
      editor.insertBlocks(newBlocks as any, listItemId, 'after')
      return
    }

    // Find parent block (could be toggle or any container)
    const parentBlock = findParentBlock(doc, listItemId)
    if (!parentBlock || !Array.isArray(parentBlock.children)) {
      return
    }

    // Find the list item in parent's children and find the last consecutive list item
    const children = parentBlock.children
    const itemIdx = children.findIndex((c) => c.id === listItemId)
    if (itemIdx === -1) return

    let lastListItemIdx = itemIdx
    const listItemType = children[itemIdx].type

    // Find the last consecutive list item (before moreButton if present)
    for (let i = itemIdx + 1; i < children.length; i++) {
      const child = children[i]
      if (child.type === listItemType) {
        lastListItemIdx = i
      } else {
        break
      }
    }

    // Create new list item blocks
    const appendedChildren = newItems.map((text) => ({
      type: 'bulletListItem',
      content: text,
    }))

    // Check if there's a moreButton after the last list item - insert before it
    const updatedChildren = [...children]
    const nextChild = updatedChildren[lastListItemIdx + 1]
    const hasMoreButton = nextChild && nextChild.type === 'moreButton'

    const insertIndex = hasMoreButton ? lastListItemIdx + 1 : lastListItemIdx + 1
    updatedChildren.splice(insertIndex, 0, ...(appendedChildren as any))

    editor.updateBlock(parentBlock.id, {
      children: updatedChildren as any,
    })
  },


  /**
   * Detects when an empty list item becomes a paragraph (list completion)
   */
  detectListCompletion(
    changes: any[],
    editorInstance: any,
    onListCompletion: (lastListItemId: string) => void
  ): void {
    for (const ch of changes) {
      // Handle update case: when an empty list item becomes a paragraph
      if (ch.type === 'update' && ch.block) {
        const updatedBlock = ch.block as BaseBlock
        const prevBlock = ch.prevBlock as BaseBlock

        if (prevBlock && prevBlock.type === 'toggle') {
          continue
        }

        // Check if the updated block is now a paragraph and was previously a list item
        if (
          updatedBlock.type === 'paragraph' &&
          prevBlock &&
          (prevBlock.type === 'bulletListItem' || prevBlock.type === 'numberedListItem')
        ) {
          const docArr = editorInstance.document as BaseBlock[]
          const idx = docArr.findIndex((b) => b.id === updatedBlock.id)
          if (idx < 1) continue

          const prev = docArr[idx - 1]

          // Check if previous block is a list item
          if (prev && (prev.type === 'bulletListItem' || prev.type === 'numberedListItem')) {
            // Only trigger list completion if there are NO list items or toggle blocks after the converted paragraph
            // This ensures we only analyze when exiting the END of a list, not the middle
            const next = idx + 1 < docArr.length ? docArr[idx + 1] : null
            const hasListOrToggleAfter =
              next &&
              (next.type === 'bulletListItem' ||
                next.type === 'numberedListItem' ||
                next.type === 'toggle')

            if (!hasListOrToggleAfter) {
              onListCompletion(prev.id)
            }
          }
        }
      }
    }
  },

  /**
   * Handles "more" button click - analyzes for more list items and appends them
   */
  async handleMore(
    editor: BlockNoteEditor,
    toggleBlockId: string,
    fullNoteText: string,
    findParentBlock: (blocks: BaseBlock[], targetId: string) => BaseBlock | null
  ): Promise<void> {
    if (!editor) return

    const doc = editor.document as BaseBlock[]
    const toggleBlock = doc.find((b) => b.id === toggleBlockId && b.type === 'toggle')

    if (!toggleBlock) return

    // Get the list text from the toggle block's children (excluding moreButton)
    const children = Array.isArray(toggleBlock.children) ? toggleBlock.children : []
    const listItems = children.filter((child) => child.type !== 'moreButton')
    const listText = listBlockUtils.getText(listItems)
    if (!listText) return

    // Analyze for more list items
    const newItems = await analyzeListItems(fullNoteText, listText)

    if (newItems.length > 0) {
      // Use the first list item ID from the toggle's children
      const firstListItem = listItems.find((child) => child.type === 'bulletListItem' || child.type === 'numberedListItem')
      if (firstListItem) {
        listBlockUtils.appendListItems(editor, firstListItem.id, newItems, findParentBlock)
      }
    }
  },

  /**
   * Handles list completion - analyzes for more list items and inserts a toggle block
   */
  async handleCompletion(
    editor: BlockNoteEditor,
    lastListItemId: string,
    fullNoteText: string,
    handleInsertList: (afterBlockId: string, items: string[]) => string | null
  ): Promise<void> {
    if (!editor) return

    const doc = editor.document as BaseBlock[]
    const listItem = doc.find((b) => b.id === lastListItemId)
    if (!listItem || (listItem.type !== 'bulletListItem' && listItem.type !== 'numberedListItem')) {
      return
    }

    // Find consecutive list items
    const listItems: BaseBlock[] = []
    const itemIdx = doc.findIndex((b) => b.id === lastListItemId)

    // Go backwards to find the start of the list
    for (let i = itemIdx; i >= 0; i--) {
      const block = doc[i]
      if (block.type === listItem.type) {
        listItems.unshift(block)
      } else {
        break
      }
    }

    // Go forwards to find the end of the list
    for (let i = itemIdx + 1; i < doc.length; i++) {
      const block = doc[i]
      if (block.type === listItem.type) {
        listItems.push(block)
      } else {
        break
      }
    }

    const listText = listBlockUtils.getText(listItems)
    if (!listText) return

    // Analyze for more list items
    const newItems = await analyzeListItems(fullNoteText, listText)

    if (newItems.length > 0) {
      // Insert toggle block and list items
      handleInsertList(lastListItemId, newItems)
    }
  },
}

