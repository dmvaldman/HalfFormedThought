import { Component } from 'react'
import { Note } from './types'

interface SidebarProps {
  notes: Note[]
  currentNoteId: string | null
  onSelectNote: (noteId: string) => void
  onCreateNote: () => void
  onDeleteNote: (noteId: string) => void
}

class Sidebar extends Component<SidebarProps> {
  render() {
    const { notes, currentNoteId, onSelectNote, onCreateNote, onDeleteNote } = this.props

    return (
      <div className="sidebar">
        <div className="sidebar-header">
          <button className="new-note-button" onClick={onCreateNote}>
            +
          </button>
        </div>
        <div className="notes-list">
          {notes.map((note) => (
            <div
              key={note.id}
              className={`note-item ${note.id === currentNoteId ? 'active' : ''}`}
              onClick={() => onSelectNote(note.id)}
            >
              <span className="note-title">{note.title || 'Untitled'}</span>
              <button
                className="delete-button"
                onClick={(e) => {
                  e.stopPropagation()
                  onDeleteNote(note.id)
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>
    )
  }
}

export default Sidebar

