import React, { Component } from 'react'
import { EditorContent, useEditor, Editor as TiptapEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { AnnotationMark } from './AnnotationMark'
import { NoteType, ReferenceAnnotation, ListAnnotation, ConnectionAnnotation, TextSpanAnnotation, Checkpoint, getTextSpans } from './types'
import { debounce } from './utils'
import { createPatch } from 'diff'
import { Analyzer, AnnotationResult } from './analyzer'
import { CheckpointManager } from './CheckpointManager'
import { AnnotationPopup } from './AnnotationPopup'
import ReferenceAnnotationContent from './ReferenceAnnotation'
import ListAnnotationContent from './ListAnnotation'
import ConnectionLines from './ConnectionLines'

// TipTap Editor Wrapper Component (functional component to use hooks)
interface TipTapEditorWrapperProps {
  initialContent: string
  onEditorReady: (editor: TiptapEditor) => void
  onUpdate: () => void
  onMarkClick?: (annotationId: string, position: { top: number; left: number }) => void
}

// Helper to convert plain text newlines to HTML breaks for TipTap
const convertNewlinesToBreaks = (text: string): string => {
  return text.replace(/\n/g, '<br>')
}

const TipTapEditorWrapper: React.FC<TipTapEditorWrapperProps> = ({ initialContent, onEditorReady, onUpdate, onMarkClick }) => {
  const editorRef = React.useRef<TiptapEditor | null>(null)

  const editor = useEditor({
    extensions: [StarterKit, AnnotationMark],
    content: convertNewlinesToBreaks(initialContent),
    enablePasteRules: false, // Disable default paste rules to let our custom handlePaste handle everything
    onUpdate: () => {
      onUpdate()
    },
    editorProps: {
      attributes: {
        class: 'editor-content',
      },
      handleClick: (view, pos, event) => {
        // Use DOM to find the clicked mark element - more reliable than position-based API
        const target = event.target as HTMLElement
        const markElement = target.closest('span[data-annotation-id]') as HTMLElement | null

        if (markElement && onMarkClick) {
          const annotationId = markElement.getAttribute('data-annotation-id')
          if (!annotationId) return false

          // Get the bounding rect of the mark element
          const rect = markElement.getBoundingClientRect()
          const editorElement = view.dom as HTMLElement
          const editorRect = editorElement.getBoundingClientRect()

          // Calculate position relative to editor
          const position = {
            top: rect.bottom - editorRect.top + 8, // Below the text
            left: rect.left - editorRect.left
          }

          onMarkClick(annotationId, position)

          // Return true to indicate we handled the click
          return true
        }

        // Return false to allow default behavior
        return false
      },
      handlePaste: (view, event) => {
        // Get plain text from clipboard
        const clipboardData = (event as ClipboardEvent).clipboardData
        if (!clipboardData) return false

        const text = clipboardData.getData('text/plain')
        if (!text) return false

        // Convert all newlines (including multiple consecutive ones) to <br> tags
        // HardBreak extension (included in StarterKit) will handle rendering these <br> tags
        const htmlContent = convertNewlinesToBreaks(text)

        // Use TipTap's insertContent command to insert the HTML
        const editorInstance = editorRef.current
        if (editorInstance) {
          editorInstance.chain()
            .focus()
            .insertContent(htmlContent)
            .run()
          return true
        }

        return false
      },
    },
  })

  React.useEffect(() => {
    if (editor) {
      editorRef.current = editor
      onEditorReady(editor)
    }
  }, [editor])

  return editor ? <EditorContent editor={editor} className="editor-wrapper" /> : null
}

interface NoteProps {
  note: NoteType
  annotations: TextSpanAnnotation[] // Annotations for this note (from App's annotations map)
  onUpdateTitle: (noteId: string, title: string) => void
  onUpdateContent: (noteId: string, content: string) => void
  onUpdateAnnotations: (noteId: string, annotations: TextSpanAnnotation[]) => void
}

interface NoteState {
  openAnnotationId: string | null
  popupPosition: { top: number; left: number } | null
  content: string
  isAnalyzing: boolean
}

class Note extends Component<NoteProps, NoteState> {
  private annotationLayerRef = React.createRef<HTMLDivElement>()
  private initialContent: string = ''
  private analyzer: Analyzer
  private checkpointManager: CheckpointManager
  private debouncedContentLogger: () => void
  private editor: TiptapEditor | null = null

  constructor(props: NoteProps) {
    super(props)
    this.state = {
      openAnnotationId: null,
      popupPosition: null,
      content: props.note.content || '',
      isAnalyzing: false
    }

    // Initialize checkpoint manager
    this.checkpointManager = new CheckpointManager(props.note.id)

    // Initialize analyzer for this note
    this.analyzer = new Analyzer(props.note.id)

    // Create debounced version of contentLogger
    this.debouncedContentLogger = debounce(this.contentLogger.bind(this), 2000)
  }

  // Get annotations as a Map for convenient lookup (derived from props)
  private getAnnotationsMap(): Map<string, TextSpanAnnotation> {
    const map = new Map<string, TextSpanAnnotation>()
    this.props.annotations.forEach(ann => map.set(ann.annotationId, ann))
    return map
  }

  // Normalize quotes and dashes for consistent matching (all 1:1 character replacements)
  private normalizeText(text: string): string {
    return text
      .replace(/\u201C/g, '"')  // Left double quote (") to straight quote
      .replace(/\u201D/g, '"')  // Right double quote (") to straight quote
      .replace(/\u2018/g, "'")  // Left single quote (') to straight quote
      .replace(/\u2019/g, "'")  // Right single quote (') to straight quote
      .replace(/\u2013/g, '-')  // En dash (–) to hyphen
      .replace(/\u2014/g, '-')  // Em dash (—) to hyphen
      .replace(/\u2015/g, '-')  // Horizontal bar (―) to hyphen
  }

  // Find textSpan in editor and return selection range
  private findTextSpan(textSpan: string): { from: number; to: number } | null {
    if (!this.editor) return null

    // Normalize both content and textSpan to ensure matching works correctly
    // Normalization is 1:1 character replacement, so index in normalized content = index in original content
    const content = this.getContent() // Already normalized by default
    const normalizedTextSpan = this.normalizeText(textSpan) // Normalize textSpan as well (LLM may output curly quotes/dashes)
    const index = content.indexOf(normalizedTextSpan)
    if (index === -1) return null

    // +1 because ProseMirror positions start at 1 (position 0 is before the document)
    const from = index + 1
    const to = from + normalizedTextSpan.length

    return { from, to }
  }

  // Convert analyzer results to TextSpanAnnotation entries and add them
  // noteId parameter allows adding annotations to any note (not just current)
  private addAnnotationsFromResults(noteId: string, results: AnnotationResult[]): void {
    if (results.length === 0) {
      return
    }

    // Get current annotations for the target note
    // If this is the current note, use props; otherwise we'd need App to provide a way
    // For now, if noteId matches current note, we can validate textSpans
    const isCurrentNote = noteId === this.props.note.id
    const currentAnnotations = isCurrentNote ? this.props.annotations : []

    const newAnnotations: TextSpanAnnotation[] = []

    for (const result of results) {
      // Normalize to array for validation
      const spans = getTextSpans(result.textSpan)

      // Only validate textSpans if this is the current note (we have the editor)
      if (isCurrentNote) {
        let allSpansFound = true
        for (const span of spans) {
          const range = this.findTextSpan(span)
          if (!range) {
            console.warn('Could not find textSpan in editor:', span)
            allSpansFound = false
            break
          }
        }
        if (!allSpansFound) continue
      }

      // Generate unique ID for this annotation
      const annotationId = `annotation-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`

      let annotation: ReferenceAnnotation | ListAnnotation | ConnectionAnnotation

      if (result.type === 'reference' && result.records) {
        annotation = {
          type: 'reference',
          records: result.records
        }
      } else if (result.type === 'list' && result.extensions) {
        annotation = {
          type: 'list',
          extensions: result.extensions
        }
      } else if (result.type === 'connection' && result.records) {
        annotation = {
          type: 'connection',
          records: result.records
        }
      } else {
        console.warn('Invalid annotation result:', result)
        continue
      }

      newAnnotations.push({
        annotationId,
        noteId, // Use the noteId from the analysis result
        textSpan: result.textSpan,
        annotation,
        checkpointId: this.checkpointManager.getCurrentCheckpointId() || undefined
      })
    }

    if (newAnnotations.length > 0) {
      this.props.onUpdateAnnotations(noteId, [...currentAnnotations, ...newAnnotations])
    }
  }

  // Sync editor marks with annotations from props (single source of truth)
  private syncMarks() {
    if (!this.editor) {
      return
    }

    // Clear all marks first
    this.editor.chain()
      .setTextSelection({ from: 0, to: this.editor.state.doc.content.size })
      .unsetMark('annotation')
      .setTextSelection(this.editor.state.doc.content.size)
      .run()

    // Reapply marks for all annotations from props
    this.props.annotations.forEach(({ annotationId, textSpan, annotation }) => {
      // Handle both single and multiple text spans
      const spans = getTextSpans(textSpan)

      for (const span of spans) {
        const range = this.findTextSpan(span)
        if (range) {
          this.editor!.chain()
            .setTextSelection({ from: range.from, to: range.to })
            .setMark('annotation', {
              annotationId,
              type: annotation.type
            })
            .setTextSelection(range.to)
            .run()
        }
      }
    })
  }

  componentDidMount() {
    const initial = this.props.note.content || ''
    this.initialContent = initial
  }

  componentDidUpdate(prevProps: NoteProps, prevState: NoteState) {
    // When switching to a different note
    if (prevProps.note.id !== this.props.note.id) {
      // Don't abort analyzer - let it continue and results will be routed to correct note
      // But we do need a new analyzer and checkpoint manager for the new note
      this.analyzer = new Analyzer(this.props.note.id)
      this.checkpointManager = new CheckpointManager(this.props.note.id)

      const initial = this.props.note.content || ''
      this.setContent(initial)
      this.initialContent = initial
      this.setState({
        content: initial,
        openAnnotationId: null,
        popupPosition: null,
        isAnalyzing: false
      })

      if (this.editor) {
        setTimeout(() => this.syncMarks(), 0)
      }
      return
    }

    // Sync marks when annotations change in props (single source of truth)
    if (this.editor && prevProps.annotations !== this.props.annotations) {
      // Use setTimeout to ensure editor has processed any pending changes
      setTimeout(() => this.syncMarks(), 0)
    }
  }

  componentWillUnmount() {
    // Don't abort analyzer on unmount - let background analysis complete
    // Results will still be routed correctly via App's handleUpdateAnnotations
  }

  shouldComponentUpdate(nextProps: NoteProps, nextState: NoteState) {
    // Avoid rerendering the contentEditable on each keystroke; only rerender when
    // note identity changes or annotation-related state changes.
    if (nextProps.note.id !== this.props.note.id) return true
    if (nextProps.note.title !== this.props.note.title) return true
    if (nextProps.annotations !== this.props.annotations) return true
    if (nextState.openAnnotationId !== this.state.openAnnotationId) return true
    if (nextState.content !== this.state.content) return true
    if (nextState.isAnalyzing !== this.state.isAnalyzing) return true
    return false
  }

  getContent(normalize: boolean = true): string {
    if (this.editor) {
      // Use getText() which preserves line breaks better than textContent
      const content = this.editor.getText()

      // Normalize by default for matching/searching, but preserve original for saving
      return normalize ? this.normalizeText(content) : content
    }
    return ''
  }

  setContent(content: string) {
    if (this.editor) {
      // Convert newlines to <br> tags to preserve line breaks
      this.editor.commands.setContent(convertNewlinesToBreaks(content))
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
    if (!this.editor) return

    // Capture the analyzer's noteId (it knows which note it's analyzing)
    const analyzerNoteId = this.analyzer.getNoteID()

    const currentContent = this.getContent(false) // Don't normalize for saving
    if (currentContent !== this.initialContent) {
      let diff: string = '';

      if (this.initialContent === '') {
        diff = currentContent
      } else {
        diff = this.getDiff(this.initialContent, currentContent)
      }

      // Show spinner while analyzing
      this.setState({ isAnalyzing: true })

      try {
        // Analyze the content change - pass callback for progressive annotation updates
        const result = await this.analyzer.analyze(
          diff,
          currentContent,
          this.props.note.title,
          // Progressive callback - add each annotation as it arrives
          (noteId, annotation) => {
            this.addAnnotationsFromResults(noteId, [annotation])
          }
        )

        // Note: annotations are already added progressively via callback above
        // The final result.annotations is the complete list (for reference/logging)

        // Only create checkpoint if tool calls were executed and we're still on the same note
        if (result.toolCallsExecuted && result.noteId === this.props.note.id) {
          this.createCheckpoint()
        }

        // Only update initialContent if we're still on the same note
        if (analyzerNoteId === this.props.note.id) {
          this.initialContent = currentContent
        }
      } catch (error) {
        console.error('Analysis error:', error)
      } finally {
        // Hide spinner when done (only if still on the same note)
        if (analyzerNoteId === this.props.note.id) {
          this.setState({ isAnalyzing: false })
        }
      }
    }
  }

  handleContentChange = () => {
    if (!this.editor) return

    const content = this.getContent(false) // Don't normalize for saving
    const contentChanged = content !== this.state.content

    this.setState({ content })

    // Only trigger the analysis logger if actual text content changed (not just marks)
    if (contentChanged) {
      // Call the debounced logger (will log after 2 seconds of inactivity)
      this.debouncedContentLogger()

      // Still update immediately (for saving)
      this.props.onUpdateContent(this.props.note.id, content)
    }
  }

  // Delete a single annotation
  private deleteAnnotation(annotationId: string) {
    const updatedAnnotations = this.props.annotations.filter(a => a.annotationId !== annotationId)
    this.props.onUpdateAnnotations(this.props.note.id, updatedAnnotations)
  }

  // Update a single annotation
  private updateAnnotation(annotationId: string, updatedEntry: TextSpanAnnotation) {
    const updatedAnnotations = this.props.annotations.map(a =>
      a.annotationId === annotationId ? updatedEntry : a
    )
    this.props.onUpdateAnnotations(this.props.note.id, updatedAnnotations)
  }

  handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const title = e.target.value
    this.props.onUpdateTitle(this.props.note.id, title)
  }

  // Create a checkpoint with current state
  private createCheckpoint() {
    const messageIndex = this.analyzer.getMessages().length - 1
    const content = this.getContent(false)
    const annotationIds = this.props.annotations.map(a => a.annotationId)
    this.checkpointManager.createCheckpoint(messageIndex, content, annotationIds)
  }

  // Get all checkpoints for UI
  getCheckpoints() {
    return this.checkpointManager.getCheckpoints()
  }

  // Restore document to a checkpoint
  restoreToCheckpoint = (checkpointId: string) => {
    const restorationData = this.checkpointManager.restoreToCheckpoint(checkpointId, (messageIndex: number) => {
      // Truncate messages in analyzer
      this.analyzer.truncateMessages(messageIndex)
    })
    if (!restorationData) {
      console.warn('Checkpoint not found:', checkpointId)
      return
    }

    // Update initialContent BEFORE setContent to prevent handleContentChange from saving old content
    this.initialContent = restorationData.content

    // Filter annotations to only those in the checkpoint
    const checkpointAnnotationIds = new Set(restorationData.annotationIds)
    const filteredAnnotations = this.props.annotations.filter(
      ann => checkpointAnnotationIds.has(ann.annotationId)
    )

    // Update annotations in props (single source of truth)
    this.props.onUpdateAnnotations(this.props.note.id, filteredAnnotations)

    // Update state with restored content
    this.setState({
      content: restorationData.content
    }, () => {
      // After state is updated, set editor content and save to storage
      this.setContent(restorationData.content)

      // Save restored content to storage
      this.props.onUpdateContent(this.props.note.id, restorationData.content)
    })
  }

  handleAnnotationPopupOpen = (annotationId: string) => {
    this.setState({ openAnnotationId: annotationId })
  }

  handleAnnotationPopupClose = (annotationId: string) => {
    if (this.state.openAnnotationId === annotationId) {
      this.setState({ openAnnotationId: null, popupPosition: null })
    }
  }

  handleMarkClick = (annotationId: string, position: { top: number; left: number }) => {
    // Toggle popup visibility
    if (this.state.openAnnotationId === annotationId) {
      this.setState({ openAnnotationId: null, popupPosition: null })
    } else {
      // Open new popup (this also closes any currently open one)
      this.setState({
        openAnnotationId: annotationId,
        popupPosition: position
      })
    }
  }

  handleDeleteAnnotation = (annotationId: string) => {
    if (!this.editor) return

    // Close popup if deleting the annotation that's currently open
    if (this.state.openAnnotationId === annotationId) {
      this.setState({ openAnnotationId: null, popupPosition: null })
    }

    // Delete annotation (syncMarks will be called via componentDidUpdate when props change)
    this.deleteAnnotation(annotationId)
  }

  handleDeleteRecord = (annotationId: string, recordIndex: number) => {
    const annotationsMap = this.getAnnotationsMap()
    const entry = annotationsMap.get(annotationId)
    if (entry && entry.annotation.type === 'reference') {
      const refAnnotation = entry.annotation as ReferenceAnnotation
      const newRecords = refAnnotation.records.filter((_, i) => i !== recordIndex)
      if (newRecords.length === 0) {
        // If no records left, delete the entire annotation
        this.handleDeleteAnnotation(annotationId)
      } else {
        // Update the annotation with remaining records
        const updatedAnnotation: ReferenceAnnotation = {
          ...refAnnotation,
          records: newRecords
        }
        this.updateAnnotation(annotationId, {
          ...entry,
          annotation: updatedAnnotation
        })
      }
    }
  }

  handleDeleteExtension = (annotationId: string, extensionIndex: number) => {
    const annotationsMap = this.getAnnotationsMap()
    const entry = annotationsMap.get(annotationId)
    if (entry && entry.annotation.type === 'list') {
      const listAnnotation = entry.annotation as ListAnnotation
      const newExtensions = listAnnotation.extensions.filter((_, i) => i !== extensionIndex)
      if (newExtensions.length === 0) {
        // If no extensions left, delete the entire annotation
        this.handleDeleteAnnotation(annotationId)
      } else {
        // Update the annotation with remaining extensions
        const updatedAnnotation: ListAnnotation = {
          ...listAnnotation,
          extensions: newExtensions
        }
        this.updateAnnotation(annotationId, {
          ...entry,
          annotation: updatedAnnotation
        })
      }
    }
  }


  handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    // const pastedText = e.clipboardData.getData('text/plain')
    // console.log('Pasted content:', pastedText)
  }

  // Handle click on connection line - open popup at position
  private handleConnectionClick = (annotationId: string, position: { top: number; left: number }) => {
    this.setState({
      openAnnotationId: annotationId,
      popupPosition: position
    })
  }

  // Render annotations by reading marks from the document
  renderAnnotationOverlay(): React.ReactNode {
    if (!this.editor || this.props.annotations.length === 0) {
      return null
    }

    const annotationsMap = this.getAnnotationsMap()
    const annotationRanges = new Map<string, { from: number; to: number }>()
    const processedIds = new Set<string>()

    // First pass: collect all text nodes with marks and build ranges
    this.editor.state.doc.descendants((node, pos) => {
      if (node.isText && node.marks) {
        node.marks.forEach(mark => {
          if (mark.type.name === 'annotation' && mark.attrs.annotationId) {
            const annotationId = mark.attrs.annotationId
            if (processedIds.has(annotationId)) return

            // Find the full range of this mark by looking ahead
            let from = pos
            let to = pos + node.nodeSize

            // Look ahead to find contiguous nodes with the same mark
            let currentPos = pos + node.nodeSize
            this.editor!.state.doc.nodesBetween(currentPos, this.editor!.state.doc.content.size, (nextNode, nextPos) => {
              if (nextNode.isText && nextNode.marks) {
                const hasSameMark = nextNode.marks.some(m =>
                  m.type.name === 'annotation' && m.attrs.annotationId === annotationId
                )
                if (hasSameMark) {
                  to = nextPos + nextNode.nodeSize
                  return false // Continue searching
                }
              }
              return true // Stop searching
            })

            annotationRanges.set(annotationId, { from, to })
            processedIds.add(annotationId)
          }
        })
      }
      return true
    })

    // Second pass: render components
    const spans: Array<{ from: number; component: React.ReactElement }> = []

    annotationRanges.forEach((range, annotationId) => {
      const annotationEntry = annotationsMap.get(annotationId)
      if (!annotationEntry) return

      const { annotation } = annotationEntry

      try {
        let popupLabel: string
        let child: React.ReactElement

        if (annotation.type === 'reference') {
          const refAnnotation = annotation as ReferenceAnnotation
          popupLabel = 'Annotations'
          child = (
            <ReferenceAnnotationContent
              records={refAnnotation.records}
              onDeleteRecord={(recordIndex) => this.handleDeleteRecord(annotationId, recordIndex)}
            />
          )
        } else if (annotation.type === 'list') {
          const listAnnotation = annotation as ListAnnotation
          popupLabel = 'List Extensions'
          child = (
            <ListAnnotationContent
              extensions={listAnnotation.extensions}
              onDeleteExtension={(extensionIndex) => this.handleDeleteExtension(annotationId, extensionIndex)}
            />
          )
        } else if (annotation.type === 'connection') {
          const connectionAnnotation = annotation as ConnectionAnnotation
          popupLabel = 'Connection'
          child = (
            <ReferenceAnnotationContent
              records={connectionAnnotation.records}
              onDeleteRecord={(recordIndex) => this.handleDeleteRecord(annotationId, recordIndex)}
            />
          )
        } else {
          return // Skip unknown types
        }

        const component = (
          <AnnotationPopup
            key={`annotation-${annotationId}`}
            annotationId={annotationId}
            popupLabel={popupLabel}
            isVisible={this.state.openAnnotationId === annotationId}
            position={this.state.openAnnotationId === annotationId ? this.state.popupPosition : null}
            onPopupOpen={() => this.handleAnnotationPopupOpen(annotationId)}
            onPopupClose={() => this.handleAnnotationPopupClose(annotationId)}
          >
            {child}
          </AnnotationPopup>
        )

        spans.push({ from: range.from, component })
      } catch (error) {
        console.warn('Error rendering annotation:', error)
      }
    })

    // Sort by position
    spans.sort((a, b) => a.from - b.from)

    return spans.map(span => span.component)
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
            <ConnectionLines
              editor={this.editor}
              annotations={this.props.annotations}
              onClick={this.handleConnectionClick}
              findTextSpan={this.findTextSpan.bind(this)}
              annotationLayerRef={this.annotationLayerRef}
            />
          </div>
                  <TipTapEditorWrapper
                    initialContent={this.props.note.content || ''}
                    onEditorReady={(editor) => {
                      this.editor = editor
                      // Sync marks from props (single source of truth) on editor ready
                      if (this.props.annotations.length > 0) {
                        setTimeout(() => this.syncMarks(), 0)
                      }
                      // Force re-render so ConnectionLines gets the editor
                      this.forceUpdate()
                    }}
                    onUpdate={() => {
                      this.handleContentChange()
                    }}
                    onMarkClick={this.handleMarkClick}
                  />
        </div>
        {this.state.isAnalyzing && (
          <div className="analysis-spinner">
            <div className="spinner-icon" />
          </div>
        )}
        <CheckpointNavigation
          checkpoints={this.getCheckpoints()}
          currentCheckpointId={this.checkpointManager.getCurrentCheckpointId()}
          onCheckpointClick={this.restoreToCheckpoint}
        />
      </div>
    )
  }
}

// Checkpoint Navigation Component
interface CheckpointNavigationProps {
  checkpoints: Checkpoint[]
  currentCheckpointId: string | null
  onCheckpointClick: (checkpointId: string) => void
}

const CheckpointNavigation = ({ checkpoints, currentCheckpointId, onCheckpointClick }: CheckpointNavigationProps) => {
  if (checkpoints.length === 0) {
    return null
  }

  return (
    <div className="checkpoint-navigation">
      {checkpoints.map((checkpoint, index) => (
        <button
          key={checkpoint.checkpointId}
          className={`checkpoint-dot ${currentCheckpointId === checkpoint.checkpointId ? 'active' : ''}`}
          onClick={() => onCheckpointClick(checkpoint.checkpointId)}
          aria-label={`Go to checkpoint ${index + 1}`}
          title={`Checkpoint ${index + 1}`}
        />
      ))}
    </div>
  )
}

export default Note
