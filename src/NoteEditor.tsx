import React, { Component, RefObject } from 'react'
import BlockNoteWrapper from './BlockNoteWrapper'
import type { BlockNoteEditor } from '@blocknote/core'
import { Note, Annotation } from './types'
import { analyzeNote, analyzeBlock } from './analyzer'

interface NoteEditorProps {
  note: Note | null
  onUpdateNote: (noteId: string, title: string, content: any) => void
}

interface NoteEditorState {
  title: string
  isAnalyzing: boolean
}

interface BlockAnalysisStatus {
  isDirty: boolean
  isAnalyzed: boolean
}

class NoteEditor extends Component<NoteEditorProps, NoteEditorState> {
  private titleTextareaRef: RefObject<HTMLTextAreaElement | null>
  private contentContainerRef: RefObject<HTMLDivElement | null>
  private blockAnalysisStatus: Map<string, BlockAnalysisStatus> = new Map()
  private editor: BlockNoteEditor | null = null
  private unsubscribeChange: (() => void) | null = null
  private blocks: any[] = []

  constructor(props: NoteEditorProps) {
    super(props)
    this.titleTextareaRef = React.createRef<HTMLTextAreaElement>()
    this.contentContainerRef = React.createRef<HTMLDivElement>()
    this.state = {
      title: props.note?.title || '',
      isAnalyzing: false,
    }
  }

  componentDidUpdate(prevProps: NoteEditorProps) {
    if (prevProps.note?.id !== this.props.note?.id) {
      // Clear analysis status when switching notes
      this.blockAnalysisStatus.clear()
      // Initialize blocks from note content
      this.blocks = Array.isArray(this.props.note?.content) ? this.props.note.content : []
      this.setState({
        title: this.props.note?.title || '',
        isAnalyzing: false,
      })
    }

    if (this.titleTextareaRef.current) {
      this.titleTextareaRef.current.style.height = 'auto'
      this.titleTextareaRef.current.style.height = `${this.titleTextareaRef.current.scrollHeight}px`
    }
  }

  componentDidMount() {
    // Initialize blocks from note content
    if (this.props.note) {
      this.blocks = Array.isArray(this.props.note.content) ? this.props.note.content : []
    }
  }

  // Centralized paste handling in the editor class
  handlePaste = ({ event, editor, defaultPasteHandler }: { event: ClipboardEvent, editor: any, defaultPasteHandler: (opts?: any) => any }): boolean => {
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
  }

  private isParagraphEmpty = (block: any): boolean => {
    if (!block || block.type !== 'paragraph') return false
    const inlines = block.content || []
    const text = inlines.map((n: any) => (n.text || '')).join('')
    return text.trim() === ''
  }

  private handleEditorReady = (editor: BlockNoteEditor) => {
    this.editor = editor
    if (this.unsubscribeChange) {
      this.unsubscribeChange()
      this.unsubscribeChange = null
    }
    this.unsubscribeChange = (editor as any).onChange((editor: BlockNoteEditor, { getChanges }: { getChanges?: () => any[] }) => {
      // Update blocks and persist
      const doc = (editor as any).document
      this.blocks = doc
      if (this.props.note) {
        this.props.onUpdateNote(this.props.note.id, this.state.title, doc)
      }
      // Detect double-enter and trigger analysis
      if (getChanges) {
        const changes = getChanges()
        for (const ch of changes) {
          if (ch.type !== 'insert') continue
          const inserted = ch.block as any
          if (!inserted || inserted.type !== 'paragraph') continue
          const docArr = (editor as any).document as any[]
          const idx = docArr.findIndex((b: any) => b.id === inserted.id)
          if (idx < 2) continue
          const prev = docArr[idx - 1]
          const prevPrev = docArr[idx - 2]
          const isPrevEmpty = this.isParagraphEmpty(prev)
          const isPrevPrevNonEmpty = prevPrev?.type === 'paragraph' && !this.isParagraphEmpty(prevPrev)
          if (isPrevEmpty && isPrevPrevNonEmpty) {
            this.triggerAnalysis(prevPrev.id)
          }
        }
      }
    })
  }

  componentWillUnmount(): void {
    if (this.unsubscribeChange) {
      this.unsubscribeChange()
      this.unsubscribeChange = null
    }
  }

  getText = (block: any): string => {
    // Extract text from BlockNote format: block.content is an array of inline content
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

  collapseBlocks = (editorBlocks: any[]): Array<{id: string, text: string, collapsedIds: string[]}> => {
    // Collapse consecutive non-empty paragraph blocks into logical blocks
    // separated by empty paragraphs
    // Works with BlockNote format: blocks have content array with { type: 'text', text: '...' } objects
    const collapsed: Array<{id: string, text: string, collapsedIds: string[]}> = []
    let currentText = ''
    let currentId = ''
    let currentIds: string[] = []

    for (let i = 0; i < editorBlocks.length; i++) {
      const block = editorBlocks[i]

      if (block.type === 'paragraph') {
        const text = this.getText(block)

        if (!text) {
          // Empty block - finalize current collapsed block if any
          if (currentText.trim() !== '') {
            collapsed.push({ id: currentId, text: currentText.trim(), collapsedIds: currentIds })
            currentText = ''
            currentId = ''
            currentIds = []
          }
        } else {
          // Non-empty block - add to current collapsed block
          if (currentText === '') {
            currentId = block.id
            currentText = text
            currentIds = [block.id]
          } else {
            currentText += '\n' + text
            currentIds.push(block.id)
          }
        }
      }
    }

    // Don't forget the last block
    if (currentText.trim() !== '') {
      collapsed.push({ id: currentId, text: currentText.trim(), collapsedIds: currentIds })
    }

    return collapsed
  }


  handleTitleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const title = e.target.value
    this.setState({ title })
    e.target.style.height = 'auto'
    e.target.style.height = `${e.target.scrollHeight}px`
    // Update note immediately when title changes so sidebar reflects the change
    if (this.props.note) {
      const content = this.blocks.length > 0 ? this.blocks : this.props.note.content
      this.props.onUpdateNote(this.props.note.id, title, content)
    }
  }

  triggerAnalysis = async (blockId: string) => {
    if (!this.props.note) return

    this.setState({ isAnalyzing: true })

    try {
      const paragraphBlocks = this.blocks.filter((block: any) => block.type === 'paragraph')
      const collapsedBlocks = this.collapseBlocks(paragraphBlocks)

      // Find the collapsed block that contains this blockId
      const currentBlock = collapsedBlocks.find(b =>
        b.id === blockId || b.collapsedIds.includes(blockId)
      )

      if (!currentBlock) {
        console.log('No collapsed block found for blockId:', blockId)
        this.setState({ isAnalyzing: false })
        return
      }

      // Call analyzeBlock for new analysis
      const annotations = await analyzeBlock(collapsedBlocks, currentBlock, [])

      if (annotations.length > 0) {
        // Insert annotation block after the last block in the collapsed group
        const lastBlockIdInCollapsed = currentBlock.collapsedIds[currentBlock.collapsedIds.length - 1] || currentBlock.id
        console.log('[NoteEditor.triggerAnalysis] Inserting annotation block after:', lastBlockIdInCollapsed, 'with sourceBlockId:', currentBlock.id)
        if (this.editor) {
          ;(this.editor as any).insertBlocks(
            [
              {
                type: 'annotation' as any,
                props: {
                  annotationsJson: JSON.stringify(annotations),
                  sourceBlockId: currentBlock.id,
                },
              } as any,
            ],
            lastBlockIdInCollapsed,
            'after'
          )
        }
        // Mark the block as analyzed and clean (use the collapsed block's ID)
        this.blockAnalysisStatus.set(currentBlock.id, { isDirty: false, isAnalyzed: true })
      }
    } catch (error) {
      console.error('Error analyzing block:', error)
    }

    this.setState({ isAnalyzing: false })
  }

  triggerAnalysisForAnnotationBlock = async (annotationBlockId: string, sourceBlockId: string, existingAnnotations: any[]) => {
    if (!this.props.note) return

    this.setState({ isAnalyzing: true })

    try {
      const paragraphBlocks = this.blocks.filter((block: any) => block.type === 'paragraph')
      const collapsedBlocks = this.collapseBlocks(paragraphBlocks)

      // Find the collapsed block by sourceBlockId
      const currentBlock = collapsedBlocks.find(b =>
        b.id === sourceBlockId || b.collapsedIds.includes(sourceBlockId)
      )

      if (!currentBlock) {
        console.log('No collapsed block found for sourceBlockId:', sourceBlockId)
        this.setState({ isAnalyzing: false })
        return
      }

      // Call analyzeBlock with existing annotations to get more
      const annotations = await analyzeBlock(collapsedBlocks, currentBlock, existingAnnotations)

      if (annotations.length > 0) {
        console.log('[NoteEditor.triggerAnalysisForAnnotationBlock] Appending to annotation block:', annotationBlockId)
        if (this.editor) {
          const doc: any[] = (this.editor as any).document
          const annotationBlock = doc.find((b: any) => b.id === annotationBlockId)
          if (annotationBlock) {
            const existing: Annotation[] = JSON.parse(annotationBlock.props?.annotationsJson || '[]')
            const all = [...existing, ...annotations]
            ;(this.editor as any).updateBlock(annotationBlock.id, {
              props: {
                ...annotationBlock.props,
                annotationsJson: JSON.stringify(all),
              },
            })
          }
        }
      }
    } catch (error) {
      console.error('Error analyzing block:', error)
    }

    this.setState({ isAnalyzing: false })
  }

  handleAnalyzeAll = async () => {
    if (!this.props.note) return

    this.setState({ isAnalyzing: true })

    try {
      const paragraphBlocks = this.blocks.filter((block: any) => block.type === 'paragraph')
      const collapsedBlocks = this.collapseBlocks(paragraphBlocks)

      if (collapsedBlocks.length === 0) {
        this.setState({ isAnalyzing: false })
        return
      }

      // Call analyzeNote to get annotations for all blocks
      const annotationsByBlockId = await analyzeNote(collapsedBlocks)

      // Insert annotation callouts for each block that has annotations
      for (const collapsedBlock of collapsedBlocks) {
        const blockId = collapsedBlock.id
        const annotations = annotationsByBlockId[blockId] || []

        if (annotations.length > 0) {
          // Insert annotation block after the last block in the collapsed group
          const lastBlockIdInCollapsed = collapsedBlock.collapsedIds[collapsedBlock.collapsedIds.length - 1] || collapsedBlock.id
          if (this.editor) {
            ;(this.editor as any).insertBlocks(
              [
                {
                  type: 'annotation' as any,
                  props: {
                    annotationsJson: JSON.stringify(annotations),
                    sourceBlockId: blockId,
                  },
                } as any,
              ],
              lastBlockIdInCollapsed,
              'after'
            )
          }

          // Mark the block as analyzed and clean
          this.blockAnalysisStatus.set(blockId, { isDirty: false, isAnalyzed: true })
        }
      }

      // Save via onUpdate from BlockNote will cover persistence
    } catch (error) {
      console.error('Error analyzing note:', error)
    }

    this.setState({ isAnalyzing: false })
  }


  render() {
    const { note } = this.props
    const { title, isAnalyzing } = this.state

    if (!note) {
      return (
        <div className="note-editor empty">
          <div className="empty-state">Select a note or create a new one</div>
        </div>
      )
    }

    return (
      <div className="note-editor">
        <div className="note-title-container">
          <textarea
            ref={this.titleTextareaRef}
            className="note-title-input"
            value={title}
            onChange={this.handleTitleChange}
            placeholder="Note title..."
            rows={1}
          />
          <button
            className="analyze-button"
            onClick={this.handleAnalyzeAll}
            disabled={isAnalyzing}
          >
            Analyze
          </button>
        </div>
        <div className="note-content-container" ref={this.contentContainerRef}>
          <BlockNoteWrapper
            initialContent={Array.isArray(note.content) ? note.content : []}
            pasteHandler={this.handlePaste}
            onEditorReady={this.handleEditorReady}
            onFetchMoreAnnotations={(annotationBlockId, sourceBlockId, currentAnnotations) => {
              // Analyze the source block and append results to this specific annotation block
              this.triggerAnalysisForAnnotationBlock(annotationBlockId, sourceBlockId, currentAnnotations)
            }}
          />
        </div>
        {isAnalyzing && (
          <div className="analysis-spinner">
            <div className="spinner-icon"></div>
          </div>
        )}
      </div>
    )
  }
}

export default NoteEditor
