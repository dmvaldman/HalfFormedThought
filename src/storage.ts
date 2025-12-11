import { NoteType, TextSpanAnnotation } from './types'
import mockNoteContent from './mock/mockNoteContent'

const MOCK = import.meta.env.VITE_MOCK === 'true'
const SHOULD_SAVE_NOTES = import.meta.env.VITE_SAVE_NOTES === 'true'
const STORAGE_KEY = 'half-formed-thought-notes'
const ANNOTATIONS_STORAGE_KEY = 'half-formed-thought-annotations'

// Migration: extract annotations from old note format and return separately
function migrateNote(note: any): { note: NoteType; annotations: TextSpanAnnotation[] } {
  const annotations: TextSpanAnnotation[] = []

  // If note has embedded annotations (old format), extract them
  if (note.annotations && Array.isArray(note.annotations)) {
    note.annotations.forEach((ann: any) => {
      annotations.push({
        ...ann,
        noteId: note.id // Add noteId if missing
      })
    })
  }

  // Return note without annotations property
  const { annotations: _, ...cleanNote } = note
  return { note: cleanNote as NoteType, annotations }
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
    // Just return notes, migration happens in loadAll
    return notes.map((n: any) => {
      const { annotations: _, ...cleanNote } = n
      return cleanNote as NoteType
    })
  }
  else {
    return []
  }
}

// Load both notes and annotations, handling migration from old format
export function loadAll(): { notes: NoteType[]; annotations: Map<string, TextSpanAnnotation[]> } {
  const annotations = new Map<string, TextSpanAnnotation[]>()

  if (MOCK) {
    const initialNote: NoteType = {
      id: generateId(),
      title: 'What do AI applications want?',
      content: mockNoteContent,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    return { notes: [initialNote], annotations }
  }

  if (!SHOULD_SAVE_NOTES) {
    return { notes: [], annotations }
  }

  // Load notes
  const storedNotes = localStorage.getItem(STORAGE_KEY)
  if (!storedNotes) {
    return { notes: [], annotations }
  }

  const rawNotes = JSON.parse(storedNotes)
  const notes: NoteType[] = []
  const migratedAnnotations: TextSpanAnnotation[] = []

  // Migrate notes and extract embedded annotations
  for (const rawNote of rawNotes) {
    const { note, annotations: noteAnnotations } = migrateNote(rawNote)
    notes.push(note)
    migratedAnnotations.push(...noteAnnotations)
  }

  // Load stored annotations (new format)
  const storedAnnotations = localStorage.getItem(ANNOTATIONS_STORAGE_KEY)
  if (storedAnnotations) {
    const parsed = JSON.parse(storedAnnotations) as TextSpanAnnotation[]
    // Group by noteId
    for (const ann of parsed) {
      const existing = annotations.get(ann.noteId) || []
      existing.push(ann)
      annotations.set(ann.noteId, existing)
    }
  }

  // Add migrated annotations (from old format)
  for (const ann of migratedAnnotations) {
    const existing = annotations.get(ann.noteId) || []
    // Only add if not already present (avoid duplicates after migration)
    if (!existing.some(e => e.annotationId === ann.annotationId)) {
      existing.push(ann)
      annotations.set(ann.noteId, existing)
    }
  }

  // If we migrated any annotations, save them in new format and clean old notes
  if (migratedAnnotations.length > 0) {
    saveAnnotations(annotations)
    saveNotes(notes) // Save notes without embedded annotations
  }

  return { notes, annotations }
}

export function saveNotes(notes: NoteType[]): void {
  if (SHOULD_SAVE_NOTES) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes))
  }
}

export function saveAnnotations(annotations: Map<string, TextSpanAnnotation[]>): void {
  if (SHOULD_SAVE_NOTES) {
    // Flatten map to array for storage
    const allAnnotations: TextSpanAnnotation[] = []
    annotations.forEach(noteAnnotations => {
      allAnnotations.push(...noteAnnotations)
    })
    localStorage.setItem(ANNOTATIONS_STORAGE_KEY, JSON.stringify(allAnnotations))
  }
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}
