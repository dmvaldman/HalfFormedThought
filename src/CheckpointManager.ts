import { Checkpoint } from './types'

const SHOULD_SAVE_MESSAGES = import.meta.env.VITE_SAVE_MESSAGES === 'true'
const STORAGE_KEY = 'half-formed-thought-conversations'

export class CheckpointManager {
  private noteID: string
  private checkpoints: Checkpoint[] = []
  private currentCheckpointId: string | null = null

  constructor(noteID: string) {
    this.noteID = noteID
    this.checkpoints = this.loadCheckpoints()
    // Set current checkpoint to the last one (most recent) if checkpoints exist
    if (this.checkpoints.length > 0) {
      const lastCheckpoint = this.checkpoints[this.checkpoints.length - 1]
      this.currentCheckpointId = lastCheckpoint.checkpointId
    }
  }

  // Get current checkpoint ID (for associating annotations)
  getCurrentCheckpointId(): string | null {
    return this.currentCheckpointId
  }

  private loadCheckpoints(): Checkpoint[] {
    if (!SHOULD_SAVE_MESSAGES) {
      return []
    }

    const stored = localStorage.getItem(`${STORAGE_KEY}-checkpoints`)
    if (!stored) {
      return []
    }

    try {
      const parsed = JSON.parse(stored)
      return (parsed[this.noteID] as Checkpoint[]) || []
    } catch (error) {
      console.error('Error loading checkpoints:', error)
      return []
    }
  }

  private saveCheckpoints(): void {
    if (!SHOULD_SAVE_MESSAGES) {
      return
    }

    try {
      const stored = localStorage.getItem(`${STORAGE_KEY}-checkpoints`)
      const allCheckpoints: Record<string, Checkpoint[]> = stored ? JSON.parse(stored) : {}
      allCheckpoints[this.noteID] = this.checkpoints
      localStorage.setItem(`${STORAGE_KEY}-checkpoints`, JSON.stringify(allCheckpoints))
    } catch (error) {
      console.error('Error saving checkpoints:', error)
    }
  }

  createCheckpoint(messageIndex: number, content: string, annotationIds: string[]): Checkpoint {
    const checkpoint: Checkpoint = {
      checkpointId: `checkpoint-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      messageIndex,
      timestamp: Date.now(),
      content,
      annotationIds: [...annotationIds]
    }

    this.checkpoints.push(checkpoint)
    this.currentCheckpointId = checkpoint.checkpointId
    this.saveCheckpoints()

    return checkpoint
  }

  // Get all checkpoints for UI
  getCheckpoints(): Checkpoint[] {
    return [...this.checkpoints]
  }

  // Restore to a checkpoint - returns restoration data
  restoreToCheckpoint(checkpointId: string, onMessagesTruncate: (messageIndex: number) => void): { content: string; annotationIds: string[] } | null {
    const checkpoint = this.checkpoints.find(c => c.checkpointId === checkpointId)
    if (!checkpoint) {
      return null
    }

    // Remove messages after this checkpoint (via callback)
    onMessagesTruncate(checkpoint.messageIndex)

    // Remove checkpoints after this one
    this.checkpoints = this.checkpoints.filter(c =>
      c.timestamp <= checkpoint.timestamp
    )

    // Update current checkpoint
    this.currentCheckpointId = checkpoint.checkpointId

    // Save changes
    this.saveCheckpoints()

    return {
      content: checkpoint.content,
      annotationIds: checkpoint.annotationIds
    }
  }
}

