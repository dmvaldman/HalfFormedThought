import { Annotation } from './types'
import { generateId } from './storage'

export function createDummyAnnotation(): Annotation {
  return {
    id: generateId(),
    content: '**Example annotation**\n\nThis is a dummy annotation with some [markdown](https://example.com) content.\n\n![Example image](https://via.placeholder.com/300)',
  }
}


