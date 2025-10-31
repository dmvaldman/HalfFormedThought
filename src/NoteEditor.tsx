import React, { Component, RefObject } from 'react'
// @ts-ignore - Editor.js doesn't have proper TypeScript types
import EditorJS from '@editorjs/editorjs'
import type { OutputData } from '@editorjs/editorjs'
// @ts-ignore - Editor.js paragraph tool doesn't have proper TypeScript types
import Paragraph from '@editorjs/paragraph'
import { Note, ContentBlock } from './types'
import AnnotationBar from './AnnotationBar'
import { createDummyAnnotation } from './annotations'

interface NoteEditorProps {
  note: Note | null
  onUpdateNote: (noteId: string, title: string, content: ContentBlock[]) => void
}

interface NoteEditorState {
  title: string
  expandedBlocks: Set<number> // Track which annotation bars are expanded
  isAnalyzing: boolean
  editorReady: boolean
}

class NoteEditor extends Component<NoteEditorProps, NoteEditorState> {
  private titleTextareaRef: RefObject<HTMLTextAreaElement | null>
  private contentContainerRef: RefObject<HTMLDivElement | null>
  private editorRef: RefObject<HTMLDivElement | null>
  private editorInstance: EditorJS | null = null
  private lastBlockCount: number = 0

  constructor(props: NoteEditorProps) {
    super(props)
    this.titleTextareaRef = React.createRef<HTMLTextAreaElement>()
    this.contentContainerRef = React.createRef<HTMLDivElement>()
    this.editorRef = React.createRef<HTMLDivElement>()
    this.state = {
      title: props.note?.title || '',
      expandedBlocks: new Set(),
      isAnalyzing: false,
      editorReady: false,
    }
  }

  componentDidMount() {
    this.initializeEditor()
  }

  componentDidUpdate(prevProps: NoteEditorProps) {
    if (prevProps.note?.id !== this.props.note?.id) {
      this.destroyEditor().then(() => {
        this.setState({
          title: this.props.note?.title || '',
          expandedBlocks: new Set(),
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

  convertEditorJSDataToContentBlocks = (editorData: OutputData): ContentBlock[] => {
    if (!editorData.blocks) return []

    const noteContent = this.props.note?.content || []

    return editorData.blocks.map((block, index) => {
      // Try to preserve existing annotations if the text matches
      const existingBlock = noteContent[index]
      if (existingBlock && block.type === 'paragraph' && existingBlock.text === block.data.text) {
        return existingBlock
      }

      return {
        text: block.type === 'paragraph' ? block.data.text : '',
        annotations: [],
      }
    })
  }

  convertContentBlocksToEditorJSData = (contentBlocks: ContentBlock[]): OutputData => {
    return {
      blocks: contentBlocks.map((block) => ({
        type: 'paragraph',
        data: {
          text: block.text,
        },
      })),
    }
  }

  initializeEditor = async () => {
    if (!this.editorRef.current || !this.props.note) return

    const contentBlocks = this.props.note.content.length > 0
      ? this.props.note.content
      : [{ text: '', annotations: [] }]

    const initialData = this.convertContentBlocksToEditorJSData(contentBlocks)
    this.lastBlockCount = contentBlocks.length

    this.editorInstance = new EditorJS({
      holder: this.editorRef.current,
      placeholder: 'Start writing...',
      data: initialData,
      tools: {
        paragraph: {
          class: Paragraph as any,
          inlineToolbar: false,
        },
      },
      onReady: () => {
        this.setState({ editorReady: true })
      },
      onChange: async (api) => {
        const editorData = await api.saver.save()
        const contentBlocks = this.convertEditorJSDataToContentBlocks(editorData)

        // Check if a new block was added (trigger analysis)
        if (editorData.blocks && editorData.blocks.length > this.lastBlockCount) {
          const newBlockIndex = editorData.blocks.length - 1
          this.triggerAnalysis(contentBlocks, newBlockIndex)
          this.lastBlockCount = editorData.blocks.length
        }

        if (this.props.note) {
          this.props.onUpdateNote(this.props.note.id, this.state.title, contentBlocks)
        }
      },
    })
  }

  destroyEditor = async () => {
    if (this.editorInstance) {
      try {
        await this.editorInstance.isReady
        if (this.editorInstance && typeof this.editorInstance.destroy === 'function') {
          this.editorInstance.destroy()
        }
      } catch (error) {
        console.warn('Editor destroy error:', error)
      }
      this.editorInstance = null
    }
  }

  handleTitleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const title = e.target.value
    this.setState({ title })
    e.target.style.height = 'auto'
    e.target.style.height = `${e.target.scrollHeight}px`
    if (this.props.note && this.editorInstance) {
      this.editorInstance.save().then((editorData) => {
        const contentBlocks = this.convertEditorJSDataToContentBlocks(editorData)
        this.props.onUpdateNote(this.props.note!.id, title, contentBlocks)
      })
    }
  }

  triggerAnalysis = async (contentBlocks: ContentBlock[], blockIndex: number) => {
    this.setState({ isAnalyzing: true })

    // Wait 1 second, then add annotation to the specified block
    setTimeout(() => {
      if (this.props.note && blockIndex >= 0 && blockIndex < contentBlocks.length) {
        const updatedBlocks = [...contentBlocks]
        updatedBlocks[blockIndex] = {
          ...updatedBlocks[blockIndex],
          annotations: [...updatedBlocks[blockIndex].annotations, createDummyAnnotation()],
        }

        this.props.onUpdateNote(this.props.note!.id, this.state.title, updatedBlocks)
        this.setState({ isAnalyzing: false })
      }
    }, 1000)
  }

  handleToggleAnnotation = (blockIndex: number) => {
    // Save scroll position before state update
    const container = this.contentContainerRef.current
    const scrollTop = container?.scrollTop || 0

    const expandedBlocks = new Set(this.state.expandedBlocks)
    if (expandedBlocks.has(blockIndex)) {
      expandedBlocks.delete(blockIndex)
    } else {
      expandedBlocks.add(blockIndex)
    }
    this.setState({ expandedBlocks }, () => {
      // Restore scroll position after state update
      if (container) {
        container.scrollTop = scrollTop
      }
    })
  }

  handleDeleteAnnotation = (blockIndex: number, annotationId: string) => {
    if (!this.props.note) return

    const updatedBlocks = [...this.props.note.content]
    updatedBlocks[blockIndex] = {
      ...updatedBlocks[blockIndex],
      annotations: updatedBlocks[blockIndex].annotations.filter((a) => a.id !== annotationId),
    }

    this.props.onUpdateNote(this.props.note.id, this.state.title, updatedBlocks)
  }

  render() {
    const { note } = this.props
    const { title, expandedBlocks, isAnalyzing, editorReady } = this.state

    if (!note) {
      return (
        <div className="note-editor empty">
          <div className="empty-state">Select a note or create a new one</div>
        </div>
      )
    }

    const contentBlocks = note.content.length > 0 ? note.content : [{ text: '', annotations: [] }]

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
        </div>
        <div className="note-content-container" ref={this.contentContainerRef}>
          <div ref={this.editorRef} className="editorjs-container"></div>
          {editorReady && contentBlocks.map((block, index) =>
            block.annotations.length > 0 ? (
              <AnnotationBar
                key={index}
                annotations={block.annotations}
                isExpanded={expandedBlocks.has(index)}
                onToggle={() => this.handleToggleAnnotation(index)}
                onDeleteAnnotation={(annotationId) => this.handleDeleteAnnotation(index, annotationId)}
              />
            ) : null
          )}
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
