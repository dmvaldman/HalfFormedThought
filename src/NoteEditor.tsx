import React, { Component, RefObject } from 'react'
// @ts-ignore - Editor.js doesn't have proper TypeScript types
import EditorJS from '@editorjs/editorjs'
import type { OutputData } from '@editorjs/editorjs'
// @ts-ignore - Editor.js paragraph tool doesn't have proper TypeScript types
import Paragraph from '@editorjs/paragraph'
import AnnotationBlock from './AnnotationBlock'
import { Note } from './types'
import { createAnnotationFromAPI } from './annotations'
import { analyzeNote, analyzeBlock } from './analyzer'

interface NoteEditorProps {
  note: Note | null
  onUpdateNote: (noteId: string, title: string, content: OutputData) => void
}

interface NoteEditorState {
  title: string
  isAnalyzing: boolean
  editorReady: boolean
}

interface BlockAnalysisStatus {
  isDirty: boolean
  isAnalyzed: boolean
}

class NoteEditor extends Component<NoteEditorProps, NoteEditorState> {
  private titleTextareaRef: RefObject<HTMLTextAreaElement | null>
  private contentContainerRef: RefObject<HTMLDivElement | null>
  private editorRef: RefObject<HTMLDivElement | null>
  private editorInstance: EditorJS | null = null
  private blockAnalysisStatus: Map<string, BlockAnalysisStatus> = new Map()

  constructor(props: NoteEditorProps) {
    super(props)
    this.titleTextareaRef = React.createRef<HTMLTextAreaElement>()
    this.contentContainerRef = React.createRef<HTMLDivElement>()
    this.editorRef = React.createRef<HTMLDivElement>()
    this.state = {
      title: props.note?.title || '',
      isAnalyzing: false,
      editorReady: false,
    }
  }

  componentDidMount() {
    this.initializeEditor()
  }

  componentDidUpdate(prevProps: NoteEditorProps) {
    if (prevProps.note?.id !== this.props.note?.id) {
      // Clear analysis status when switching notes
      this.blockAnalysisStatus.clear()

      this.destroyEditor().then(() => {
        this.setState({
          title: this.props.note?.title || '',
          isAnalyzing: false,
          editorReady: false,
        })
        this.initializeEditor()
      })
    }

    if (this.titleTextareaRef.current) {
      this.titleTextareaRef.current.style.height = 'auto'
      this.titleTextareaRef.current.style.height = `${this.titleTextareaRef.current.scrollHeight}px`
    }
  }

  componentWillUnmount() {
    this.destroyEditor()
  }


  initializeEditor = async () => {
    if (!this.editorRef.current || !this.props.note) return

    // Ensure any previous instance is destroyed and the container is clean
    if (this.editorInstance) {
      await this.destroyEditor()
    }

    const initialData = this.props.note.content?.blocks
      ? this.props.note.content
      : { blocks: [] }

    // Override Paragraph's validate method to preserve empty blocks
    const ParagraphWithValidation = class extends (Paragraph as any) {
      static get toolbox() {
        return {
          title: 'Paragraph (Custom)',
          icon: '¶'
        }
      }

      validate() {
        return true
      }

      static get pasteConfig() {
        return {
          tags: ['P', 'DIV', 'BR']
        }
      }

      onPaste(event: any) {
        const content = event.detail.data
        if (content.textContent) {
          this.data = { text: content.textContent }
        }
      }
    }

    this.editorInstance = new EditorJS({
      holder: 'editorjs-holder',
      placeholder: '',
      autofocus: true,
      data: initialData,
      tools: {
        paragraph: {
          class: ParagraphWithValidation as any,
          inlineToolbar: false,
        },
        annotation: {
          class: AnnotationBlock as any,
        },
      },
      onReady: () => {
        this.setState({ editorReady: true })
        // Attach keydown listener to the editor
        if (this.editorRef.current) {
          this.editorRef.current.addEventListener('keydown', this.handleEditorKeyDown)
          this.editorRef.current.addEventListener('paste', this.handlePaste)
        }
        // Log blocks for analyzer
        // this.logBlocksForAnalyzer()
      },
      onChange: async (api, event) => {
        const editorData = await api.saver.save()

        // Handle event tracking (event can be single or array)
        const events = Array.isArray(event) ? event : (event ? [event] : [])

        events.forEach((evt: any) => {
          // Mark changed blocks as dirty
          if (evt?.type === 'block-changed' && evt?.detail?.target?.id) {
            const blockId = evt.detail.target.id
            const status = this.blockAnalysisStatus.get(blockId)
            if (status) {
              status.isDirty = true
            } else {
              this.blockAnalysisStatus.set(blockId, { isDirty: true, isAnalyzed: false })
            }
          }

          // Track new blocks as dirty and unanalyzed
          if (evt?.type === 'block-added' && evt?.detail?.target?.id) {
            const blockId = evt.detail.target.id
            this.blockAnalysisStatus.set(blockId, { isDirty: true, isAnalyzed: false })
          }
        })

        if (this.props.note) {
          this.props.onUpdateNote(this.props.note.id, this.state.title, editorData)
        }

        // Log blocks for analyzer
        // this.logBlocksForAnalyzer()
      },
    })
  }

  destroyEditor = async () => {
    if (this.editorRef.current) {
      this.editorRef.current.removeEventListener('keydown', this.handleEditorKeyDown)
      this.editorRef.current.removeEventListener('paste', this.handlePaste)
    }
    if (this.editorInstance) {
      try {
        await this.editorInstance.isReady
        this.editorInstance.destroy()
      } catch (error) {
        console.warn('Editor destroy error:', error)
      }
      this.editorInstance = null
    }
  }

  handleEditorKeyDown = async (event: KeyboardEvent) => {
    // Trigger analysis when Enter is pressed and a new paragraph block is created
    if (event.key === 'Enter' && this.editorInstance) {
      // Wait a bit for Editor.js to process the Enter key
      if (!this.editorInstance) return

      const editorData = await this.editorInstance.save()

      const blocks = this.editorInstance.blocks
      const currentBlockIndex = blocks.getCurrentBlockIndex()

      // Get the previous block (the one we just left)
      if (currentBlockIndex > 2) {
        const previousBlock = blocks.getBlockByIndex(currentBlockIndex - 1)
        const previousPreviousBlock = blocks.getBlockByIndex(currentBlockIndex - 2)

        // Get the block data from saved editor data for debugging
        const previousBlockData = editorData.blocks.find((b: any) => b.id === previousBlock?.id)
        const previousPreviousBlockData = editorData.blocks.find((b: any) => b.id === previousPreviousBlock?.id)

        console.log('Previous block:', {
          id: previousBlockData?.id,
          type: previousBlockData?.type,
          text: previousBlockData?.data?.text
        })

        console.log('Previous previous block:', {
          id: previousPreviousBlockData?.id,
          type: previousPreviousBlockData?.type,
          text: previousPreviousBlockData?.data?.text
        })

        // Only analyze if it's a paragraph block that's empty and the previous block is not empty
        if (previousPreviousBlock?.name === 'paragraph' && previousBlock?.isEmpty && !previousPreviousBlock?.isEmpty) {
          // Find which collapsed block contains this previous block
          const paragraphBlocks = editorData.blocks.filter((block: any) => block.type === 'paragraph')
          const collapsedBlocks = this.collapseBlocks(paragraphBlocks)

          // Find the collapsed block that contains the previous block's ID
          const collapsedBlock = collapsedBlocks.find(cb =>
            cb.collapsedIds.includes(previousPreviousBlock.id)
          )

          console.log('Collapsed block containing previous block:', collapsedBlock)

          if (collapsedBlock) {
            const collapsedBlockId = collapsedBlock.id
            const status = this.blockAnalysisStatus.get(collapsedBlockId)
            const needsAnalysis = !status || status.isDirty || !status.isAnalyzed

            // TODO: dirty checking immplement later

            if (needsAnalysis) {
              await this.triggerAnalysis(collapsedBlockId)
            }
            else {
              await this.triggerAnalysis(collapsedBlockId)
            }
          }
        }
      }
    }
  }

  handlePaste = async (event: ClipboardEvent) => {
    event.preventDefault()

    const text = event.clipboardData?.getData('text/plain')
    if (!text || !this.editorInstance) return

    // Split by line breaks and create blocks for each line (including empty ones)
    const lines = text.split('\n')
    const currentBlockIndex = this.editorInstance.blocks.getCurrentBlockIndex()

    // Delete the current block (we'll replace it with pasted content)
    this.editorInstance.blocks.delete(currentBlockIndex)

    // Insert blocks for each line
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      this.editorInstance.blocks.insert('paragraph', { text: line }, {}, currentBlockIndex + i, i === 0)
    }
  }

  collapseBlocks = (editorBlocks: any[]): Array<{id: string, text: string, collapsedIds: string[]}> => {
    // Collapse consecutive non-empty paragraph blocks into logical blocks
    // separated by empty paragraphs
    const collapsed: Array<{id: string, text: string, collapsedIds: string[]}> = []
    let currentText = ''
    let currentId = ''
    let currentIds: string[] = []

    for (let i = 0; i < editorBlocks.length; i++) {
      const block = editorBlocks[i]

      if (block.type === 'paragraph') {
        // Strip HTML tags to get plain text
        const text = block.data.text ? block.data.text.replace(/<[^>]*>/g, '') : ''

        if (text.trim() === '') {
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

  logBlocksForAnalyzer = async () => {
    if (!this.editorInstance) return

    try {
      const editorData = await this.editorInstance.save()
      const paragraphBlocks = editorData.blocks.filter((block: any) => block.type === 'paragraph')
      const blocksForAnalyzer = this.collapseBlocks(paragraphBlocks)

      if (blocksForAnalyzer.length > 0) {
        console.log('Blocks for analyzer:')
        console.log(JSON.stringify(blocksForAnalyzer, null, 2))
      }
    } catch (error) {
      // Silently fail if editor isn't ready
    }
  }

  handleTitleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const title = e.target.value
    this.setState({ title })
    e.target.style.height = 'auto'
    e.target.style.height = `${e.target.scrollHeight}px`
    if (this.props.note && this.editorInstance) {
      this.editorInstance.save().then((editorData) => {
        this.props.onUpdateNote(this.props.note!.id, title, editorData)
      })
    }
  }

  triggerAnalysis = async (blockId: string) => {
    if (!this.editorInstance || !this.props.note) return

    this.setState({ isAnalyzing: true })

    try {
      const editorData = await this.editorInstance.save()
      const paragraphBlocks = editorData.blocks.filter((block: any) => block.type === 'paragraph')
      const collapsedBlocks = this.collapseBlocks(paragraphBlocks)

      // Find the block data for debugging
      const blockData = paragraphBlocks.find((b: any) => b.id === blockId)
      console.log('Block data (from editorData):', {
        id: blockData?.id,
        type: blockData?.type,
        text: blockData?.data?.text
      })
      console.log('Collapsed blocks:', collapsedBlocks)

      // Find the collapsed block that contains this blockId
      const currentBlock = collapsedBlocks.find(b =>
        b.id === blockId || b.collapsedIds.includes(blockId)
      )
      console.log('Current collapsed block:', currentBlock)

      if (!currentBlock) {
        console.log('No collapsed block found for blockId:', blockId)
        this.setState({ isAnalyzing: false })
        return
      }

      // Get existing annotations for this block (if any)
      const blocks = this.editorInstance.blocks
      // Find the last block ID in the collapsed block's collapsedIds array
      const lastBlockIdInCollapsed = currentBlock.collapsedIds[currentBlock.collapsedIds.length - 1]
      const lastBlockIndex = blocks.getBlockIndex(lastBlockIdInCollapsed)
      let existingAnnotations: any[] = []

      if (lastBlockIndex >= 0) {
        // Check if there's an annotation block right after the last block in the collapsed group
        const nextBlockIndex = lastBlockIndex + 1
        if (nextBlockIndex < editorData.blocks.length) {
          const nextBlock = editorData.blocks[nextBlockIndex]
          if (nextBlock.type === 'annotation') {
            existingAnnotations = nextBlock.data.annotations || []
          }
        }
      }

      // Call analyzeBlock
      const apiAnnotations = await analyzeBlock(collapsedBlocks, currentBlock, existingAnnotations)

      if (apiAnnotations.length > 0) {
        const newAnnotations = apiAnnotations.map(createAnnotationFromAPI)

        if (lastBlockIndex >= 0) {
          // Check if there's already an annotation block after the last block in the collapsed group
          const annotationBlockIndex = lastBlockIndex + 1
          const nextBlock = editorData.blocks[annotationBlockIndex]

          if (nextBlock && nextBlock.type === 'annotation') {
            // Update existing annotation block
            const existingBlock = blocks.getBlockByIndex(annotationBlockIndex)
            if (existingBlock) {
              // Merge with existing annotations
              const allAnnotations = [...existingAnnotations, ...newAnnotations]
              blocks.update(existingBlock.id, {
                annotations: allAnnotations,
                isExpanded: nextBlock.data.isExpanded || false,
              })
            }
          } else {
            // Insert new annotation block after the last block in the collapsed group
            blocks.insert('annotation', {
              annotations: newAnnotations,
              isExpanded: false,
            }, {}, annotationBlockIndex, false)
          }

          // Mark the block as analyzed and clean (use the collapsed block's ID)
          this.blockAnalysisStatus.set(currentBlock.id, { isDirty: false, isAnalyzed: true })

          // Save the updated data
          const updatedData = await this.editorInstance.save()
          this.props.onUpdateNote(this.props.note!.id, this.state.title, updatedData)
        }
      }
    } catch (error) {
      console.error('Error analyzing block:', error)
    }

    this.setState({ isAnalyzing: false })
  }

  handleAnalyzeAll = async () => {
    if (!this.editorInstance || !this.props.note) return

    this.setState({ isAnalyzing: true })

    try {
      const editorData = await this.editorInstance.save()
      const paragraphBlocks = editorData.blocks.filter((block: any) => block.type === 'paragraph')
      const collapsedBlocks = this.collapseBlocks(paragraphBlocks)

      if (collapsedBlocks.length === 0) {
        this.setState({ isAnalyzing: false })
        return
      }

      // Call analyzeNote to get annotations for all blocks
      const annotationsByBlockId = await analyzeNote(collapsedBlocks)

      // Insert annotation blocks for each block that has annotations
      const blocks = this.editorInstance.blocks

      for (const collapsedBlock of collapsedBlocks) {
        const blockId = collapsedBlock.id
        const apiAnnotations = annotationsByBlockId[blockId] || []

        if (apiAnnotations.length > 0) {
          const blockIndex = blocks.getBlockIndex(blockId)
          if (blockIndex >= 0) {
            // Convert API annotations to our format
            const newAnnotations = apiAnnotations.map(createAnnotationFromAPI)

            // Check if there's already an annotation block after this block
            let annotationBlockIndex = blockIndex + 1
            const nextBlock = editorData.blocks[annotationBlockIndex]
            if (nextBlock && nextBlock.type === 'annotation') {
              // Update existing annotation block
              const existingBlock = blocks.getBlockByIndex(annotationBlockIndex)
              if (existingBlock) {
                // Merge with existing annotations
                const existingAnnotations = (nextBlock.data.annotations || []) as any[]
                const allAnnotations = [...existingAnnotations, ...newAnnotations]
                blocks.update(existingBlock.id, {
                  annotations: allAnnotations,
                  isExpanded: nextBlock.data.isExpanded || false,
                })
              }
            } else {
              // Insert new annotation block
              blocks.insert('annotation', {
                annotations: newAnnotations,
                isExpanded: false,
              }, {}, annotationBlockIndex, false)
            }

            // Mark the block as analyzed and clean
            this.blockAnalysisStatus.set(blockId, { isDirty: false, isAnalyzed: true })
          }
        }
      }

      // Save the updated data
      const updatedData = await this.editorInstance.save()
      this.props.onUpdateNote(this.props.note!.id, this.state.title, updatedData)
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
          <div id="editorjs-holder" ref={this.editorRef} className="editorjs-container"></div>
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
