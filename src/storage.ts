import { NoteType } from './types'
import mockNoteContent from './mock/mockNoteContent'

const MOCK = import.meta.env.VITE_MOCK === 'true'
const SHOULD_SAVE_NOTES = import.meta.env.VITE_SAVE_NOTES === 'true'
const STORAGE_KEY = 'half-formed-thought-notes'

function migrateNote(note: any): NoteType {
  return note
}

export function loadNotes(): NoteType[] {
  if (MOCK) {
    const initialNote: NoteType = {
      id: generateId(),
      title: 'What do AI applications want?',
      content: mockNoteContent,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    return [initialNote]
  }

  if (SHOULD_SAVE_NOTES) {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) {
      return []
    }

    const notes = JSON.parse(stored)
    const migratedNotes = notes.map(migrateNote)
    return migratedNotes
  }
  else {
    return []
  }
}

export function saveNotes(notes: NoteType[]): void {
  if (SHOULD_SAVE_NOTES) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes))
  }
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}
