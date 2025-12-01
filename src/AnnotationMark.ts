import { Mark } from '@tiptap/core'

export interface AnnotationMarkAttributes {
  annotationId: string
  type: 'reference' | 'list'
}

export const AnnotationMark = Mark.create({
  name: 'annotation',

  addAttributes() {
    return {
      annotationId: {
        default: null,
        parseHTML: element => element.getAttribute('data-annotation-id'),
        renderHTML: attributes => {
          if (!attributes.annotationId) {
            return {}
          }
          return {
            'data-annotation-id': attributes.annotationId,
          }
        },
      },
      type: {
        default: null,
        parseHTML: element => element.getAttribute('data-annotation-type') as 'reference' | 'list' | null,
        renderHTML: attributes => {
          if (!attributes.type) {
            return {}
          }
          return {
            'data-annotation-type': attributes.type,
          }
        },
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-annotation-id]',
      },
    ]
  },

  renderHTML({ HTMLAttributes, mark }) {
    const type = mark.attrs.type
    const style: Record<string, string> = {}

    // Add background color based on annotation type
    // Base opacity is lower, will brighten on hover via CSS
    if (type === 'reference') {
      style.backgroundColor = 'rgba(100, 100, 100, 0.25)'
    } else if (type === 'list') {
      style.backgroundColor = 'rgba(255, 68, 68, 0.25)'
    }

    // Convert style object to string
    const styleString = Object.entries(style)
      .map(([key, value]) => `${key.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${value}`)
      .join('; ')

    return ['span', { ...HTMLAttributes, style: styleString }, 0]
  },
})

