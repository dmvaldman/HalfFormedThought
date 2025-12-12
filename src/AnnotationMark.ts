import { Mark, mergeAttributes } from '@tiptap/core'

// Base attributes shared by all annotation marks
const baseAttributes = {
  annotationId: {
    default: null as string | null,
    parseHTML: (element: HTMLElement) => element.getAttribute('data-annotation-id'),
    renderHTML: (attributes: { annotationId: string | null }) => {
      if (!attributes.annotationId) return {}
      return { 'data-annotation-id': attributes.annotationId }
    },
  },
}

// Helper to create annotation mark with specific type
function createAnnotationMark(name: string) {
  return Mark.create({
    name,

    // Allow this mark to coexist with other annotation marks
    excludes: '',

    addAttributes() {
      return { ...baseAttributes }
    },

    parseHTML() {
      return [{ tag: `span[data-annotation-type="${name}"]` }]
    },

    renderHTML({ HTMLAttributes }) {
      return [
        'span',
        mergeAttributes(HTMLAttributes, {
          'data-annotation-type': name,
          class: `annotation-mark annotation-mark-${name}`,
        }),
        0,
      ]
    },
  })
}

// Individual mark types - can overlap because they're different mark types
export const ReferenceAnnotationMark = createAnnotationMark('reference')
export const ListAnnotationMark = createAnnotationMark('list')
export const ConnectionAnnotationMark = createAnnotationMark('connection')

// Export all marks as an array for easy registration
export const AnnotationMarks = [
  ReferenceAnnotationMark,
  ListAnnotationMark,
  ConnectionAnnotationMark,
]
