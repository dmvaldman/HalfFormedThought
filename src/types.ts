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
  content: any // BlockNote document format: array of blocks
  createdAt: number
  updatedAt: number
}

export interface BaseBlock {
  id: string
  type: string
  content?: any[]
  props?: Record<string, any>
  children?: BaseBlock[]
}

export interface AnnotationBlock extends BaseBlock {
  type: 'annotation'
  props: {
    annotationsJson: string
    sourceBlockId: string
    isExpanded?: boolean
    isFetching?: boolean
  }
}


