import React, { Component } from 'react'
import { Note } from './types'

interface EditorProps {
  note: Note | null
  onUpdateNote: (noteId: string, title: string, content: string) => void
}

class Editor extends Component<EditorProps> {
  private contentEditableRef = React.createRef<HTMLDivElement>()

  componentDidUpdate(prevProps: EditorProps) {
    // Update content when note changes
    if (this.contentEditableRef.current && this.props.note && prevProps.note?.id !== this.props.note.id) {
      this.contentEditableRef.current.textContent = this.props.note.content || ''
    }
  }

  handleContentChange = () => {
    if (!this.props.note || !this.contentEditableRef.current) return

    const content = this.contentEditableRef.current.textContent || ''
    const title = this.props.note.title || ''
    this.props.onUpdateNote(this.props.note.id, title, content)
  }

  handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!this.props.note) return

    const title = e.target.value
    const content = this.contentEditableRef.current?.textContent || ''
    this.props.onUpdateNote(this.props.note.id, title, content)
  }

  render() {
    const { note } = this.props

    if (!note) {
      return (
        <div className="editor-empty">
          <p>Select a note or create a new one</p>
        </div>
      )
    }

    return (
      <div className="editor">
        <input
          type="text"
          className="note-title-input"
          placeholder="Untitled"
          value={note.title}
          onChange={this.handleTitleChange}
        />
        <div
          ref={this.contentEditableRef}
          className="editor-content"
          contentEditable
          onInput={this.handleContentChange}
          suppressContentEditableWarning
        >
          {note.content}
        </div>
      </div>
    )
  }
}

export default Editor

