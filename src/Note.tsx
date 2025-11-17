import React, { Component } from 'react'
import { NoteType } from './types'
import { debounce } from './utils'
import { createPatch } from 'diff'

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
        console.log('Pause detected')
        const currentContent = this.contentEditableRef.current.innerText || ''
        if (currentContent !== this.initialContent) {
          // Create a readable diff with context lines
          const patch = createPatch(
            'content',
            this.initialContent,
            currentContent,
            'Original',
            'Current',
            { context: 2 } // Number of context lines before/after changes
          )

          // Remove "No newline at end of file" messages and empty lines
          const cleanedPatch = patch
            .split('\n')
            .filter(line => {
              const trimmed = line.trim()
              // Remove empty lines, "No newline" messages, and lines that are just "+" or "-" with no content
              return trimmed !== '' &&
                     !trimmed.includes('\\ No newline at end of file') &&
                     !(trimmed === '+' || trimmed === '-')
            })
            .join('\n')

          console.log('\n=== Content Diff ===')
          console.log(cleanedPatch)
          console.log('===================\n')

          this.initialContent = currentContent
        }
        else {
          console.log('No change in content')
        }
      }
    }, 2000)
  }

  componentDidMount() {
    // Set initial content when component mounts
    if (this.contentEditableRef.current) {
      const initial = this.props.note.content || ''
      this.contentEditableRef.current.innerText = initial
      this.initialContent = initial
    }
  }

  handleContentChange = () => {
    if (!this.contentEditableRef.current) return

    const content = this.contentEditableRef.current.innerText || ''

    // Call the debounced logger (will log after 5 seconds of inactivity)
    this.debouncedContentLogger()

    // Still update immediately (for saving)
    this.props.onUpdateContent(this.props.note.id, content)
  }

  handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const title = e.target.value
    this.props.onUpdateTitle(this.props.note.id, title)
  }

  handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const pastedText = e.clipboardData.getData('text/plain')
    console.log('Pasted content:', pastedText)
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
          onPaste={this.handlePaste}
          suppressContentEditableWarning
        />
      </div>
    )
  }
}

export default Note

