import { Component } from 'react'
import Sidebar from './Sidebar'
import NoteEditor from './NoteEditor'
import { Note } from './types'
import { loadNotes, saveNotes, generateId } from './storage'
import { debounce } from './utils'

interface AppState {
  notes: Note[]
  currentNoteId: string | null
}

class App extends Component<{}, AppState> {
  private debouncedSaveNotes: (notes: Note[]) => void

  constructor(props: {}) {
    super(props)
    const notes = loadNotes()
    this.state = {
      notes,
      currentNoteId: notes.length > 0 ? notes[0].id : null,
    }
    // Create debounced version of saveNotes
    this.debouncedSaveNotes = debounce((notes: Note[]) => {
      saveNotes(notes)
    }, 500)
  }

  handleSelectNote = (noteId: string) => {
    this.setState({ currentNoteId: noteId })
  }

  handleCreateNote = () => {
    const now = Date.now()
    const newNote: Note = {
      id: generateId(),
      title: '',
      content: [], // BlockNote format: array, not { blocks: [] }
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

    this.setState({
      notes: updatedNotes,
      currentNoteId: newCurrentNoteId,
    })
    saveNotes(updatedNotes)
  }

  handleUpdateNote = (noteId: string, title: string, content: any) => {
    const updatedNotes = this.state.notes.map((note) =>
      note.id === noteId
        ? { ...note, title, content, updatedAt: Date.now() }
        : note
    )
    this.setState({ notes: updatedNotes })
    this.debouncedSaveNotes(updatedNotes)
  }

  render() {
    const { notes, currentNoteId } = this.state
    const currentNote = notes.find((note) => note.id === currentNoteId) || null

    return (
      <div className="app">
        <Sidebar
          notes={notes}
          currentNoteId={currentNoteId}
          onSelectNote={this.handleSelectNote}
          onCreateNote={this.handleCreateNote}
          onDeleteNote={this.handleDeleteNote}
        />
        <NoteEditor note={currentNote} onUpdateNote={this.handleUpdateNote} />
      </div>
    )
  }
}

export default App

