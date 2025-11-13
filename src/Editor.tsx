import React, { Component, RefObject } from 'react'
import { BlockNoteEditor, BlockNoteSchema, defaultBlockSpecs } from '@blocknote/core'
import { BlockNoteView } from '@blocknote/mantine'
import { annotationBlockSpec, setAnnotationCallback } from './AnnotationBlock'
import { toggleBlockSpec } from './ToggleBlock'
import { moreButtonBlockSpec, setMoreButtonCallback } from './MoreButtonBlock'
import '@blocknote/core/fonts/inter.css'
import '@blocknote/mantine/style.css'
import { Note, Annotation, BaseBlock, AnnotationBlock } from './types'
import { analyzeNote, analyzeBlock, analyzeListItems } from './analyzer'

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

  private isEmpty = (block: BaseBlock): boolean => {
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

  private detectListCompletion = (editorInstance: any, getChanges: () => any[]) => {
    const changes = getChanges()
    for (const ch of changes) {
      // Handle update case: when an empty list item becomes a paragraph
      if (ch.type === 'update' && ch.block) {
        const updatedBlock = ch.block as BaseBlock
        const prevBlock = ch.prevBlock as BaseBlock

        if (prevBlock && prevBlock.type === 'toggle') {
          continue
        }

        // Check if the updated block is now a paragraph
        if (updatedBlock.type === 'paragraph') {
          const docArr = editorInstance.document as BaseBlock[]
          const idx = docArr.findIndex((b) => b.id === updatedBlock.id)
          if (idx < 1) continue

          const prev = docArr[idx - 1]

          // Check if previous block is a list item
          if (prev && (prev.type === 'bulletListItem' || prev.type === 'numberedListItem')) {
            this.handleListCompletion(prev.id)
          }
        }
      }
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
      const isPrevEmpty = this.isEmpty(prev)
      const isPrevPrevNonEmpty = prevPrev?.type === 'paragraph' && !this.isEmpty(prevPrev)
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
        this.detectListCompletion(editorInstance, getChanges)
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


  private getListText = (doc: BaseBlock[], listItemId: string): string => {
    const listItem = doc.find((b) => b.id === listItemId)
    if (!listItem || (listItem.type !== 'bulletListItem' && listItem.type !== 'numberedListItem')) {
      return ''
    }

    const listItems: BaseBlock[] = []
    const itemIdx = doc.findIndex((b) => b.id === listItemId)

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

    return listItems.map((item) => this.getText(item)).filter(Boolean).join('\n')
  }

  private getToggleBlockListText = (toggleBlock: BaseBlock): string => {
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
        return this.getText(child)
      })
      .filter(Boolean)
      .join('\n')
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

  handleListCompletion = async (lastListItemId: string) => {
    if (!this.props.note || !this.editor) return

    this.setState({ isAnalyzing: true })

    try {
      const doc = this.editor.document as BaseBlock[]
      const listText = this.getListText(doc, lastListItemId)
      if (!listText) {
        this.setState({ isAnalyzing: false })
        return
      }

      // Convert all blocks to markdown for context
      const fullNoteText = await this.convertDocToMarkdown(doc)

      const newItems = await analyzeListItems(fullNoteText, listText)

      if (newItems.length > 0) {
        this.insertListBlock(lastListItemId, newItems)
      }
    } catch (error) {
      console.error('Error analyzing list:', error)
    }

    this.setState({ isAnalyzing: false })
  }

  private insertListBlock = (afterBlockId: string, items: string[]) => {
    if (!this.editor || items.length === 0) return

    // Insert the toggle block with list items, ending with a more button as the last child
    this.editor.insertBlocks(
      [
        {
          type: 'toggle',
          content: 'More examples',
          children: [
            ...items.map((text) => ({
              type: 'bulletListItem',
              content: text,
            })),
            {
              type: 'moreButton',
            },
          ],
        },
      ],
      afterBlockId,
      'after'
    )
  }

  private appendToListBlock = (listBlockId: string, newItems: string[]) => {
    if (!this.editor || newItems.length === 0) return
    const doc = this.editor.document as BaseBlock[]
    const toggleBlock = doc.find((b) => b.id === listBlockId && b.type === 'toggle')
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

    this.editor.updateBlock(toggleBlock.id, {
      children: updatedChildren,
    })
  }

  handleMoreButtonClick = async (moreButtonBlockId: string) => {
    if (!this.props.note || !this.editor) return

    this.setState({ isAnalyzing: true })

    try {
      const doc = this.editor.document as BaseBlock[]

      // Find the toggle block that contains the moreButton as a child
      const toggleBlock = doc.find(
        (block) =>
          block.type === 'toggle' &&
          Array.isArray(block.children) &&
          block.children.some((child) => child.id === moreButtonBlockId || child.type === 'moreButton')
      )

      if (!toggleBlock || toggleBlock.type !== 'toggle') {
        this.setState({ isAnalyzing: false })
        return
      }

      // Get the list text from the toggle block's children
      const listText = this.getToggleBlockListText(toggleBlock)
      if (!listText) {
        this.setState({ isAnalyzing: false })
        return
      }

      // Analyze for more list items
      const fullNoteText = await this.convertDocToMarkdown(doc)
      const newItems = await analyzeListItems(fullNoteText, listText)

      if (newItems.length > 0) {
        this.appendToListBlock(toggleBlock.id, newItems)
      }
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

