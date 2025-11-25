export interface RecordType {
  description?: string
  title?: string
  author?: string
  domain?: string
  search_query?: string
}

// Base annotation type
export interface BaseAnnotation {
  textSpan: string
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

export interface NoteType {
  id: string
  title: string
  content: string // Plain text content
  createdAt: number
  updatedAt: number
}


