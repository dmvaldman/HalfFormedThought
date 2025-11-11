import { Note } from './types'

const STORAGE_KEY = 'half-formed-thought-notes'

function migrateNote(note: any): Note {
  // Migration stub - add future migrations here
  return normalizeNote(note)
}

function normalizeNote(note: any): Note {
  // Ensure content is an array (BlockNote document format)
  if (!Array.isArray(note.content)) {
    return {
      ...note,
      content: [],
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
    const migratedNotes = notes.map(migrateNote)
    // Save migrated notes back to storage
    saveNotes(migratedNotes)
    return migratedNotes.map(normalizeNote)
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


