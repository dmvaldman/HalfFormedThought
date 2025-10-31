import { Note } from './types'

const STORAGE_KEY = 'half-formed-thought-notes'

function normalizeNote(note: any): Note {
  // Convert old format (string content) to EditorJS format
  if (typeof note.content === 'string') {
    return {
      ...note,
      content: {
        blocks: note.content ? [{ type: 'paragraph', data: { text: note.content } }] : []
      },
    }
  }
  // Convert old ContentBlock[] format to EditorJS format
  if (Array.isArray(note.content)) {
    const blocks: any[] = []
    note.content.forEach((block: any) => {
      blocks.push({
        type: 'paragraph',
        data: { text: block.text || '' },
      })
      if (block.annotations && block.annotations.length > 0) {
        blocks.push({
          type: 'annotation',
          data: {
            annotations: block.annotations,
            isExpanded: false,
          },
        })
      }
    })
    return {
      ...note,
      content: { blocks },
    }
  }
  return note as Note
}

export function loadNotes(): Note[] {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (!stored) {
    return []
  }
  try {
    const notes = JSON.parse(stored)
    return notes.map(normalizeNote)
  } catch {
    return []
  }
}

export function saveNotes(notes: Note[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes))
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}


