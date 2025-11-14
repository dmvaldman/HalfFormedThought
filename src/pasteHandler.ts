import { BlockNoteEditor } from '@blocknote/core'

export const createPasteHandler = () => {
  return ({ event, editor, defaultPasteHandler }: {
    event: ClipboardEvent
    editor: BlockNoteEditor
    defaultPasteHandler: (context?: {
      prioritizeMarkdownOverHTML?: boolean
      plainTextAsMarkdown?: boolean
    }) => boolean | undefined
  }): boolean | undefined => {
    const htmlData = event.clipboardData?.getData('text/html')
    const plainText = event.clipboardData?.getData('text/plain')

    // If there's HTML content, let BlockNote handle it (it can parse markdown from HTML)
    if (htmlData) {
      return defaultPasteHandler({ prioritizeMarkdownOverHTML: true })
    }

    // If there's plain text with double line breaks, parse each segment as markdown and insert blank blocks
    if (plainText && plainText.includes('\n\n')) {
      const selection = editor.getSelection()
      const currentBlock = selection?.blocks[0] || editor.getTextCursorPosition()?.block

      if (currentBlock) {
        // Split on double+ line breaks
        const paragraphs = plainText.split(/\n\n+/)
        let insertAfterBlock = currentBlock

        for (let i = 0; i < paragraphs.length; i++) {
          const para = paragraphs[i].trim()
          if (para.length === 0) continue

          // Set cursor position to insert after the current block
          editor.setTextCursorPosition(insertAfterBlock, 'end')

          // Track document length before paste
          const docBefore = editor.document
          const lengthBefore = docBefore.length

          // Use BlockNote's pasteMarkdown to parse and insert markdown
          editor.pasteMarkdown(para)

          // Find the last inserted block by comparing document length
          const docAfter = editor.document
          if (docAfter.length > lengthBefore) {
            // Get the last block that was inserted
            insertAfterBlock = docAfter[docAfter.length - 1]
          }

          // Insert a blank paragraph between segments (except after the last one)
          if (i < paragraphs.length - 1) {
            editor.insertBlocks(
              [{ type: 'paragraph' as const, content: [] }],
              insertAfterBlock.id,
              'after'
            )
            // Update insertAfterBlock to the blank paragraph we just inserted
            const updatedDoc = editor.document
            const blankIndex = updatedDoc.findIndex((b) => b.id === insertAfterBlock.id)
            if (blankIndex !== -1 && blankIndex + 1 < updatedDoc.length) {
              insertAfterBlock = updatedDoc[blankIndex + 1]
            }
          }
        }

        // Clean up empty current block if needed
        if (currentBlock.type === 'paragraph') {
          const currentContent = currentBlock.content
          if (Array.isArray(currentContent)) {
            const currentText = currentContent.map((n: any) => n.text || '').join('')
            if (currentText.trim() === '') {
              editor.removeBlocks([currentBlock])
            }
          }
        }
        return true
      }
    }

    // For plain text without double line breaks, let BlockNote parse as markdown
    if (plainText) {
      return defaultPasteHandler({ plainTextAsMarkdown: true })
    }

    // Fallback to default behavior
    return defaultPasteHandler()
  }
}

