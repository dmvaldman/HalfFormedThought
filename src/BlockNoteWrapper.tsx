import React, { useEffect, useRef } from 'react'
import { BlockNoteView } from '@blocknote/mantine'
import type { BlockNoteEditor } from '@blocknote/core'
import { useCreateBlockNote } from '@blocknote/react'
import { BlockNoteSchema, defaultBlockSpecs } from '@blocknote/core'
import { annotationBlockSpec } from './AnnotationBlock'
import '@blocknote/core/fonts/inter.css'
import '@blocknote/mantine/style.css'

type Block = any

import { Annotation } from './types'

export interface BlockNoteWrapperHandle {
  insertAnnotationAfter: (afterBlockId: string, annotations: Annotation[]) => void
}

interface BlockNoteWrapperProps {
  initialContent: any[] | undefined
  onUpdate: (content: any) => void
  onDoubleEnter: (finishedBlockId: string) => void
}

const isParagraphEmpty = (block: Block): boolean => {
  if (!block || block.type !== 'paragraph') return false
  const inlines = block.content || []
  const text = inlines.map((n: any) => (n.text || '')).join('')
  return text.trim() === ''
}

function InternalBlockNote({
  initialContent,
  onEditorReady,
}: {
  initialContent: any[] | undefined
  onEditorReady: (ed: BlockNoteEditor) => void
}) {
  const schema = BlockNoteSchema.create({
    blockSpecs: {
      ...defaultBlockSpecs,
      annotation: annotationBlockSpec(),
    },
  })

  const editor = useCreateBlockNote({
    schema,
    initialContent: initialContent && initialContent.length > 0 ? initialContent : undefined,
    pasteHandler: ({ event, editor, defaultPasteHandler }) => {
      const plainText = event.clipboardData?.getData('text/plain')
      if (plainText) {
        // Split by newlines and create a paragraph block for each line (preserving empty lines)
        const lines = plainText.split('\n')
        const blocksToInsert = lines.map(line => ({
          type: 'paragraph' as const,
          content: line ? [{ type: 'text' as const, text: line }] : [],
        }))

        // Get current selection to insert after
        const selection = editor.getSelection()
        const currentBlock = selection?.blocks[0] || editor.getTextCursorPosition()?.block

        if (currentBlock && blocksToInsert.length > 0) {
          editor.insertBlocks(blocksToInsert, currentBlock, 'after')
          // Remove the current block if it's empty (we're replacing it)
          if (currentBlock.type === 'paragraph') {
            const currentContent = currentBlock.content
            if (Array.isArray(currentContent)) {
              const currentText = currentContent.map((n: any) => n.text || '').join('')
              if (currentText.trim() === '') {
                editor.removeBlocks([currentBlock])
              }
            }
          }
          return true // We handled the paste
        }
      }
      // Fall back to default handler for other content types
      return defaultPasteHandler({ plainTextAsMarkdown: true })
    },
  })
  // Call once per mount when editor is ready
  const hasCalledReady = useRef(false)
  useEffect(() => {
    if (!hasCalledReady.current) {
      hasCalledReady.current = true
      onEditorReady(editor as any) // Type assertion for custom schema
    }
  }, [editor, onEditorReady])
  return <BlockNoteView editor={editor} />
}

class BlockNoteWrapper extends React.Component<BlockNoteWrapperProps> implements BlockNoteWrapperHandle {
  private editor: BlockNoteEditor | null = null
  private cleanupOnChange: (() => void) | null = null
  private cleanupOnUpdate: (() => void) | null = null

  private handleEditorReady = (ed: BlockNoteEditor) => {
    if (this.editor) return
    console.log('handleEditorReady called', ed)
    this.editor = ed as any // Type assertion needed for custom schema
    // Forward updates upstream
    this.cleanupOnUpdate = (this.editor as any).onChange((editor: BlockNoteEditor) => {
      this.props.onUpdate(editor.document)
    })
    // Detect double-Enter via insert events
    this.cleanupOnChange = (this.editor as any).onChange((editor: BlockNoteEditor, { getChanges }: { getChanges: () => any[] }) => {
      const changes = getChanges()
      for (const ch of changes) {
        if (ch.type !== 'insert') continue
        const inserted = ch.block as Block
        if (!inserted || inserted.type !== 'paragraph') continue
        const doc: Block[] = editor.document
        const idx = doc.findIndex((b: Block) => b.id === inserted.id)
        if (idx < 2) continue
        const prev = doc[idx - 1]
        const prevPrev = doc[idx - 2]
        const isPrevEmpty = isParagraphEmpty(prev)
        const isPrevPrevNonEmpty = prevPrev?.type === 'paragraph' && !isParagraphEmpty(prevPrev)
        if (isPrevEmpty && isPrevPrevNonEmpty) {
          this.props.onDoubleEnter(prevPrev.id)
        }
      }
    })
  }

  componentWillUnmount(): void {
    if (this.cleanupOnChange) this.cleanupOnChange()
    if (this.cleanupOnUpdate) this.cleanupOnUpdate()
  }

  insertAnnotationAfter = (afterBlockId: string, annotations: Annotation[]) => {
    if (!this.editor) {
      console.warn('Editor not initialized')
      return
    }

    if (annotations.length === 0) {
      return
    }

    // Use BlockNote's insertBlocks API to insert annotation block
    // Store annotations as JSON string since BlockNote props only support primitives
    this.editor.insertBlocks(
      [
        {
          type: 'annotation' as any,
          props: {
            annotationsJson: JSON.stringify(annotations),
          },
        } as any,
      ],
      afterBlockId,
      'after'
    )
  }

  render(): React.ReactNode {
    return (
      <InternalBlockNote
        initialContent={this.props.initialContent}
        onEditorReady={this.handleEditorReady}
      />
    )
  }
}

export default BlockNoteWrapper


