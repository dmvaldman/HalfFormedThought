export interface Annotation {
  description?: string
  relevance?: string
  source?: string
  domain?: string
}

export interface Note {
  id: string
  title: string
  content: any // BlockNote document format: array of blocks
  createdAt: number
  updatedAt: number
}


