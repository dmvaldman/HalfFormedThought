import React, { Component, RefObject } from 'react'
import { Note } from './types'

interface NoteEditorProps {
  note: Note | null
  onUpdateNote: (noteId: string, title: string, content: string) => void
}

interface NoteEditorState {
  title: string
  content: string
}

class NoteEditor extends Component<NoteEditorProps, NoteEditorState> {
  private titleTextareaRef: RefObject<HTMLTextAreaElement | null>
  private contentTextareaRef: RefObject<HTMLTextAreaElement | null>

  constructor(props: NoteEditorProps) {
    super(props)
    this.titleTextareaRef = React.createRef<HTMLTextAreaElement>()
    this.contentTextareaRef = React.createRef<HTMLTextAreaElement>()
    this.state = {
      title: props.note?.title || '',
      content: props.note?.content || '',
    }
  }

  componentDidUpdate(prevProps: NoteEditorProps) {
    if (prevProps.note?.id !== this.props.note?.id) {
      this.setState({
        title: this.props.note?.title || '',
        content: this.props.note?.content || '',
      })
    }
    // Auto-resize textareas
    this.resizeTextareas()
  }

  componentDidMount() {
    // Auto-resize textareas on mount
    this.resizeTextareas()
  }

  resizeTextareas = () => {
    if (this.titleTextareaRef.current) {
      this.titleTextareaRef.current.style.height = 'auto'
      this.titleTextareaRef.current.style.height = `${this.titleTextareaRef.current.scrollHeight}px`
    }
    if (this.contentTextareaRef.current) {
      this.contentTextareaRef.current.style.height = 'auto'
      this.contentTextareaRef.current.style.height = `${this.contentTextareaRef.current.scrollHeight}px`
    }
  }

  handleTitleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const title = e.target.value
    this.setState({ title })
    // Auto-resize
    e.target.style.height = 'auto'
    e.target.style.height = `${e.target.scrollHeight}px`
    if (this.props.note) {
      this.props.onUpdateNote(this.props.note.id, title, this.state.content)
    }
  }

  handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const content = e.target.value
    this.setState({ content })
    // Auto-resize
    e.target.style.height = 'auto'
    e.target.style.height = `${e.target.scrollHeight}px`
    if (this.props.note) {
      this.props.onUpdateNote(this.props.note.id, this.state.title, content)
    }
  }

  render() {
    const { note } = this.props
    const { title, content } = this.state

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
        <div className="note-content-container">
          <textarea
            ref={this.contentTextareaRef}
            className="note-content-input"
            value={content}
            onChange={this.handleContentChange}
            placeholder="Start writing..."
          />
        </div>
      </div>
    )
  }
}

export default NoteEditor

