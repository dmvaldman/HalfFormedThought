import { Component } from 'react'
import { NoteType } from './types'
import collapseIcon from '../assets/collapse.svg'
import expandIcon from '../assets/expand.svg'

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

    // When collapsed, only render the floating expand button
    if (isCollapsed) {
      return (
        <button
          className="sidebar-expand-fab"
          onClick={this.handleToggleCollapse}
          title="Expand sidebar"
        >
          <img src={expandIcon} alt="Expand sidebar" />
        </button>
      )
    }

    return (
      <div className="sidebar">
        <div className="sidebar-header">
          <button className="new-note-button" onClick={onCreateNote}>
            +
          </button>
          <button
            className="collapse-button"
            onClick={this.handleToggleCollapse}
            title="Collapse sidebar"
          >
            <img src={collapseIcon} alt="Collapse sidebar" />
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

