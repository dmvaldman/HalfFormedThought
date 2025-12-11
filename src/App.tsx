import { Component } from 'react'
import Sidebar from './Sidebar'
import Note from './Note'
import { NoteType, TextSpanAnnotation } from './types'
import { loadAll, saveNotes, saveAnnotations, generateId } from './storage'
import { debounce } from './utils'

interface AppState {
  notes: NoteType[]
  annotations: Map<string, TextSpanAnnotation[]> // noteId -> annotations
  currentNoteId: string | null
}

class App extends Component<{}, AppState> {
  private debouncedSaveNotes: (notes: NoteType[]) => void
  private debouncedSaveAnnotations: (annotations: Map<string, TextSpanAnnotation[]>) => void

  constructor(props: {}) {
    super(props)
    const { notes, annotations } = loadAll()

    this.state = {
      notes,
      annotations,
      currentNoteId: notes.length > 0 ? notes[0].id : null,
    }

    this.debouncedSaveNotes = debounce((notes: NoteType[]) => {
      saveNotes(notes)
    }, 500)

    this.debouncedSaveAnnotations = debounce((annotations: Map<string, TextSpanAnnotation[]>) => {
      saveAnnotations(annotations)
    }, 500)
  }

  handleSelectNote = (noteId: string) => {
    this.setState({ currentNoteId: noteId })
  }

  handleCreateNote = () => {
    const now = Date.now()
    const newNote: NoteType = {
      id: generateId(),
      title: '',
      content: '',
      createdAt: now,
      updatedAt: now,
    }

    const updatedNotes = [newNote, ...this.state.notes]
    this.setState({
      notes: updatedNotes,
      currentNoteId: newNote.id,
    })

    saveNotes(updatedNotes)
  }

  handleDeleteNote = (noteId: string) => {
    const updatedNotes = this.state.notes.filter((note) => note.id !== noteId)
    let newCurrentNoteId = this.state.currentNoteId

    if (noteId === this.state.currentNoteId) {
      newCurrentNoteId = updatedNotes.length > 0 ? updatedNotes[0].id : null
    }

    // Clean up annotations for this note
    const updatedAnnotations = new Map(this.state.annotations)
    updatedAnnotations.delete(noteId)

    // Clean up associated messages and checkpoints from localStorage
    this.cleanupNoteData(noteId)

    this.setState({
      notes: updatedNotes,
      annotations: updatedAnnotations,
      currentNoteId: newCurrentNoteId,
    })
    saveNotes(updatedNotes)
    saveAnnotations(updatedAnnotations)
  }

  // Clean up messages and checkpoints for a deleted note
  private cleanupNoteData(noteId: string) {
    const SHOULD_SAVE_MESSAGES = import.meta.env.VITE_SAVE_MESSAGES === 'true'
    if (!SHOULD_SAVE_MESSAGES) {
      return
    }

    try {
      // Clean up messages
      const messagesKey = 'half-formed-thought-conversations'
      const storedMessages = localStorage.getItem(messagesKey)
      if (storedMessages) {
        const conversations: Record<string, any> = JSON.parse(storedMessages)
        delete conversations[noteId]
        localStorage.setItem(messagesKey, JSON.stringify(conversations))
      }

      // Clean up checkpoints
      const checkpointsKey = `${messagesKey}-checkpoints`
      const storedCheckpoints = localStorage.getItem(checkpointsKey)
      if (storedCheckpoints) {
        const allCheckpoints: Record<string, any> = JSON.parse(storedCheckpoints)
        delete allCheckpoints[noteId]
        localStorage.setItem(checkpointsKey, JSON.stringify(allCheckpoints))
      }
    } catch (error) {
      console.error('Error cleaning up note data:', error)
    }
  }

  handleUpdateTitle = (noteId: string, title: string) => {
    const updatedNotes = this.state.notes.map((note) =>
      note.id === noteId
        ? { ...note, title, updatedAt: Date.now() }
        : note
    )
    this.setState({ notes: updatedNotes })
    this.debouncedSaveNotes(updatedNotes)
  }

  handleUpdateContent = (noteId: string, content: string) => {
    const updatedNotes = this.state.notes.map((note) =>
      note.id === noteId
        ? { ...note, content, updatedAt: Date.now() }
        : note
    )
    this.setState({ notes: updatedNotes })
    this.debouncedSaveNotes(updatedNotes)
  }

  handleUpdateAnnotations = (noteId: string, annotations: TextSpanAnnotation[]) => {
    const updatedAnnotations = new Map(this.state.annotations)
    updatedAnnotations.set(noteId, annotations)
    this.setState({ annotations: updatedAnnotations })
    this.debouncedSaveAnnotations(updatedAnnotations)
  }

  render() {
    const { notes, annotations, currentNoteId } = this.state
    const currentNote = notes.find((note) => note.id === currentNoteId) || null
    const currentAnnotations = currentNote ? (annotations.get(currentNote.id) || []) : []

    let emptyText = ''
    if (!currentNote && notes.length === 0) {
      emptyText = 'Create your first note'
    }
    else if (!currentNote) {
      emptyText = 'Select a note to edit'
    }

    return (
      <div className="app">
        <Sidebar
          notes={notes}
          currentNoteId={currentNoteId}
          onSelectNote={this.handleSelectNote}
          onCreateNote={this.handleCreateNote}
          onDeleteNote={this.handleDeleteNote}
        />
        {currentNote && (
          <Note
            key={currentNote.id}
            note={currentNote}
            annotations={currentAnnotations}
            onUpdateTitle={this.handleUpdateTitle}
            onUpdateContent={this.handleUpdateContent}
            onUpdateAnnotations={this.handleUpdateAnnotations}
          />
        )}
        {!currentNote && (
          <div className="editor-empty">
            <p>{emptyText}</p>
          </div>
        )}
      </div>
    )
  }
}

export default App
