export interface Annotation {
  id: string
  description?: string
  relevance?: string
  source?: string
  domain?: string
}

export interface Note {
  id: string
  title: string
  content: any // EditorJS OutputData format: { blocks: [...] }
  createdAt: number
  updatedAt: number
}


