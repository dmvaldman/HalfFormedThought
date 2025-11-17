import React, { Component } from 'react'
import { NoteType } from './types'

interface NoteProps {
  note: NoteType
  onUpdate: (noteId: string, title: string, content: string) => void
}

class Note extends Component<NoteProps> {
  private contentEditableRef = React.createRef<HTMLDivElement>()

  componentDidMount() {
    // Set initial content when component mounts
    if (this.contentEditableRef.current) {
      this.contentEditableRef.current.textContent = this.props.note.content || ''
    }
  }

  handleContentChange = () => {
    if (!this.contentEditableRef.current) return

    const content = this.contentEditableRef.current.textContent || ''
    const title = this.props.note.title || ''
    this.props.onUpdate(this.props.note.id, title, content)
  }

  handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const title = e.target.value
    const content = this.contentEditableRef.current?.textContent || ''
    this.props.onUpdate(this.props.note.id, title, content)
  }

  render() {
    const { note } = this.props

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
        />
      </div>
    )
  }
}

export default Note

