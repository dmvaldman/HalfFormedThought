import React, { Component, RefObject } from 'react'
// @ts-ignore - Editor.js doesn't have proper TypeScript types
import EditorJS from '@editorjs/editorjs'
import type { OutputData } from '@editorjs/editorjs'
// @ts-ignore - Editor.js paragraph tool doesn't have proper TypeScript types
import Paragraph from '@editorjs/paragraph'
import AnnotationBlock from './AnnotationBlock'
import { Note } from './types'
import { createDummyAnnotation } from './annotations'

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
        this.logBlocksForAnalyzer()
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
        this.logBlocksForAnalyzer()
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

  handleEditorKeyDown = (_event: KeyboardEvent) => {
    // Let Editor.js handle Enter normally - we'll post-process blocks for analysis
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

  collapseBlocks = (editorBlocks: any[]): Array<{id: string, text: string}> => {
    // Collapse consecutive non-empty paragraph blocks into logical blocks
    // separated by empty paragraphs
    const collapsed: Array<{id: string, text: string}> = []
    let currentText = ''
    let currentId = ''

    for (let i = 0; i < editorBlocks.length; i++) {
      const block = editorBlocks[i]

      if (block.type === 'paragraph') {
        // Strip HTML tags to get plain text
        const text = block.data.text ? block.data.text.replace(/<[^>]*>/g, '') : ''

        if (text.trim() === '') {
          // Empty block - finalize current collapsed block if any
          if (currentText.trim() !== '') {
            collapsed.push({ id: currentId, text: currentText.trim() })
            currentText = ''
            currentId = ''
          }
        } else {
          // Non-empty block - add to current collapsed block
          if (currentText === '') {
            currentId = block.id
            currentText = text
          } else {
            currentText += '\n' + text
          }
        }
      }
    }

    // Don't forget the last block
    if (currentText.trim() !== '') {
      collapsed.push({ id: currentId, text: currentText.trim() })
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
    this.setState({ isAnalyzing: true })

    // Wait 1 second, then add annotation after the specified block
    setTimeout(async () => {
      if (this.props.note && this.editorInstance && blockId) {
        const blocks = this.editorInstance.blocks

        // Get the index of the block by its ID
        const blockIndex = blocks.getBlockIndex(blockId)

        if (blockIndex >= 0) {
          const newAnnotation = createDummyAnnotation()

          // Insert the annotation block right after this block
          blocks.insert('annotation', {
            annotations: [newAnnotation],
            isExpanded: false,
          }, {}, blockIndex + 1, false)

          // Mark the block as analyzed and clean
          this.blockAnalysisStatus.set(blockId, { isDirty: false, isAnalyzed: true })

          // Save the updated data
          const updatedData = await this.editorInstance.save()
          this.props.onUpdateNote(this.props.note!.id, this.state.title, updatedData)
        }

        this.setState({ isAnalyzing: false })
      }
    }, 1000)
  }

  handleAnalyzeAll = async () => {
    if (!this.editorInstance || !this.props.note) return

    const blocks = this.editorInstance.blocks
    const blockCount = blocks.getBlocksCount()
    const blocksToAnalyze: string[] = []

    // Collect all paragraph blocks that need analysis
    for (let i = 0; i < blockCount; i++) {
      const block = blocks.getBlockByIndex(i)
      if (block?.name === 'paragraph' && block?.id && !block.isEmpty) {
        const status = this.blockAnalysisStatus.get(block.id)
        const needsAnalysis = !status || status.isDirty || !status.isAnalyzed

        if (needsAnalysis) {
          blocksToAnalyze.push(block.id)
        }
      }
    }

    // Trigger analysis for each block sequentially
    for (const blockId of blocksToAnalyze) {
      await new Promise<void>((resolve) => {
        this.setState({ isAnalyzing: true })

        setTimeout(async () => {
          if (this.props.note && this.editorInstance && blockId) {
            const blocks = this.editorInstance.blocks
            const blockIndex = blocks.getBlockIndex(blockId)

            if (blockIndex >= 0) {
              const newAnnotation = createDummyAnnotation()

              blocks.insert('annotation', {
                annotations: [newAnnotation],
                isExpanded: false,
              }, {}, blockIndex + 1, false)

              this.blockAnalysisStatus.set(blockId, { isDirty: false, isAnalyzed: true })

              const updatedData = await this.editorInstance.save()
              this.props.onUpdateNote(this.props.note!.id, this.state.title, updatedData)
            }
          }

          resolve()
        }, 1000)
      })
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
          <button className="analyze-button" onClick={this.handleAnalyzeAll}>
            Analyze
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
