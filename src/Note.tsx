import React, { Component } from 'react'
import { NoteType } from './types'
import { debounce } from './utils'

interface NoteProps {
  note: NoteType
  onUpdateTitle: (noteId: string, title: string) => void
  onUpdateContent: (noteId: string, content: string) => void
}

class Note extends Component<NoteProps> {
  private contentEditableRef = React.createRef<HTMLDivElement>()
  private initialContent: string = ''
  private debouncedContentLogger: () => void

  constructor(props: NoteProps) {
    super(props)
    // Create debounced function that logs the final content after 5 seconds of inactivity
    this.debouncedContentLogger = debounce(() => {
      if (this.contentEditableRef.current) {
        const currentContent = this.contentEditableRef.current.textContent || ''
        // Only log if content has changed from initial
        if (currentContent !== this.initialContent) {
          console.log('Content after 5 seconds:', currentContent)
          // Update initial content to current so we don't log again unless it changes
          this.initialContent = currentContent
        }
      }
    }, 5000)
  }

  componentDidMount() {
    // Set initial content when component mounts
    if (this.contentEditableRef.current) {
      const initial = this.props.note.content || ''
      this.contentEditableRef.current.textContent = initial
      this.initialContent = initial
    }
  }

  handleContentChange = () => {
    if (!this.contentEditableRef.current) return

    const content = this.contentEditableRef.current.textContent || ''

    // Call the debounced logger (will log after 5 seconds of inactivity)
    this.debouncedContentLogger()

    // Still update immediately (for saving)
    this.props.onUpdateContent(this.props.note.id, content)
  }

  handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const title = e.target.value
    this.props.onUpdateTitle(this.props.note.id, title)
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

