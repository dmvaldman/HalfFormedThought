import React, { Component, RefObject } from 'react'
import BlockNoteWrapper, { BlockNoteWrapperHandle } from './BlockNoteWrapper'
import { Note } from './types'
import { createAnnotationFromAPI } from './annotations'
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
  private blockNoteRef = React.createRef<BlockNoteWrapperHandle>()
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

      // Find the block data for debugging
      // const blockData = paragraphBlocks.find((b: any) => b.id === blockId)

      // Find the collapsed block that contains this blockId
      const currentBlock = collapsedBlocks.find(b =>
        b.id === blockId || b.collapsedIds.includes(blockId)
      )

      if (!currentBlock) {
        console.log('No collapsed block found for blockId:', blockId)
        this.setState({ isAnalyzing: false })
        return
      }

      // Existing annotations lookup is skipped for BlockNote path for now
      const existingAnnotations: any[] = []

      // Call analyzeBlock
      const apiAnnotations = await analyzeBlock(collapsedBlocks, currentBlock, existingAnnotations)

      if (apiAnnotations.length > 0) {
        const newAnnotations = apiAnnotations.map(createAnnotationFromAPI)
        // Insert annotation block after the last block in the collapsed group
        const lastBlockIdInCollapsed = currentBlock.collapsedIds[currentBlock.collapsedIds.length - 1] || currentBlock.id
        this.blockNoteRef.current?.insertAnnotationAfter(lastBlockIdInCollapsed, newAnnotations)
        // Mark the block as analyzed and clean (use the collapsed block's ID)
        this.blockAnalysisStatus.set(currentBlock.id, { isDirty: false, isAnalyzed: true })
        // Save via onUpdate from BlockNote will cover persistence
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
        const apiAnnotations = annotationsByBlockId[blockId] || []

        if (apiAnnotations.length > 0) {
          // Convert API annotations to our format
          const newAnnotations = apiAnnotations.map(createAnnotationFromAPI)

          // Insert annotation block after the last block in the collapsed group
          const lastBlockIdInCollapsed = collapsedBlock.collapsedIds[collapsedBlock.collapsedIds.length - 1] || collapsedBlock.id
          this.blockNoteRef.current?.insertAnnotationAfter(lastBlockIdInCollapsed, newAnnotations)

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
            className={`analyze-button ${isAnalyzing ? 'loading' : ''}`}
            onClick={this.handleAnalyzeAll}
            disabled={isAnalyzing}
          >
            {isAnalyzing ? (
              <span className="spinner">⟳</span>
            ) : (
              'Analyze'
            )}
          </button>
        </div>
        <div className="note-content-container" ref={this.contentContainerRef}>
          <BlockNoteWrapper
            ref={this.blockNoteRef}
            initialContent={Array.isArray(note.content) ? note.content : []}
            onUpdate={(blocks) => {
              this.blocks = blocks
              if (this.props.note) {
                this.props.onUpdateNote(this.props.note.id, this.state.title, blocks)
              }
            }}
            onDoubleEnter={(finishedBlockId) => {
              console.log('onDoubleEnter called', finishedBlockId)
              // Trigger analysis for the finished collapsed block
              this.triggerAnalysis(finishedBlockId)
            }}
          />
        </div>
        {isAnalyzing && (
          <div className="analysis-spinner">
            <div className="spinner-icon">⟳</div>
          </div>
        )}
      </div>
    )
  }
}

export default NoteEditor
