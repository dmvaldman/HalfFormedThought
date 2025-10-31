export interface Annotation {
  id: string
  content: string // Markdown string that can contain url, image, text, video
}

export interface Note {
  id: string
  title: string
  content: any // EditorJS OutputData format: { blocks: [...] }
  createdAt: number
  updatedAt: number
}


