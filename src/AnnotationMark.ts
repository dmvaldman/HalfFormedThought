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
function createAnnotationMark(name: string, backgroundColor: string) {
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
          style: `background-color: ${backgroundColor}`,
        }),
        0,
      ]
    },
  })
}

// Individual mark types - can overlap because they're different mark types
export const ReferenceAnnotationMark = createAnnotationMark(
  'reference',
  'rgba(100, 100, 100, 0.25)'
)

export const ListAnnotationMark = createAnnotationMark(
  'list',
  'rgba(255, 68, 68, 0.25)'
)

export const ConnectionAnnotationMark = createAnnotationMark(
  'connection',
  'rgba(97, 218, 251, 0.25)'
)

// Export all marks as an array for easy registration
export const AnnotationMarks = [
  ReferenceAnnotationMark,
  ListAnnotationMark,
  ConnectionAnnotationMark,
]
