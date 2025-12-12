import { Component } from 'react'
import { NoteType } from './types'

interface SidebarProps {
  notes: NoteType[]
  currentNoteId: string | null
  onSelectNote: (noteId: string) => void
  onCreateNote: () => void
  onDeleteNote: (noteId: string) => void
}

interface SidebarState {
  isCollapsed: boolean
}

class Sidebar extends Component<SidebarProps, SidebarState> {
  state: SidebarState = {
    isCollapsed: false
  }

  handleToggleCollapse = () => {
    this.setState(prev => ({ isCollapsed: !prev.isCollapsed }))
  }

  render() {
    const { notes, currentNoteId, onSelectNote, onCreateNote, onDeleteNote } = this.props
    const { isCollapsed } = this.state

    return (
      <div className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          <button className="new-note-button" onClick={onCreateNote}>
            +
          </button>
          <button
            className="collapse-button"
            onClick={this.handleToggleCollapse}
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? '›' : '‹'}
          </button>
        </div>
        {!isCollapsed && (
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
        )}
      </div>
    )
  }
}

export default Sidebar

