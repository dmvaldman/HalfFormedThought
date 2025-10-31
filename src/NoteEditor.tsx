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

class NoteEditor extends Component<NoteEditorProps, NoteEditorState> {
  private titleTextareaRef: RefObject<HTMLTextAreaElement | null>
  private contentContainerRef: RefObject<HTMLDivElement | null>
  private editorRef: RefObject<HTMLDivElement | null>
  private editorInstance: EditorJS | null = null

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

    this.editorInstance = new EditorJS({
      holder: 'editorjs-holder',
      placeholder: 'Start writing...',
      data: initialData,
      tools: {
        paragraph: {
          class: Paragraph as any,
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
        }
      },
      onChange: async (api) => {
        const editorData = await api.saver.save()
        if (this.props.note) {
          this.props.onUpdateNote(this.props.note.id, this.state.title, editorData)
        }
      },
    })
  }

  destroyEditor = async () => {
    if (this.editorRef.current) {
      this.editorRef.current.removeEventListener('keydown', this.handleEditorKeyDown)
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

  handleEditorKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      // EditorJS has already created the new block, so get the previous one
      const currentBlockIndex = this.editorInstance?.blocks.getCurrentBlockIndex()
      if (currentBlockIndex !== undefined && currentBlockIndex > 0) {
        const previousBlock = this.editorInstance?.blocks.getBlockByIndex(currentBlockIndex - 1)
        if (previousBlock?.name === 'paragraph' && previousBlock?.id && !previousBlock.isEmpty) {
          this.triggerAnalysis(previousBlock.id)
        }
      }
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
          }, {}, blockIndex + 1, true)

          // Save the updated data
          const updatedData = await this.editorInstance.save()
          this.props.onUpdateNote(this.props.note!.id, this.state.title, updatedData)
        }

        this.setState({ isAnalyzing: false })
      }
    }, 1000)
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
