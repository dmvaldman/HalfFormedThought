import React, { Component, RefObject } from 'react'
import { BlockNoteEditor, BlockNoteSchema, defaultBlockSpecs } from '@blocknote/core'
import { BlockNoteView } from '@blocknote/mantine'
import { annotationBlockSpec, setAnnotationCallback } from './AnnotationBlock'
import '@blocknote/core/fonts/inter.css'
import '@blocknote/mantine/style.css'
import { Note, Annotation, BaseBlock, AnnotationBlock } from './types'
import { analyzeNote, analyzeBlock } from './analyzer'

interface EditorProps {
  note: Note | null
  onUpdateNote: (noteId: string, title: string, content: any) => void
}

interface EditorState {
  title: string
  isAnalyzing: boolean
  editor: any
}

interface BlockAnalysisStatus {
  isDirty: boolean
  isAnalyzed: boolean
}

class Editor extends Component<EditorProps, EditorState> {
  private editor: any = null
  private blocks: BaseBlock[] = []
  private titleTextareaRef: RefObject<HTMLTextAreaElement | null>
  private contentContainerRef: RefObject<HTMLDivElement | null>
  private blockAnalysisStatus: Map<string, BlockAnalysisStatus> = new Map()
  private unsubscribeChange: (() => void) | null = null

  constructor(props: EditorProps) {
    super(props)
    this.titleTextareaRef = React.createRef<HTMLTextAreaElement>()
    this.contentContainerRef = React.createRef<HTMLDivElement>()
    this.state = {
      title: props.note?.title || '',
      isAnalyzing: false,
      editor: null,
    }
  }

  componentDidUpdate(prevProps: EditorProps) {
    if (prevProps.note?.id !== this.props.note?.id) {
      this.blockAnalysisStatus.clear()
      this.blocks = Array.isArray(this.props.note?.content) ? this.props.note.content : []
      this.setState({
        title: this.props.note?.title || '',
        isAnalyzing: false,
      })
      this.initializeNote(this.props.note)
    }

    if (this.titleTextareaRef.current) {
      this.titleTextareaRef.current.style.height = 'auto'
      this.titleTextareaRef.current.style.height = `${this.titleTextareaRef.current.scrollHeight}px`
    }
  }

  componentDidMount() {
    if (this.props.note) {
      this.blocks = Array.isArray(this.props.note.content) ? this.props.note.content : []
    }
    this.initializeNote(this.props.note)
  }

  componentWillUnmount(): void {
    this.destroy(false)
  }

  private destroy(updateState: boolean = true) {
    if (this.unsubscribeChange) {
      this.unsubscribeChange()
      this.unsubscribeChange = null
    }
    if (this.editor && typeof this.editor.destroy === 'function') {
      this.editor.destroy()
    }
    this.editor = null
    if (updateState) {
      this.setState({ editor: null })
    }
  }

  handlePaste = ({ event, editor, defaultPasteHandler }: { event: ClipboardEvent; editor: any; defaultPasteHandler: (opts?: any) => any }): boolean => {
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

  private isParagraphEmpty = (block: BaseBlock): boolean => {
    if (!block || block.type !== 'paragraph') return false
    const inlines = block.content || []
    const text = inlines.map((n: any) => (n.text || '')).join('')
    return text.trim() === ''
  }

  private insertAnnotation = (afterBlockId: string, annotations: Annotation[], sourceBlockId: string) => {
    if (!this.editor || annotations.length === 0) return
    this.editor.insertBlocks(
      [
        {
          type: 'annotation' as any,
          props: {
            annotationsJson: JSON.stringify(annotations),
            sourceBlockId,
          },
        } as any,
      ],
      afterBlockId,
      'after'
    )
  }

  private findAnnotationBlock = (annotationBlockId: string): AnnotationBlock | null => {
    if (!this.editor) return null
    const doc = this.editor.document as BaseBlock[]
    const block = doc.find((b) => b.id === annotationBlockId)
    return block && block.type === 'annotation' ? (block as AnnotationBlock) : null
  }

  private appendToAnnotationBlock = (annotationBlockId: string, newAnnotations: Annotation[]) => {
    if (!this.editor || newAnnotations.length === 0) return
    const annotationBlock = this.findAnnotationBlock(annotationBlockId)
    if (!annotationBlock) return
    const existing: Annotation[] = JSON.parse(annotationBlock.props?.annotationsJson || '[]')
    const all = [...existing, ...newAnnotations]
    this.editor.updateBlock(annotationBlock.id, {
      props: {
        ...annotationBlock.props,
        annotationsJson: JSON.stringify(all),
        isFetching: false,
      },
    })
  }

  private resetAnnotationFetching = (annotationBlockId: string) => {
    const annotationBlock = this.findAnnotationBlock(annotationBlockId)
    if (annotationBlock && this.editor) {
      this.editor.updateBlock(annotationBlock.id, {
        props: {
          ...annotationBlock.props,
          isFetching: false,
        },
      })
    }
  }

  private detectDoubleEnter = (editorInstance: any, getChanges: () => any[]) => {
    const changes = getChanges()
    for (const ch of changes) {
      if (ch.type !== 'insert') continue
      const inserted = ch.block as BaseBlock
      if (!inserted || inserted.type !== 'paragraph') continue
      const docArr = editorInstance.document as BaseBlock[]
      const idx = docArr.findIndex((b) => b.id === inserted.id)
      if (idx < 2) continue
      const prev = docArr[idx - 1]
      const prevPrev = docArr[idx - 2]
      const isPrevEmpty = this.isParagraphEmpty(prev)
      const isPrevPrevNonEmpty = prevPrev?.type === 'paragraph' && !this.isParagraphEmpty(prevPrev)
      if (isPrevEmpty && isPrevPrevNonEmpty) {
        this.handleAnalysis(prevPrev.id)
      }
    }
  }

  private attachListeners(editor: any) {
    if (this.unsubscribeChange) {
      this.unsubscribeChange()
      this.unsubscribeChange = null
    }
    this.unsubscribeChange = editor.onChange((editorInstance: any, { getChanges }: { getChanges?: () => any[] }) => {
      const doc = editorInstance.document
      this.blocks = doc
      if (this.props.note) {
        this.props.onUpdateNote(this.props.note.id, this.state.title, doc)
      }
      if (getChanges) {
        this.detectDoubleEnter(editorInstance, getChanges)
      }
    })
  }

  private initializeNote(note: Note | null) {
    if (!note) {
      this.destroy()
      this.blocks = []
      return
    }

    this.destroy()

    // Set the callback before creating the schema
    setAnnotationCallback(this.handleAnalysisForAnnotation)

    // createReactBlockSpec returns a function, so we need to call it to get the spec object
    const annotationSpec = (annotationBlockSpec as any)()

    const schema = BlockNoteSchema.create({
      blockSpecs: {
        ...defaultBlockSpecs,
        annotation: annotationSpec,
      },
    })

    const editor = BlockNoteEditor.create({
      schema,
      initialContent: Array.isArray(note.content) && note.content.length > 0 ? note.content : undefined,
      pasteHandler: ({ event, editor, defaultPasteHandler }: { event: ClipboardEvent; editor: any; defaultPasteHandler: (opts?: any) => any }) =>
        this.handlePaste({ event, editor, defaultPasteHandler }),
      placeholders: {
        emptyDocument: 'Your germ of an idea...',
        default: ''
      }
    }) as BlockNoteEditor

    this.editor = editor
    this.blocks = Array.isArray(note.content) ? note.content : []
    this.attachListeners(editor)
    this.setState({ editor })
  }

  getText = (block: BaseBlock): string => {
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

  collapseBlocks = (editorBlocks: BaseBlock[]): Array<{ id: string, text: string, collapsedIds: string[] }> => {
    const collapsed: Array<{ id: string, text: string, collapsedIds: string[] }> = []
    let currentText = ''
    let currentId = ''
    let currentIds: string[] = []

    for (let i = 0; i < editorBlocks.length; i++) {
      const block = editorBlocks[i]

      if (block.type === 'paragraph') {
        const text = this.getText(block)

        if (!text) {
          if (currentText.trim() !== '') {
            collapsed.push({ id: currentId, text: currentText.trim(), collapsedIds: currentIds })
            currentText = ''
            currentId = ''
            currentIds = []
          }
        } else {
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
    if (this.props.note) {
      const content = this.blocks.length > 0 ? this.blocks : this.props.note.content
      this.props.onUpdateNote(this.props.note.id, title, content)
    }
  }

  private getCollapsedBlocks = (): Array<{ id: string, text: string, collapsedIds: string[] }> | null => {
    if (!this.props.note) return null
    const paragraphBlocks = this.blocks.filter((block): block is BaseBlock => block.type === 'paragraph')
    return this.collapseBlocks(paragraphBlocks)
  }

  handleAnalysis = async (blockId: string) => {
    if (!this.props.note) return

    this.setState({ isAnalyzing: true })

    try {
      const collapsedBlocks = this.getCollapsedBlocks()
      if (!collapsedBlocks) {
        this.setState({ isAnalyzing: false })
        return
      }

      const currentBlock = collapsedBlocks.find(b =>
        b.id === blockId || b.collapsedIds.includes(blockId)
      )

      if (!currentBlock) {
        this.setState({ isAnalyzing: false })
        return
      }

      const annotations = await analyzeBlock(collapsedBlocks, currentBlock, [])

      if (annotations.length > 0) {
        const lastBlockIdInCollapsed = currentBlock.collapsedIds[currentBlock.collapsedIds.length - 1] || currentBlock.id
        this.insertAnnotation(lastBlockIdInCollapsed, annotations, currentBlock.id)
        this.blockAnalysisStatus.set(currentBlock.id, { isDirty: false, isAnalyzed: true })
      }
    } catch (error) {
      console.error('Error analyzing block:', error)
    }

    this.setState({ isAnalyzing: false })
  }

  handleAnalysisForAnnotation = async (annotationBlockId: string, sourceBlockId: string, existingAnnotations: Annotation[]) => {
    if (!this.props.note) return

    this.setState({ isAnalyzing: true })

    try {
      const collapsedBlocks = this.getCollapsedBlocks()
      if (!collapsedBlocks) {
        this.setState({ isAnalyzing: false })
        return
      }

      const currentBlock = collapsedBlocks.find(b =>
        b.id === sourceBlockId || b.collapsedIds.includes(sourceBlockId)
      )

      if (!currentBlock) {
        this.setState({ isAnalyzing: false })
        return
      }

      const annotations = await analyzeBlock(collapsedBlocks, currentBlock, existingAnnotations)

      if (annotations.length > 0) {
        this.appendToAnnotationBlock(annotationBlockId, annotations)
      } else {
        this.resetAnnotationFetching(annotationBlockId)
      }
    } catch (error) {
      console.error('Error analyzing block:', error)
      this.resetAnnotationFetching(annotationBlockId)
    }

    this.setState({ isAnalyzing: false })
  }

  handleAnalyzeAll = async () => {
    if (!this.props.note) return

    this.setState({ isAnalyzing: true })

    try {
      const collapsedBlocks = this.getCollapsedBlocks()
      if (!collapsedBlocks || collapsedBlocks.length === 0) {
        this.setState({ isAnalyzing: false })
        return
      }

      const annotationsByBlockId = await analyzeNote(collapsedBlocks)

      for (const collapsedBlock of collapsedBlocks) {
        const blockId = collapsedBlock.id
        const annotations = annotationsByBlockId[blockId] || []

        if (annotations.length > 0) {
          const lastBlockIdInCollapsed = collapsedBlock.collapsedIds[collapsedBlock.collapsedIds.length - 1] || collapsedBlock.id
          this.insertAnnotation(lastBlockIdInCollapsed, annotations, blockId)

          this.blockAnalysisStatus.set(blockId, { isDirty: false, isAnalyzed: true })
        }
      }
    } catch (error) {
      console.error('Error analyzing note:', error)
    }

    this.setState({ isAnalyzing: false })
  }

  render() {
    const { note } = this.props
    const { title, isAnalyzing, editor } = this.state

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
          {editor && <BlockNoteView editor={editor} />}
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

export default Editor

