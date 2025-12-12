import { NoteType, TextSpanAnnotation, RecordType } from './types'
import mockNoteContent from './mock/mockNoteContent'
import mockAnnotationsData from './mock/mockAnnotations.json'

const MOCK = import.meta.env.VITE_MOCK === 'true'
const SHOULD_SAVE_NOTES = import.meta.env.VITE_SAVE_NOTES === 'true'
const STORAGE_KEY = 'half-formed-thought-notes'
const ANNOTATIONS_STORAGE_KEY = 'half-formed-thought-annotations'

// Type for raw mock annotation data from JSON
interface MockAnnotationData {
  type: 'reference' | 'list' | 'connection'
  textSpan: string | string[]
  records?: RecordType[]
  extensions?: string[]
}

const MOCK_NOTE_ID = 'mock-note-1'

// Load mock data for development/testing
function loadMock(): { notes: NoteType[]; annotations: Map<string, TextSpanAnnotation[]> } {
  const note: NoteType = {
    id: MOCK_NOTE_ID,
    title: 'What do AI applications want?',
    content: mockNoteContent,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }

  const annotations = new Map<string, TextSpanAnnotation[]>()
  const mockAnnotations: TextSpanAnnotation[] = (mockAnnotationsData as MockAnnotationData[]).map((data, index) => {
    let annotation: TextSpanAnnotation['annotation']

    if (data.type === 'reference' && data.records) {
      annotation = { type: 'reference', records: data.records }
    } else if (data.type === 'list' && data.extensions) {
      annotation = { type: 'list', extensions: data.extensions }
    } else if (data.type === 'connection' && data.records) {
      annotation = { type: 'connection', records: data.records }
    } else {
      annotation = { type: 'reference', records: [] }
    }

    return {
      annotationId: `mock-annotation-${index}`,
      noteId: MOCK_NOTE_ID,
      textSpan: data.textSpan,
      annotation
    }
  })

  annotations.set(MOCK_NOTE_ID, mockAnnotations)

  return { notes: [note], annotations }
}

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
    return loadMock().notes
  }

  if (SHOULD_SAVE_NOTES) {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) {
      return []
    }

    const notes = JSON.parse(stored)
    return notes.map((n: any) => {
      const { annotations: _, ...cleanNote } = n
      return cleanNote as NoteType
    })
  }

  return []
}

// Load both notes and annotations, handling migration from old format
export function loadAll(): { notes: NoteType[]; annotations: Map<string, TextSpanAnnotation[]> } {
  if (MOCK) {
    return loadMock()
  }

  const annotations = new Map<string, TextSpanAnnotation[]>()

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
    for (const ann of parsed) {
      const existing = annotations.get(ann.noteId) || []
      existing.push(ann)
      annotations.set(ann.noteId, existing)
    }
  }

  // Add migrated annotations (from old format)
  for (const ann of migratedAnnotations) {
    const existing = annotations.get(ann.noteId) || []
    if (!existing.some(e => e.annotationId === ann.annotationId)) {
      existing.push(ann)
      annotations.set(ann.noteId, existing)
    }
  }

  // If we migrated any annotations, save them in new format and clean old notes
  if (migratedAnnotations.length > 0) {
    saveAnnotations(annotations)
    saveNotes(notes)
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
