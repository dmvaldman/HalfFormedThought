import { Note } from './types'

const STORAGE_KEY = 'half-formed-thought-notes'

function migrateNote(note: any): Note {
  return note
}

export function loadNotes(): Note[] {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (!stored) {
    return []
  }
  try {
    const notes = JSON.parse(stored)
    const migratedNotes = notes.map(migrateNote)
    saveNotes(migratedNotes)
    return migratedNotes
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


