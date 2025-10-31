import { Note } from './types'

const STORAGE_KEY = 'half-formed-thought-notes'

function normalizeNote(note: any): Note {
  // Convert old format (string content) to new format (ContentBlock[])
  if (typeof note.content === 'string') {
    return {
      ...note,
      content: note.content ? [{ text: note.content, annotations: [] }] : [],
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


