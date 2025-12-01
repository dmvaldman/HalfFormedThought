export interface RecordType {
  description?: string
  title?: string
  author?: string
  domain?: string
  search_query?: string
}

// Base annotation type (no position needed - marks handle that)
export interface BaseAnnotation {
  type: 'reference' | 'list'
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

// Union type for all annotations
export type Annotation = ReferenceAnnotation | ListAnnotation

// Text span annotation entry (stored + in-memory representation)
export interface TextSpanAnnotation {
  annotationId: string
  textSpan: string // Exact text that is annotated
  annotation: Annotation // Annotation metadata (records/extensions)
}

export interface NoteType {
  id: string
  title: string
  content: string // Plain text content
  annotations?: TextSpanAnnotation[] // Stored annotations
  createdAt: number
  updatedAt: number
}


