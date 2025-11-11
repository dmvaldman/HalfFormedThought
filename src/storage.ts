import { Note, Annotation } from './types'

const STORAGE_KEY = 'half-formed-thought-notes'

function migrateAnnotation(annotation: any): Annotation {
  // If already in new format, return as-is (clean up legacy fields)
  if (annotation.title !== undefined) {
    const cleaned: Annotation = {
      description: annotation.description,
      title: annotation.title,
      author: annotation.author,
      domain: annotation.domain,
    }
    return cleaned
  }

  // Migrate from old format to new format
  const migrated: Annotation = {
    description: annotation.description,
    domain: annotation.domain,
  }

  // Convert source to title
  if (annotation.source) {
    migrated.title = annotation.source
  }

  // Author field is new, so it won't exist in old annotations
  if (annotation.author) {
    migrated.author = annotation.author
  }

  return migrated
}

function migrateAnnotationsInBlock(block: any): any {
  if (block.type === 'annotation' && block.props?.annotationsJson) {
    try {
      const annotations = JSON.parse(block.props.annotationsJson)
      const migratedAnnotations = annotations.map(migrateAnnotation)
      return {
        ...block,
        props: {
          ...block.props,
          annotationsJson: JSON.stringify(migratedAnnotations),
        },
      }
    } catch {
      return block
    }
  }
  return block
}

function migrateNote(note: any): Note {
  // Migrate annotations in all blocks
  if (Array.isArray(note.content)) {
    note.content = note.content.map(migrateAnnotationsInBlock)
  }

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


