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

  return editor ? <EditorContent editor={editor} /> : null
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

  // Find textSpan in editor and return selection range
  private findTextSpan(textSpan: string): { from: number; to: number } | null {
    if (!this.editor) return null

    const content = this.editor.state.doc.textContent
    const index = content.indexOf(textSpan)

    if (index === -1) return null

    // Convert character index to ProseMirror positions
    let from: number | null = null
    let to: number | null = null
    let currentPos = 0

    this.editor.state.doc.descendants((node, pos) => {
      if (node.isText) {
        const nodeText = node.text || ''
        const nodeStart = currentPos
        const nodeEnd = currentPos + nodeText.length

        if (index >= nodeStart && index < nodeEnd) {
          from = pos + (index - nodeStart)
        }
        if (index + textSpan.length > nodeStart && index + textSpan.length <= nodeEnd) {
          to = pos + (index + textSpan.length - nodeStart)
        }

        currentPos = nodeEnd
      }
      return true
    })

    // Validate that we found both positions
    if (from === null || to === null || from >= to) {
      console.warn('Failed to calculate ProseMirror positions for textSpan:', textSpan)
      return null
    }

    return { from, to }
  }

  // Tool method for Kimi to call when it wants to annotate text spans
  private onAnnotate = (annotation: any) => {
    if (annotation && annotation.textSpan && this.editor) {
      // Clean the textSpan
      const textSpan = annotation.textSpan.trim().replace(/^[.,:;!?]+|[.,:;!?]+$/g, '').trim()

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
        this.saveAnnotations()
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
        this.saveAnnotations()
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

  getContent(): string {
    if (this.editor) {
      // Use getText() which preserves line breaks better than textContent
      return this.editor.getText()
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


    const currentContent = this.getContent()
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

    const content = this.getContent()
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
  private saveAnnotations() {
    if (!this.editor || !this.props.onUpdateAnnotations) return

    const storedAnnotations: TextSpanAnnotation[] = []
    const processedIds = new Set<string>()
    // DON'T update state here - just save to parent
    // The state is already updated by onAnnotate/onExtendList

    // Extract annotations from marks and current text content
    // We need to find the full text span for each annotation (marks can span multiple nodes)
    this.editor.state.doc.descendants((node, pos) => {
      if (node.isText && node.marks) {
        node.marks.forEach(mark => {
          if (mark.type.name === 'annotation' && mark.attrs.annotationId) {
            const annotationId = mark.attrs.annotationId
            const annotationEntry = this.state.annotations.get(annotationId)

            if (!processedIds.has(annotationId)) {
              // Find the full range of this mark
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

              // Get the full text span
              const textSpan = this.editor!.state.doc.textBetween(from, to)

              // Get annotation data from state if available
              const annotationEntry = this.state.annotations.get(annotationId)
              if (annotationEntry) {
                const serializedEntry: TextSpanAnnotation = {
                  annotationId,
                  textSpan,
                  annotation: annotationEntry.annotation
                }

                storedAnnotations.push(serializedEntry)
              }

              processedIds.add(annotationId)
            }
          }
        })
      }
      return true
    })

    // Compare with existing annotations to see if anything changed
    if (this.annotationsHaveChanged(storedAnnotations)) {
      // Update parent with annotations only if they changed
      this.props.onUpdateAnnotations(this.props.note.id, storedAnnotations)
    }
  }

  // Compare current annotations with stored ones to detect changes
  private annotationsHaveChanged(currentAnnotations: TextSpanAnnotation[]): boolean {
    const storedAnnotations = this.props.note.annotations || []

    // Quick check: different number of annotations means change
    if (currentAnnotations.length !== storedAnnotations.length) {
      return true
    }

    // Create maps for easier comparison
    const currentMap = new Map(currentAnnotations.map(a => [a.annotationId, a]))
    const storedMap = new Map(storedAnnotations.map(a => [a.annotationId, a]))

    // Check if any annotation IDs were added or removed
    for (const id of currentMap.keys()) {
      if (!storedMap.has(id)) {
        return true // New annotation added
      }
    }
    for (const id of storedMap.keys()) {
      if (!currentMap.has(id)) {
        return true // Annotation removed
      }
    }

    // Check if any annotation data changed (same ID but different content)
    for (const [id, current] of currentMap) {
      const stored = storedMap.get(id)
      if (!stored) continue

      // Compare textSpan
      if (current.textSpan !== stored.textSpan) {
        return true
      }

      // Compare annotation data
      if (current.annotation.type !== stored.annotation.type) {
        return true
      }

      if (current.annotation.type === 'reference' && stored.annotation.type === 'reference') {
        const currentRef = current.annotation as ReferenceAnnotation
        const storedRef = stored.annotation as ReferenceAnnotation

        // Compare records arrays
        if (currentRef.records.length !== storedRef.records.length) {
          return true
        }

        // Deep compare records
        for (let i = 0; i < currentRef.records.length; i++) {
          const currentRecord = currentRef.records[i]
          const storedRecord = storedRef.records[i]

          if (JSON.stringify(currentRecord) !== JSON.stringify(storedRecord)) {
            return true
          }
        }
      } else if (current.annotation.type === 'list' && stored.annotation.type === 'list') {
        const currentList = current.annotation as ListAnnotation
        const storedList = stored.annotation as ListAnnotation

        // Compare extensions arrays
        if (currentList.extensions.length !== storedList.extensions.length) {
          return true
        }

        // Compare extension strings
        for (let i = 0; i < currentList.extensions.length; i++) {
          if (currentList.extensions[i] !== storedList.extensions[i]) {
            return true
          }
        }
      }
    }

    // No changes detected
    return false
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
      // Save annotations after deletion
      this.saveAnnotations()
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
          // Save annotations after update
          this.saveAnnotations()
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
          // Save annotations after update
          this.saveAnnotations()
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
