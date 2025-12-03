import React, { Component } from 'react'
import { EditorContent, useEditor, Editor as TiptapEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { AnnotationMark } from './AnnotationMark'
import { NoteType, Annotation, ReferenceAnnotation, ListAnnotation, TextSpanAnnotation } from './types'
import { debounce } from './utils'
import { createPatch } from 'diff'
import { Analyzer, Tool } from './analyzer'
import { AnnotationPopup } from './AnnotationPopup'
import ReferenceAnnotationContent from './ReferenceAnnotation'
import ListAnnotationContent from './ListAnnotation'

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

// Tool definitions
const ANNOTATE_TOOL = {
  type: 'function',
  function: {
    name: 'annotate',
    description: 'Annotate a text span with research sources and insights. Call this tool multiple times to annotate different text spans. Each call should annotate one text span.',
    parameters: {
      type: 'object',
      properties: {
        textSpan: {
          type: 'string',
          description: 'The exact span of text being annotated. Must be an exact string match to the content (no "...", correcting spelling/punctuation or starting/ending with punctuation/whitespace).'
        },
        records: {
          type: 'array',
          minItems: 1,
          maxItems: 3,
          description: 'Array of 1-3 record objects for this text span, providing diverse perspectives from different domains',
          items: {
            type: 'object',
            properties: {
              description: {
                type: 'string',
                description: 'A short summary of the source (0-4 sentences)'
              },
              title: {
                type: 'string',
                description: 'The name of the source (book title, essay title, etc)'
              },
              author: {
                type: 'string',
                description: 'The name of the author (optional)'
              },
              domain: {
                type: 'string',
                description: 'The domain of the source (history, physics, philosophy, poetry, art, dance, typography, religion, etc)'
              },
              search_query: {
                type: 'string',
                description: 'A search query that will be used by a search engine to find more information about the source'
              }
            },
            required: ['description', 'title', 'domain', 'search_query']
          }
        }
      },
      required: ['textSpan', 'records']
    }
  }
}

const GET_NOTE_CONTENT_TOOL = {
  type: 'function',
  function: {
    name: 'getNoteContent',
    description: 'Get the full current content of the note. Use this when you need to see the complete text to understand context or find exact text spans.',
    parameters: {
      type: 'object',
      properties: {},
    }
  }
}

const EXTEND_LIST_TOOL = {
  type: 'function',
  function: {
    name: 'extendList',
    description: 'Extend a list in the document by adding more entries. Lists can be identified by repeated use of "and/or" conjunctions or by literal bulletpointed lists with dashes. Provide 1-4 additional entries that extend the list in a meaningful way.',
    parameters: {
      type: 'object',
      properties: {
        textSpan: {
          type: 'string',
          description: 'The exact span of text containing the list to extend. Must be an exact string match to the content (no "...", correcting spelling/punctuation or starting/ending with punctuation/whitespace).'
        },
        extensions: {
          type: 'array',
          minItems: 1,
          maxItems: 4,
          description: 'Array of 1-4 string entries that extend the list',
          items: {
            type: 'string'
          }
        }
      },
      required: ['textSpan', 'extensions']
    }
  }
}

interface NoteProps {
  note: NoteType
  onUpdateTitle: (noteId: string, title: string) => void
  onUpdateContent: (noteId: string, content: string) => void
  onUpdateAnnotations?: (noteId: string, annotations: TextSpanAnnotation[]) => void
}

interface NoteState {
  annotations: Map<string, TextSpanAnnotation> // Map annotationId -> annotation entry
  openAnnotationId: string | null
  popupPosition: { top: number; left: number } | null
  content: string
  isAnalyzing: boolean
}

class Note extends Component<NoteProps, NoteState> {
  private annotationLayerRef = React.createRef<HTMLDivElement>()
  private initialContent: string = ''
  private analyzer: Analyzer
  private debouncedContentLogger: () => void
  private editor: TiptapEditor | null = null

  constructor(props: NoteProps) {
    super(props)
    this.state = {
      annotations: new Map(),
      openAnnotationId: null,
      popupPosition: null,
      content: props.note.content || '',
      isAnalyzing: false
    }

    // Define tools with their implementations
    const tools: Tool[] = [
      {
        ...ANNOTATE_TOOL,
        execute: this.onAnnotate.bind(this)
      },
      {
        ...GET_NOTE_CONTENT_TOOL,
        execute: this.getNoteContent.bind(this)
      },
      {
        ...EXTEND_LIST_TOOL,
        execute: this.onExtendList.bind(this)
      }
    ]

    // Initialize analyzer for this note with tools
    this.analyzer = new Analyzer(props.note.id, tools)

    // Create debounced version of contentLogger
    this.debouncedContentLogger = debounce(this.contentLogger.bind(this), 2000)
  }

  // Find the range of a mark in the document by annotationId
  private annotationIdToRange(annotationId: string): { from: number; to: number } | null {
    if (!this.editor) return null

    const { state } = this.editor
    let markRange: { from: number; to: number } | null = null

    // Traverse the document to find the mark with this annotationId
    state.doc.descendants((node, pos) => {
      if (markRange) return false // Already found, stop traversing

      const marks = node.marks.filter(mark =>
        mark.type.name === 'annotation' &&
        mark.attrs.annotationId === annotationId
      )

      if (marks.length > 0) {
        // Found the mark, get its range
        markRange = { from: pos, to: pos + node.nodeSize }
        return false // Stop traversing
      }
    })

    return markRange
  }

  // Normalize quotes and dashes for consistent matching (all 1:1 character replacements)
  private normalizeText(text: string): string {
    return text
      .replace(/[""]/g, '"')  // Left/right double quotes to straight quote
      .replace(/['']/g, "'")  // Left/right single quotes to straight quote
      .replace(/[\u2013\u2014]/g, '-')  // En/em dashes to hyphen
  }

  // Find textSpan in editor and return selection range
  private findTextSpan(textSpan: string): { from: number; to: number } | null {
    if (!this.editor) return null

    // getContent() normalizes by default, so AI only sees normalized content
    // and textSpan will already match. Since normalization is 1:1 character
    // replacement, index in normalized content = index in original content.
    const content = this.getContent()
    const index = content.indexOf(textSpan)
    if (index === -1) return null

    // +1 because ProseMirror positions start at 1 (position 0 is before the document)
    const from = index + 1
    const to = from + textSpan.length

    return { from, to }
  }

  // Tool method for Kimi to call when it wants to annotate text spans
  private onAnnotate = (annotation: any) => {
    if (annotation && annotation.textSpan && this.editor) {
      // Clean the textSpan
      const textSpan = annotation.textSpan.trim().replace(/^[.,:;!?]+|[.,:;!?]+$/g, '').trim()

      // Skip if textSpan is empty after cleaning (e.g., if it was just punctuation)
      if (!textSpan) {
        console.warn('TextSpan is empty after cleaning, skipping annotation:', annotation.textSpan)
        return
      }

      // Find textSpan in editor
      const range = this.findTextSpan(textSpan)
      if (!range) {
        console.warn('Could not find textSpan in editor:', textSpan)
        return
      }

      // Generate unique ID for this annotation
      const annotationId = `annotation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

      // Apply mark to the text span
      this.editor.chain()
        .setTextSelection({ from: range.from, to: range.to })
        .setMark('annotation', {
          annotationId,
          type: 'reference'
        })
        .setTextSelection(range.to) // Clear selection
        .run()

      // Store annotation data + text span
      const newAnnotation: ReferenceAnnotation = {
        type: 'reference',
        records: annotation.records
      }

      const annotationEntry: TextSpanAnnotation = {
        annotationId,
        textSpan,
        annotation: newAnnotation
      }

      // Add to annotations map using functional setState to avoid batching issues
      this.setState(prevState => {
        const newAnnotations = new Map(prevState.annotations)
        newAnnotations.set(annotationId, annotationEntry)
        return { annotations: newAnnotations }
      }, () => {
        this.saveAnnotation(annotationId)
      })
    }
  }

  // Tool method for Kimi to get the current note content
  private getNoteContent = (): string => {
    if (this.editor) {
      return this.editor.getText()
    }
    return ''
  }

  // Tool method for Kimi to call when it wants to extend a list
  private onExtendList = (listAnnotation: any) => {
    if (listAnnotation && listAnnotation.extensions && listAnnotation.extensions.length > 0 && listAnnotation.textSpan && this.editor) {
      // Clean the textSpan
      const textSpan = listAnnotation.textSpan.trim().replace(/^[.,:;!?]+|[.,:;!?]+$/g, '').trim()

      // Find textSpan in editor
      const range = this.findTextSpan(textSpan)
      if (!range) {
        console.warn('Could not find textSpan in editor:', textSpan)
        return
      }

      // Generate unique ID for this annotation
      const annotationId = `annotation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

      // Apply mark to the text span
      this.editor.chain()
        .setTextSelection({ from: range.from, to: range.to })
        .setMark('annotation', {
          annotationId,
          type: 'list'
        })
        .setTextSelection(range.to) // Clear selection
        .run()

      // Store annotation data + text span
      const newAnnotation: ListAnnotation = {
        type: 'list',
        extensions: listAnnotation.extensions
      }

      const annotationEntry: TextSpanAnnotation = {
        annotationId,
        textSpan,
        annotation: newAnnotation
      }

      // Add to annotations map using functional setState to avoid batching issues
      this.setState(prevState => {
        const newAnnotations = new Map(prevState.annotations)
        newAnnotations.set(annotationId, annotationEntry)
        return { annotations: newAnnotations }
      }, () => {
        this.saveAnnotation(annotationId)
      })
    }
  }

  // Load annotations from stored note data and reapply marks
  private loadAnnotations() {
    if (!this.editor) {
      return
    }

    if (!this.props.note.annotations || this.props.note.annotations.length === 0) {
      this.setState({ annotations: new Map() })
      return
    }

    const annotationsMap = new Map<string, TextSpanAnnotation>()

    this.props.note.annotations.forEach(storedAnnotation => {
      const { annotationId, textSpan, annotation } = storedAnnotation

      const range = this.findTextSpan(textSpan)
      if (!range) {
        console.warn('Could not find textSpan when loading annotation:', textSpan)
        return
      }

      this.editor!.chain()
        .setTextSelection({ from: range.from, to: range.to })
        .setMark('annotation', {
          annotationId,
          type: annotation.type
        })
        .setTextSelection(range.to)
        .run()

      const actualTextSpan = this.editor!.state.doc.textBetween(range.from, range.to)

      annotationsMap.set(annotationId, {
        annotationId,
        textSpan: actualTextSpan,
        annotation
      })
    })

    this.setState({ annotations: annotationsMap })
  }

  componentDidMount() {
    const initial = this.props.note.content || ''
    this.initialContent = initial
  }

  componentDidUpdate(prevProps: NoteProps) {
    if (prevProps.note.id !== this.props.note.id) {
      const initial = this.props.note.content || ''
      this.setContent(initial)
      this.initialContent = initial
      this.setState({
        content: initial,
        annotations: new Map(),
        openAnnotationId: null,
        popupPosition: null,
        isAnalyzing: false
      })

      if (this.editor) {
        setTimeout(() => this.loadAnnotations(), 0)
      }
      return
    }
  }

  shouldComponentUpdate(nextProps: NoteProps, nextState: NoteState) {
    // Avoid rerendering the contentEditable on each keystroke; only rerender when
    // note identity changes or annotation-related state changes.
    if (nextProps.note.id !== this.props.note.id) return true
    if (nextProps.note.title !== this.props.note.title) return true
    if (nextProps.note.annotations !== this.props.note.annotations) return true
    if (nextState.annotations !== this.state.annotations) return true
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
        // Analyze the content change - annotations will be added progressively via onAnnotate tool
        await this.analyzer.analyze(diff, this.props.note.title)

        this.initialContent = currentContent
      } catch (error) {
        console.error('Analysis error:', error)
      } finally {
        // Hide spinner when done
        this.setState({ isAnalyzing: false })
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

  // Save annotations to parent (will be stored with note)
  // Get the text span for a specific annotation by finding its mark range
  private getAnnotationTextSpan(annotationId: string): string | null {
    if (!this.editor) return null

    const range = this.annotationIdToRange(annotationId)
    if (!range) return null

    return this.editor.state.doc.textBetween(range.from, range.to)
  }

  // Save a single annotation (add or update)
  private saveAnnotation(annotationId: string) {
    if (!this.editor || !this.props.onUpdateAnnotations) return

    const annotationEntry = this.state.annotations.get(annotationId)
    if (!annotationEntry) return

    const textSpan = this.getAnnotationTextSpan(annotationId)
    if (!textSpan) return

    const serializedEntry: TextSpanAnnotation = {
      annotationId,
      textSpan,
      annotation: annotationEntry.annotation
    }

    // Get current stored annotations and update/add this one
    const currentAnnotations = this.props.note.annotations || []
    const existingIndex = currentAnnotations.findIndex(a => a.annotationId === annotationId)

    let updatedAnnotations: TextSpanAnnotation[]
    if (existingIndex >= 0) {
      // Update existing annotation
      updatedAnnotations = [...currentAnnotations]
      updatedAnnotations[existingIndex] = serializedEntry
    } else {
      // Add new annotation
      updatedAnnotations = [...currentAnnotations, serializedEntry]
    }

    this.props.onUpdateAnnotations(this.props.note.id, updatedAnnotations)
  }

  // Delete a single annotation from storage
  private deleteAnnotationFromStorage(annotationId: string) {
    if (!this.props.onUpdateAnnotations) return

    const currentAnnotations = this.props.note.annotations || []
    const updatedAnnotations = currentAnnotations.filter(a => a.annotationId !== annotationId)

    this.props.onUpdateAnnotations(this.props.note.id, updatedAnnotations)
  }

  handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const title = e.target.value
    this.props.onUpdateTitle(this.props.note.id, title)
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

    // Find the mark range in the document
    const markRange = this.annotationIdToRange(annotationId)

    // Remove mark from document if found
    if (markRange) {
      this.editor.chain()
        .setTextSelection({ from: markRange.from, to: markRange.to })
        .unsetMark('annotation')
        .setTextSelection(markRange.to) // Clear selection
        .run()
    }

    // Remove from annotations map using functional setState
    this.setState(prevState => {
      const newAnnotations = new Map(prevState.annotations)
      newAnnotations.delete(annotationId)
      return {
        annotations: newAnnotations,
        openAnnotationId: prevState.openAnnotationId === annotationId ? null : prevState.openAnnotationId
      }
    }, () => {
      // Delete annotation from storage
      this.deleteAnnotationFromStorage(annotationId)
    })
  }

  handleDeleteRecord = (annotationId: string, recordIndex: number) => {
    const entry = this.state.annotations.get(annotationId)
    if (entry && entry.annotation.type === 'reference') {
      const refAnnotation = entry.annotation as ReferenceAnnotation
      const newRecords = refAnnotation.records.filter((_, i) => i !== recordIndex)
      if (newRecords.length === 0) {
        // If no records left, delete the entire annotation
        this.handleDeleteAnnotation(annotationId)
      } else {
        // Update the annotation with remaining records using functional setState
        const updatedAnnotation: ReferenceAnnotation = {
          ...refAnnotation,
          records: newRecords
        }
        this.setState(prevState => {
          const newAnnotations = new Map(prevState.annotations)
          newAnnotations.set(annotationId, {
            ...entry,
            annotation: updatedAnnotation
          })
          return { annotations: newAnnotations }
        }, () => {
          // Save updated annotation
          this.saveAnnotation(annotationId)
        })
      }
    }
  }

  handleDeleteExtension = (annotationId: string, extensionIndex: number) => {
    const entry = this.state.annotations.get(annotationId)
    if (entry && entry.annotation.type === 'list') {
      const listAnnotation = entry.annotation as ListAnnotation
      const newExtensions = listAnnotation.extensions.filter((_, i) => i !== extensionIndex)
      if (newExtensions.length === 0) {
        // If no extensions left, delete the entire annotation
        this.handleDeleteAnnotation(annotationId)
      } else {
        // Update the annotation with remaining extensions using functional setState
        const updatedAnnotation: ListAnnotation = {
          ...listAnnotation,
          extensions: newExtensions
        }
        this.setState(prevState => {
          const newAnnotations = new Map(prevState.annotations)
          newAnnotations.set(annotationId, {
            ...entry,
            annotation: updatedAnnotation
          })
          return { annotations: newAnnotations }
        }, () => {
          // Save updated annotation
          this.saveAnnotation(annotationId)
        })
      }
    }
  }


  handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    // const pastedText = e.clipboardData.getData('text/plain')
    // console.log('Pasted content:', pastedText)
  }

  // Render annotations by reading marks from the document
  renderAnnotationOverlay(): React.ReactNode {
    if (!this.editor || this.state.annotations.size === 0) {
      return null
    }

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
      const annotationEntry = this.state.annotations.get(annotationId)
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
          </div>
                  <TipTapEditorWrapper
                    initialContent={this.props.note.content || ''}
                    onEditorReady={(editor) => {
                      this.editor = editor
                      if (this.props.note.annotations && this.props.note.annotations.length > 0) {
                        setTimeout(() => this.loadAnnotations(), 0)
                      }
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
      </div>
    )
  }
}

export default Note
