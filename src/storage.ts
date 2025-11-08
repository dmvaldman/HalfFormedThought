import { Note } from './types'

const STORAGE_KEY = 'half-formed-thought-notes'

function normalizeNote(note: any): Note {
  // BlockNote format: content is already an array (BlockNote document)
  if (Array.isArray(note.content)) {
    // Check if it's BlockNote format (blocks have id, type, content properties)
    if (note.content.length === 0 || (note.content[0] && 'id' in note.content[0] && 'type' in note.content[0])) {
      // This is BlockNote format, return as-is
      return note as Note
    }
    // Old ContentBlock[] format - convert to BlockNote format
    const blocks: any[] = []
    note.content.forEach((block: any) => {
      blocks.push({
        id: block.id || `block-${Date.now()}-${Math.random()}`,
        type: 'paragraph',
        content: block.text ? [{ type: 'text', text: block.text }] : [],
      })
      if (block.annotations && block.annotations.length > 0) {
        blocks.push({
          id: `annotation-${Date.now()}-${Math.random()}`,
          type: 'callout',
          props: { type: 'info' },
          children: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: block.annotations.map((a: any) => a.description || '').join('\n') }],
            },
          ],
        })
      }
    })
    return {
      ...note,
      content: blocks,
    }
  }
  // Convert old format (string content) to BlockNote format
  if (typeof note.content === 'string') {
    return {
      ...note,
      content: note.content ? [{
        id: `block-${Date.now()}-${Math.random()}`,
        type: 'paragraph',
        content: [{ type: 'text', text: note.content }],
      }] : [],
    }
  }
  // Convert old EditorJS format { blocks: [...] } to BlockNote format
  if (note.content && typeof note.content === 'object' && 'blocks' in note.content && Array.isArray(note.content.blocks)) {
    const blocks: any[] = []
    note.content.blocks.forEach((block: any) => {
      if (block.type === 'paragraph') {
        const text = block.data?.text || ''
        blocks.push({
          id: block.id || `block-${Date.now()}-${Math.random()}`,
          type: 'paragraph',
          content: text ? [{ type: 'text', text }] : [],
        })
      }
    })
    return {
      ...note,
      content: blocks,
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


