import { Note } from './types'

const STORAGE_KEY = 'half-formed-thought-notes'

export function loadNotes(): Note[] {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (!stored) {
    return []
  }
  try {
    return JSON.parse(stored)
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

