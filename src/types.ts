export interface AnnotationType {
  description?: string
  title?: string
  author?: string
  domain?: string
  search_query?: string
}

export interface TextSpanAnnotation {
  textSpan: string
  annotations: AnnotationType[]
}

export interface NoteType {
  id: string
  title: string
  content: string // Plain text content
  createdAt: number
  updatedAt: number
}


