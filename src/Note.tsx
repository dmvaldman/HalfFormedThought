import React, { Component } from 'react'
import { NoteType, TextSpanAnnotation } from './types'
import { debounce } from './utils'
import { createPatch } from 'diff'
import { Analyzer } from './analyzer'
import Annotation from './Annotation'

interface NoteProps {
  note: NoteType
  onUpdateTitle: (noteId: string, title: string) => void
  onUpdateContent: (noteId: string, content: string) => void
}

interface NoteState {
  annotations: TextSpanAnnotation[]
}

class Note extends Component<NoteProps, NoteState> {
  private contentEditableRef = React.createRef<HTMLDivElement>()
  private initialContent: string = ''
  private analyzer: Analyzer
  private debouncedContentLogger: () => void

  constructor(props: NoteProps) {
    super(props)
    this.state = {
      annotations: []
    }
    // Initialize analyzer for this note
    this.analyzer = new Analyzer(props.note.id)

    // Create debounced version of contentLogger
    this.debouncedContentLogger = debounce(this.contentLogger.bind(this), 2000)
  }


  getContent(): string {
    return this.contentEditableRef.current?.innerText || ''
  }

  private getDiff(initialContent: string, currentContent: string): string {
    // Create a readable diff with context lines
    const patch = createPatch(
      'content',
      initialContent,
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
               !trimmed.includes('\\ No newline at end of file')
      })
      .join('\n')

    return cleanedPatch
  }

  private contentLogger = () => {
    if (!this.contentEditableRef.current) return

    console.log('Pause detected')

    const currentContent = this.getContent()
    if (currentContent !== this.initialContent) {
      const diff = this.getDiff(this.initialContent, currentContent)

      console.log('\n=== Content Diff ===')
      console.log(diff)
      console.log('===================\n')

      // Analyze the content change
      this.analyzer.analyze(this.initialContent, diff, this.getContent.bind(this))
        .then((result) => {
          if (result) {
            this.setState({ annotations: result })
          }
        })

      this.initialContent = currentContent
    }
    else {
      console.log('No change in content')
    }
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

    const content = this.getContent()

    // Call the debounced logger (will log after 2 seconds of inactivity)
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

  renderAnnotations() {
    const content = this.getContent()
    if (this.state.annotations.length === 0) {
      return null
    }

    // Build array of text segments and annotation components
    const segments: (string | React.ReactElement)[] = []
    let lastIndex = 0
    let key = 0

    this.state.annotations.forEach((textSpanAnnotation) => {
      const { textSpan } = textSpanAnnotation
      const index = content.indexOf(textSpan, lastIndex)

      if (index !== -1) {
        // Add text before the annotation
        if (index > lastIndex) {
          segments.push(content.substring(lastIndex, index))
        }

        // Add the annotation component
        segments.push(
          <Annotation
            key={key++}
            textSpan={textSpan}
            annotations={textSpanAnnotation.annotations}
            content={content}
          />
        )

        lastIndex = index + textSpan.length
      }
    })

    // Add remaining text
    if (lastIndex < content.length) {
      segments.push(content.substring(lastIndex))
    }

    return segments.length > 0 ? segments : content
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
        <div className="editor-content-wrapper">
          <div
            ref={this.contentEditableRef}
            className="editor-content"
            contentEditable
            onInput={this.handleContentChange}
            onPaste={this.handlePaste}
            suppressContentEditableWarning
          />
          {/* Annotations overlay - mirrors content with annotations */}
          {this.state.annotations.length > 0 && (
            <div className="annotations-overlay">
              {this.renderAnnotations()}
            </div>
          )}
        </div>
      </div>
    )
  }
}

export default Note

