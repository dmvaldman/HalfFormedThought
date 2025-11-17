export interface Annotation {
  description?: string
  title?: string
  author?: string
  domain?: string
  search_query?: string
}

export interface Note {
  id: string
  title: string
  content: string // Plain text content
  createdAt: number
  updatedAt: number
}


