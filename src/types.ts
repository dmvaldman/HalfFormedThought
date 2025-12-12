export interface RecordType {
  description?: string
  title?: string
  author?: string
  domain?: string
  search_query?: string
}

// Base annotation type (no position needed - marks handle that)
export interface BaseAnnotation {
  type: 'reference' | 'list' | 'connection'
}

// Reference annotation (research sources)
export interface ReferenceAnnotation extends BaseAnnotation {
  type: 'reference'
  records: RecordType[]
}

// List annotation (list extensions)
export interface ListAnnotation extends BaseAnnotation {
  type: 'list'
  extensions: string[] // Array of 1-4 string extensions
}

// Connection annotation (links two+ text spans with research sources)
export interface ConnectionAnnotation extends BaseAnnotation {
  type: 'connection'
  records: RecordType[] // Same structure as ReferenceAnnotation
}

// Union type for all annotations
export type Annotation = ReferenceAnnotation | ListAnnotation | ConnectionAnnotation

// Text span annotation entry (stored + in-memory representation)
export interface TextSpanAnnotation {
  annotationId: string
  noteId: string // Which note this annotation belongs to
  textSpan: string | string[] // Single for reference/list, array for connection
  annotation: Annotation // Annotation metadata (records/extensions)
  checkpointId?: string // Which checkpoint created this annotation
}

// Helper to normalize textSpan to always work with arrays
export function getTextSpans(textSpan: string | string[]): string[] {
  return Array.isArray(textSpan) ? textSpan : [textSpan]
}

// Checkpoint for time travel - stores state snapshot
export interface Checkpoint {
  checkpointId: string
  messageIndex: number // Index in messages array (after tool calls)
  timestamp: number
  content: string // Document content at this point
  annotationIds: string[] // Annotations that existed at this point
}

export interface NoteType {
  id: string
  title: string
  content: string // Plain text content
  createdAt: number
  updatedAt: number
}

