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
  openAnnotationIndex: number | null
  content: string
}

class Note extends Component<NoteProps, NoteState> {
  private contentEditableRef = React.createRef<HTMLDivElement>()
  private annotationLayerRef = React.createRef<HTMLDivElement>()
  private initialContent: string = ''
  private analyzer: Analyzer
  private debouncedContentLogger: () => void
  private hasRunInitialAnalysis = false

  constructor(props: NoteProps) {
    super(props)
    this.state = {
      annotations: [],
      openAnnotationIndex: null,
      content: props.note.content || ''
    }
    // Initialize analyzer for this note
    this.analyzer = new Analyzer(props.note.id)

    // Create debounced version of contentLogger
    this.debouncedContentLogger = debounce(this.contentLogger.bind(this), 2000)
  }

  componentDidMount() {
    // Set initial content when component mounts
    if (this.contentEditableRef.current) {
      const initial = this.props.note.content || ''
      this.setContent(initial)
      this.initialContent = initial
      this.maybeAnalyzePrefilledContent(initial)
    }
  }

  componentDidUpdate(prevProps: NoteProps) {
    // If we switched notes, reset content + annotations and rehydrate the editor
    if (prevProps.note.id !== this.props.note.id) {
      const initial = this.props.note.content || ''
      this.setContent(initial)
      this.initialContent = initial
      this.hasRunInitialAnalysis = false
      this.setState({
        content: initial,
        annotations: [],
        openAnnotationIndex: null
      })
      this.maybeAnalyzePrefilledContent(initial)
    }
  }

  shouldComponentUpdate(nextProps: NoteProps, nextState: NoteState) {
    // Avoid rerendering the contentEditable on each keystroke; only rerender when
    // note identity changes or annotation-related state changes.
    if (nextProps.note.id !== this.props.note.id) return true
    if (nextState.annotations !== this.state.annotations) return true
    if (nextState.openAnnotationIndex !== this.state.openAnnotationIndex) return true
    if (nextState.content !== this.state.content) return true
    return false
  }

  private maybeAnalyzePrefilledContent(initial: string) {
    if (this.hasRunInitialAnalysis) return
    if (!initial.trim()) return
    this.hasRunInitialAnalysis = true
    // Force the diff logic to treat the current content as newly added text.
    this.initialContent = ''
    this.contentLogger()
  }

  getContent(): string {
    return this.contentEditableRef.current?.innerText || ''
  }

  setContent(content: string) {
    if (this.contentEditableRef.current) {
      this.contentEditableRef.current.innerText = content
    }
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

  private contentLogger = async () => {
    if (!this.contentEditableRef.current) return

    console.log('Pause detected')

    const currentContent = this.getContent()
    if (currentContent !== this.initialContent) {
      const diff = this.getDiff(this.initialContent, currentContent)

      // Analyze the content change
      const annotations = await this.analyzer.analyze(this.initialContent, diff, this.getContent.bind(this), this.props.note.title)

      if (annotations) {
        // Add the new annotations to the existing annotations
        const newAnnotations = [...this.state.annotations, ...annotations]
        this.setState({ annotations: newAnnotations })
      }

      this.initialContent = currentContent
    }
  }

  handleContentChange = () => {
    if (!this.contentEditableRef.current) return

    const content = this.getContent()
    this.setState({ content })

    // Call the debounced logger (will log after 2 seconds of inactivity)
    this.debouncedContentLogger()

    // Still update immediately (for saving)
    this.props.onUpdateContent(this.props.note.id, content)
  }

  handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const title = e.target.value
    this.props.onUpdateTitle(this.props.note.id, title)
  }

  handleAnnotationPopupOpen = (index: number) => {
    this.setState({ openAnnotationIndex: index })
  }

  handleAnnotationPopupClose = (index: number) => {
    if (this.state.openAnnotationIndex === index) {
      this.setState({ openAnnotationIndex: null })
    }
  }

  handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    // const pastedText = e.clipboardData.getData('text/plain')
    // console.log('Pasted content:', pastedText)
  }

  // Render an overlay copy of the content with annotation spans so the editable
  // DOM stays untouched (prevents cursor jumps/reflow).
  renderAnnotationOverlay() {
    const content = this.state.content
    if (this.state.annotations.length === 0) {
      return null
    }
    const getPortalRoot = () => this.annotationLayerRef.current

    // Build array of text segments and annotation components
    const segments: (string | React.ReactElement)[] = []
    let lastIndex = 0

    this.state.annotations.forEach((textSpanAnnotation, annotationIndex) => {
      const { textSpan, annotations } = textSpanAnnotation
      const index = content.indexOf(textSpan, lastIndex)

      if (index !== -1) {
        // Add text before the annotation
        if (index > lastIndex) {
          segments.push(content.substring(lastIndex, index))
        }

        // Add the annotation component wrapping the text span
        segments.push(
          <Annotation
            key={annotationIndex}
            textSpan={textSpan}
            annotations={annotations}
            isVisible={this.state.openAnnotationIndex === annotationIndex}
            annotationId={annotationIndex}
            onPopupOpen={() => this.handleAnnotationPopupOpen(annotationIndex)}
            onPopupClose={this.handleAnnotationPopupClose}
            getPortalRoot={getPortalRoot}
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
            ref={this.annotationLayerRef}
            className="annotation-layer"
            aria-hidden
          >
            <div className="annotation-overlay-content">
              {this.renderAnnotationOverlay()}
            </div>
          </div>
          <div
            ref={this.contentEditableRef}
            className="editor-content"
            contentEditable
            onInput={this.handleContentChange}
            onPaste={this.handlePaste}
            suppressContentEditableWarning
          />
        </div>
      </div>
    )
  }
}

export default Note
