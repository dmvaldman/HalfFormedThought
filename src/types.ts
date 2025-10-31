export interface Annotation {
  id: string
  content: string // Markdown string that can contain url, image, text, video
}

export interface ContentBlock {
  text: string
  annotations: Annotation[]
}

export interface Note {
  id: string
  title: string
  content: ContentBlock[]
  createdAt: number
  updatedAt: number
  lastAnalyzedAt?: number // Track when we last ran analysis
}


