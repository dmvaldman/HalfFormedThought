import React, { useEffect, useRef, createContext } from 'react'
import { BlockNoteView } from '@blocknote/mantine'
import type { BlockNoteEditor } from '@blocknote/core'
import { useCreateBlockNote } from '@blocknote/react'
import { BlockNoteSchema, defaultBlockSpecs } from '@blocknote/core'
import { annotationBlockSpec } from './AnnotationBlock'
import '@blocknote/core/fonts/inter.css'
import '@blocknote/mantine/style.css'

type Block = any

import { Annotation } from './types'

// Context to pass callbacks to custom blocks
export const BlockNoteContext = createContext<{
  onFetchMoreAnnotations?: (annotationBlockId: string, sourceBlockId: string, currentAnnotations: Annotation[]) => void | Promise<void>
}>({})


export interface BlockNoteWrapperHandle {
  insertAnnotationAfter: (afterBlockId: string, annotations: Annotation[], sourceBlockId: string) => void
  appendAnnotation: (annotationBlockId: string, newAnnotations: Annotation[]) => void
  updateAnnotationBlock: (annotationBlockId: string, newAnnotations: Annotation[]) => void
}

interface BlockNoteWrapperProps {
  initialContent: any[] | undefined
  onUpdate: (content: any) => void
  onDoubleEnter: (finishedBlockId: string) => void
  onFetchMoreAnnotations?: (annotationBlockId: string, sourceBlockId: string, currentAnnotations: Annotation[]) => void | Promise<void>
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
  contextValue,
}: {
  initialContent: any[] | undefined
  onEditorReady: (ed: BlockNoteEditor) => void
  contextValue: { onFetchMoreAnnotations?: (sourceBlockId: string, currentAnnotations: Annotation[]) => Promise<void> }
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
  return (
    <BlockNoteContext.Provider value={contextValue}>
      <BlockNoteView editor={editor} />
    </BlockNoteContext.Provider>
  )
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

  insertAnnotationAfter = (afterBlockId: string, annotations: Annotation[], sourceBlockId: string) => {
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
            sourceBlockId: sourceBlockId, // Store the collapsed block ID for fetching more
          },
        } as any,
      ],
      afterBlockId,
      'after'
    )
  }

  appendAnnotation = (annotationBlockId: string, newAnnotations: Annotation[]) => {
    if (!this.editor) {
      console.warn('Editor not initialized')
      return
    }

    // Get the annotation block by its ID (not by searching sourceBlockId)
    const doc: any[] = (this.editor as any).document
    const annotationBlock = doc.find((b: any) => b.id === annotationBlockId)

    if (!annotationBlock) {
      console.warn('No annotation block found with ID:', annotationBlockId)
      return
    }

    console.log('[BlockNoteWrapper.appendAnnotation] Appending to annotation block:', annotationBlockId)

    // Get existing annotations and append new ones
    const existingAnnotationsJson = annotationBlock.props?.annotationsJson || '[]'
    const existingAnnotations: Annotation[] = JSON.parse(existingAnnotationsJson)
    const allAnnotations = [...existingAnnotations, ...newAnnotations]

    // Update the annotation block
    this.editor.updateBlock(annotationBlock.id, {
      props: {
        ...annotationBlock.props,
        annotationsJson: JSON.stringify(allAnnotations),
      },
    })
  }

  updateAnnotationBlock = (annotationBlockId: string, newAnnotations: Annotation[]) => {
    if (!this.editor) {
      console.warn('Editor not initialized')
      return
    }

    // Find the annotation block and update its annotations
    const doc: any[] = (this.editor as any).document
    const annotationBlock = doc.find((b: any) => b.id === annotationBlockId && b.type === 'annotation')

    if (annotationBlock) {
      this.editor.updateBlock(annotationBlockId, {
        props: {
          ...annotationBlock.props,
          annotationsJson: JSON.stringify(newAnnotations),
        },
      })
    }
  }

  render(): React.ReactNode {
    const contextValue = {
      onFetchMoreAnnotations: this.props.onFetchMoreAnnotations,
    }

    return (
      <InternalBlockNote
        initialContent={this.props.initialContent}
        onEditorReady={this.handleEditorReady}
        contextValue={contextValue}
      />
    )
  }
}

export default BlockNoteWrapper


