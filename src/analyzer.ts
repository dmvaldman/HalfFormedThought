import { AnnotationType } from './types'
import { Message, llmService, LLMOptions } from './LLMService'

// JSON Schema for annotations response
const ANNOTATIONS_SCHEMA = {
  type: 'object',
  properties: {
    annotations: {
      type: 'array',
      minItems: 1,
      maxItems: 3,
      items: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          title: { type: 'string' },
          author: { type: 'string' },
          domain: { type: 'string' },
          search_query: { type: 'string' }
        },
        required: ['description', 'title', 'domain']
      }
    }
  },
  required: ['annotations']
}

const SYSTEM_PROMPT = `
You are a brilliant lateral thinker. A student of history, science, mathematics, philosophy and art.
You think in multi-disciplinary analogies, finding provocative insights in the long tail of human thought.
`.trim()

const USER_PROMPT_PREAMBLE = `
Here are some notes (very rough) about an essay I'm writing.
Research these ideas and provide places to extend/elaborate on them from a diversity of perspectives.
Form your response as JSON with replies to each section of the essay {block_id: annotations}.
where annotations is an array (0-3 in length) of {description, title, author, domain, search_query} (all fields are optional except description, title, domain):
- \`description\` is a short summary of the source (0-4 sentences)
- \`title\` is the name of the source (book title, essay title, etc).
- \`author\` is the name of the author (person name, optional)
- \`domain\` is the domain of the source (history, physics, philosophy, art, dance, typography, religion, etc)
- \`search_query\` is a search query that will be used by a search engine to find more information about the source (optional)
`.trim()

// Conversation storage key
const STORAGE_KEY = 'half-formed-thought-conversations'

// Analyzer class
export class Analyzer {
  private noteID: string
  private conversation: Message[]

  constructor(noteID: string) {
    this.noteID = noteID
    this.conversation = this.loadConversation()
  }

  private loadConversation(): Message[] {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) {
      return []
    }

    try {
      const parsed = JSON.parse(stored)
      return (parsed[this.noteID] as Message[]) || []
    } catch (error) {
      console.error('Error loading conversation:', error)
      return []
    }
  }

  private saveConversation(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      const conversations: Record<string, Message[]> = stored ? JSON.parse(stored) : {}
      conversations[this.noteID] = this.conversation
      localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations))
    } catch (error) {
      console.error('Error saving conversation:', error)
    }
  }

  async analyze(initialContent: string, patch: string, getNoteContent?: () => string): Promise<void> {
    // Skip if patch is empty or only contains headers
    const patchLines = patch.split('\n').filter(line => line.trim() !== '')
    if (patchLines.length <= 2) { // Just headers, no actual changes
      return
    }

    let newUserMessage: string

    // If this is a new conversation, create first message with preamble + full content
    if (this.conversation.length === 0) {
      const fullContent = getNoteContent ? getNoteContent() : initialContent
      newUserMessage = `${USER_PROMPT_PREAMBLE}\n\n${fullContent}`
    } else {
      // Otherwise, just use the patch
      newUserMessage = patch
    }

    // Add user message to conversation
    this.conversation.push({ role: 'user', content: newUserMessage })

    // Build messages array for API call
    const messages: Message[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...this.conversation
    ]

    try {
      // Call LLM with conversation history
      const options: LLMOptions = {
        temperature: 0.6,
        response_format: { type: 'json_schema' as const, schema: ANNOTATIONS_SCHEMA },
        reasoning_effort: "high"
      }
      const response = await llmService.callLLM(messages, options)

      // Add assistant response to conversation
      const assistantMessage = JSON.stringify(response)
      this.conversation.push({ role: 'assistant', content: assistantMessage })

      // Save conversation
      this.saveConversation()

      console.log('Analysis complete:', response)
    } catch (error) {
      console.error('Error analyzing content:', error)
      // Remove the user message if API call failed
      this.conversation.pop()
    }
  }
}


export async function analyzeNote(noteText: string, blockTexts: Array<{ id: string; text: string }>): Promise<Record<string, AnnotationType[]>> {
  // Format blocks with IDs for streaming response (still need IDs for response parsing)
  const blocksText = blockTexts
    .map(block => {
      const textWithBreaks = block.text.replace(/\\n/g, '\n')
      return `block_id: ${block.id}\n${textWithBreaks}`
    })
    .join('\n\n')

  // Use full note text in preamble, then blocks with IDs
  const userPrompt = `${USER_PROMPT_PREAMBLE}\n\n${noteText}\n\n---\n\nBlocks to analyze:\n\n${blocksText}`

  const messages: Message[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userPrompt }
  ]
  const options: LLMOptions = {
    temperature: 0.6,
    response_format: { type: 'json_schema' as const, schema: ANNOTATIONS_SCHEMA }
  }
  const parsed = await llmService.callLLM(messages, options)

  // Convert full response to our format
  const result: Record<string, AnnotationType[]> = {}
  for (const [blockId, annotations] of Object.entries(parsed)) {
    result[blockId] = (annotations as any[]) || []
  }
  return result
}

export async function analyzeBlock(
  fullNoteText: string,
  currentBlockText: string,
  existingAnnotations: AnnotationType[] = []
): Promise<AnnotationType[]> {
  let existingSourcesNote = ''
  if (existingAnnotations && existingAnnotations.length > 0) {
    const titles = existingAnnotations
      .map(ann => ann.title)
      .filter(Boolean)
      .join(', ')
    if (titles) {
      existingSourcesNote = `\n\nNote: The following sources have already been provided for this block: ${titles}. Please provide annotations from different sources.`
    }
  }

  const userPrompt = `
Here are some notes (very rough) about an essay I'm writing.
Research the ideas and provide places to extend/elaborate on them from a diversity of perspectives.

${fullNoteText}

Focus specifically on this section:

${currentBlockText}

Form your response as JSON {annotations: [annotation,...]} where annotations is a NON-EMPTY array (1-3 in length) of {description, title, author, domain, search_query}:
- \`description\` is a short summary of the source (1-4 sentences)
- \`title\` is the name of the source (book title, essay title, etc).
- \`author\` is the name of the author (person name, optional)
- \`domain\` is the domain of the source (history, physics, philosophy, art, dance, typography, religion, etc)
- \`search_query\` is a search query that will be used by a search engine to find more information about the source (optional)

You MUST provide at least one annotation.${existingSourcesNote}
`.trim()

  const messages: Message[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userPrompt }
  ]
  const options: LLMOptions = {
    temperature: 0.6,
    response_format: { type: 'json_schema' as const, schema: ANNOTATIONS_SCHEMA }
  }
  const parsed = await llmService.callLLM(messages, options)

  console.log('Response:', parsed.annotations)

  // Ensure we always return an array
  if (!parsed.annotations) {
    return []
  }

  // If it's already an array, return it
  if (Array.isArray(parsed.annotations)) {
    return parsed.annotations as AnnotationType[]
  }

  // If it's an object, try to convert it to an array
  if (typeof parsed.annotations === 'object') {
    return [parsed.annotations] as AnnotationType[]
  }

  // Fallback to empty array
  return []
}
