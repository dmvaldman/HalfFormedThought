import { Component } from 'react'
import Sidebar from './Sidebar'
import Note from './Note'
import { NoteType } from './types'
import { loadNotes, saveNotes, generateId } from './storage'
import { debounce } from './utils'

interface AppState {
  notes: NoteType[]
  currentNoteId: string | null
}

class App extends Component<{}, AppState> {
  private debouncedSaveNotes: (notes: NoteType[]) => void

  constructor(props: {}) {
    super(props)
    const notes = loadNotes()

    this.state = {
      notes,
      currentNoteId: notes.length > 0 ? notes[0].id : null,
    }

    this.debouncedSaveNotes = debounce((notes: NoteType[]) => {
      saveNotes(notes)
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

    this.setState({
      notes: updatedNotes,
      currentNoteId: newCurrentNoteId,
    })
    saveNotes(updatedNotes)
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

  render() {
    const { notes, currentNoteId } = this.state
    const currentNote = notes.find((note) => note.id === currentNoteId) || null

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
            onUpdateTitle={this.handleUpdateTitle}
            onUpdateContent={this.handleUpdateContent}
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
