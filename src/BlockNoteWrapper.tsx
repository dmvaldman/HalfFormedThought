import { createContext, useRef } from 'react'
import { BlockNoteView } from '@blocknote/mantine'
import type { BlockNoteEditor } from '@blocknote/core'
import { useCreateBlockNote } from '@blocknote/react'
import { BlockNoteSchema, defaultBlockSpecs } from '@blocknote/core'
import { annotationBlockSpec } from './AnnotationBlock'
import '@blocknote/core/fonts/inter.css'
import '@blocknote/mantine/style.css'

import { Annotation } from './types'

export interface BlockNoteCallbacks {
  onEditorReady?: (editor: BlockNoteEditor) => void
  onFetchMoreAnnotations?: (annotationBlockId: string, sourceBlockId: string, currentAnnotations: Annotation[]) => void | Promise<void>
}

export const BlockNoteContext = createContext<Pick<BlockNoteCallbacks, 'onFetchMoreAnnotations'>>({})

type PasteHandlerArgs = {
  event: ClipboardEvent
  editor: any
  defaultPasteHandler: (opts?: any) => any
}
type PasteHandler = (args: PasteHandlerArgs) => boolean

interface BlockNoteWrapperProps extends BlockNoteCallbacks {
  initialContent: any[] | undefined
  pasteHandler?: PasteHandler
}

const BlockNoteWrapper = ({
  initialContent,
  onEditorReady,
  onFetchMoreAnnotations,
  pasteHandler,
}: BlockNoteWrapperProps) => {
  const schema = BlockNoteSchema.create({
    blockSpecs: {
      ...defaultBlockSpecs,
      annotation: annotationBlockSpec(),
    },
  })

  const editor = useCreateBlockNote({
    schema,
    initialContent: initialContent && initialContent.length > 0 ? initialContent : undefined,
    pasteHandler: pasteHandler
      ? (args) => pasteHandler(args as PasteHandlerArgs)
      : ({ event, editor, defaultPasteHandler }) => {
          const plainText = event.clipboardData?.getData('text/plain')
          if (plainText) {
            const lines = plainText.split('\n')
            const blocksToInsert = lines.map(line => ({
              type: 'paragraph' as const,
              content: line ? [{ type: 'text' as const, text: line }] : [],
            }))

            const selection = editor.getSelection()
            const currentBlock = selection?.blocks[0] || editor.getTextCursorPosition()?.block

            if (currentBlock && blocksToInsert.length > 0) {
              editor.insertBlocks(blocksToInsert, currentBlock, 'after')
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
          return defaultPasteHandler({ plainTextAsMarkdown: true })
        },
  })

  // Call onEditorReady once
  const didReadyRef = useRef(false)
  if (!didReadyRef.current && onEditorReady) {
    onEditorReady(editor as unknown as BlockNoteEditor)
    didReadyRef.current = true
  }

  const contextValue = {
    onFetchMoreAnnotations,
  }

  return (
    <BlockNoteContext.Provider value={contextValue}>
      <BlockNoteView editor={editor} />
    </BlockNoteContext.Provider>
  )
}

export default BlockNoteWrapper


