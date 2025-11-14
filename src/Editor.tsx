import React, { Component, RefObject } from 'react'
import { BlockNoteEditor, BlockNoteSchema, defaultBlockSpecs } from '@blocknote/core'
import { BlockNoteView } from '@blocknote/mantine'
import { annotationBlockSpec, setAnnotationCallback, annotationBlockUtils } from './AnnotationBlock'
import { toggleBlockSpec, toggleBlockUtils } from './ToggleBlock'
import { listBlockUtils } from './ListBlock'
import { moreButtonBlockSpec, setMoreButtonCallback } from './MoreButtonBlock'
import '@blocknote/core/fonts/inter.css'
import '@blocknote/mantine/style.css'
import { Note, Annotation, BaseBlock, AnnotationBlock } from './types'
import { analyzeNote, analyzeBlock } from './analyzer'
import { createPasteHandler } from './pasteHandler'

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

      // Temporarily set editor to null to force BlockNoteView to unmount before creating new one
      this.setState({
        editor: null,
        title: this.props.note?.title || '',
        isAnalyzing: false,
      }, () => {
        // Initialize the new editor after state update is complete
        this.initializeNote(this.props.note)
      })
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
    this.destroy()
  }

  private destroy() {
    if (this.unsubscribeChange) {
      this.unsubscribeChange()
      this.unsubscribeChange = null
    }
    if (this.editor && typeof this.editor.destroy === 'function') {
      this.editor.destroy()
    }
    this.editor = null
  }



  private insertAnnotation = (afterBlockId: string, annotations: Annotation[], sourceBlockId: string) => {
    if (!this.editor || annotations.length === 0) return
    this.editor.insertBlocks(
      [
        {
          type: 'annotation',
          props: {
            annotationsJson: JSON.stringify(annotations),
            sourceBlockId,
          },
        },
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
        if (this.editor) {
          toggleBlockUtils.detectToggleDeletion(getChanges(), this.editor, (updatedBlock) => {
            // Delete the updated block itself when toggle is converted to paragraph
            this.editor?.removeBlocks([updatedBlock])
          })
        }
        annotationBlockUtils.detectAnnotation(getChanges(), editorInstance, (blockId) => {
          this.handleAnalysis(blockId)
        })
        listBlockUtils.detectListCompletion(getChanges(), editorInstance, async (lastListItemId) => {
          if (this.editor) {
            this.setState({ isAnalyzing: true })
            try {
              const doc = this.editor.document as BaseBlock[]
              const fullNoteText = await this.convertDocToMarkdown(doc)
              await listBlockUtils.handleCompletion(
                this.editor,
                lastListItemId,
                fullNoteText
              )
            } catch (error) {
              console.error('Error analyzing list:', error)
            }
            this.setState({ isAnalyzing: false })
          }
        })
      }
    })
  }

  private initializeNote(note: Note | null) {
    if (!note) {
      this.destroy()
      this.blocks = []
      return
    }

    // Destroy without updating state to avoid unmounting BlockNoteView prematurely
    // The key prop on BlockNoteView will force it to remount with the new editor
    this.destroy()

    // Set the callbacks before creating the schema
    setAnnotationCallback(this.handleAnalysisForAnnotation)
    setMoreButtonCallback(this.handleMoreButtonClick)

    // createReactBlockSpec returns a function, so we need to call it to get the spec object
    const annotationSpec = annotationBlockSpec()
    const toggleSpec = toggleBlockSpec()
    const moreButtonSpec = moreButtonBlockSpec()

    const schema = BlockNoteSchema.create({
      blockSpecs: {
        ...defaultBlockSpecs,
        annotation: annotationSpec,
        toggle: toggleSpec,
        moreButton: moreButtonSpec,
      },
    })

    const editor = BlockNoteEditor.create({
      schema,
      initialContent: Array.isArray(note.content) && note.content.length > 0 ? note.content : undefined,
      pasteHandler: createPasteHandler(),
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

  /**
   * Recursively finds the parent block that contains the given block ID as a child
   */
  findParentBlock(blocks: BaseBlock[], targetId: string): BaseBlock | null {
    for (const block of blocks) {
      if (block.id === targetId) {
        return null // Found the target, but we need its parent
      }
      if (Array.isArray(block.children)) {
        const child = block.children.find((c) => c.id === targetId)
        if (child) {
          return block // Found parent
        }
        // Recursively search nested children
        const nestedParent = this.findParentBlock(block.children, targetId)
        if (nestedParent) {
          return nestedParent
        }
      }
    }
    return null
  }




  private convertDocToMarkdown = async (doc: BaseBlock[]): Promise<string> => {
    if (!this.editor) return ''
    const filteredBlocks = doc.filter((block) =>
      block.type !== 'annotation' && block.type !== 'toggle'
    )
    return await this.editor.blocksToMarkdownLossy(filteredBlocks)
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

      // Convert blocks to markdown
      const doc = this.editor?.document as BaseBlock[] || []
      const fullNoteText = await this.convertDocToMarkdown(doc)
      const currentBlockText = currentBlock.text

      const annotations = await analyzeBlock(fullNoteText, currentBlockText, [])

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

      // Convert blocks to markdown
      const doc = this.editor?.document as BaseBlock[] || []
      const fullNoteText = await this.convertDocToMarkdown(doc)
      const currentBlockText = currentBlock.text

      const annotations = await analyzeBlock(fullNoteText, currentBlockText, existingAnnotations)

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

  handleMoreButtonClick = async (toggleBlockId: string) => {
    if (!this.props.note || !this.editor) return

    this.setState({ isAnalyzing: true })

    try {
      const doc = this.editor.document as BaseBlock[]
      const fullNoteText = await this.convertDocToMarkdown(doc)
      // Create a bound version of findParentBlock to pass to handleMore
      const findParentBlock = (blocks: BaseBlock[], targetId: string) => this.findParentBlock(blocks, targetId)
      await listBlockUtils.handleMore(
        this.editor,
        toggleBlockId,
        fullNoteText,
        findParentBlock
      )
    } catch (error) {
      console.error('Error handling more button click:', error)
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

      // Convert blocks to markdown
      const doc = this.editor?.document as BaseBlock[] || []
      const fullNoteText = await this.convertDocToMarkdown(doc)

      // Create block texts with IDs for analyzeNote
      const blockTexts = collapsedBlocks.map((block) => ({
        id: block.id,
        text: block.text,
      }))

      const annotationsByBlockId = await analyzeNote(fullNoteText, blockTexts)

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

