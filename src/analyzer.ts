import { TextSpanAnnotation } from './types'
import { Message, llmService, LLMOptions } from './LLMService'

// JSON Schema for annotations response
const ANNOTATIONS_SCHEMA = {
  type: 'array',
  minItems: 0,
  maxItems: 3,
  items: {
    type: 'object',
    properties: {
      textSpan: { type: 'string' },
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
          required: ['description', 'title', 'domain', 'search_query']
        }
      }
    },
    required: ['textSpan', 'annotations']
  }
}

const SYSTEM_PROMPT = `
You are a brilliant lateral thinker. A student of history, science, mathematics, philosophy and art.
You think in multi-disciplinary analogies, finding provocative insights in the long tail of human thought.
`.trim()

const USER_PROMPT_PREAMBLE = `
Here are some notes (very rough) about an essay I'm writing.
Research these ideas and provide places to extend/elaborate on them from a diversity of perspectives.
Form your response as a JSON array of [{textSpan: string, annotations: [annotation..]}, ...]
- \`textSpan\` is the span of text being annotated. It *must* be an exact string match to the content (no "..." or correcting spelling or changing punctuation, etc).
- \`annotations\` is an array (1-3 in length) of {description, title, author, domain, search_query}:
- \`description\` is a short summary of the source (0-4 sentences)
- \`title\` is the name of the source (book title, essay title, etc).
- \`author\` is the name of the author (optional)
- \`domain\` is the domain of the source (history, physics, philosophy, art, dance, typography, religion, etc)
- \`search_query\` is a search query that will be used by a search engine to find more information about the source
Order your text spans in the order they appear in the content.
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
    // TODO: Re-enable conversation loading
    // const stored = localStorage.getItem(STORAGE_KEY)
    // if (!stored) {
    //   return []
    // }

    // try {
    //   const parsed = JSON.parse(stored)
    //   return (parsed[this.noteID] as Message[]) || []
    // } catch (error) {
    //   console.error('Error loading conversation:', error)
    //   return []
    // }
    return [] // Always start fresh for debugging
  }

  private saveConversation(): void {
    // TODO: Re-enable conversation saving
    // try {
    //   const stored = localStorage.getItem(STORAGE_KEY)
    //   const conversations: Record<string, Message[]> = stored ? JSON.parse(stored) : {}
    //   conversations[this.noteID] = this.conversation
    //   localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations))
    // } catch (error) {
    //   console.error('Error saving conversation:', error)
    // }
  }

  async analyze(initialContent: string, patch: string, getNoteContent?: () => string, title?: string): Promise<TextSpanAnnotation[] | null> {
    // Skip if patch is empty or only contains headers
    const patchLines = patch.split('\n').filter(line => line.trim() !== '')
    if (patchLines.length <= 2) { // Just headers, no actual changes
      return null
    }

    let newUserMessage: string

    // If this is a new conversation, create first message with preamble + title + full content
    if (this.conversation.length === 0) {
      const fullContent = getNoteContent ? getNoteContent() : initialContent
      const titleSection = title ? `Title: ${title}\n\n` : ''
      newUserMessage = `${USER_PROMPT_PREAMBLE}\n\n${titleSection}${fullContent}`
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

      // Parse and validate response - response should be an array directly
      let textSpanAnnotations: TextSpanAnnotation[] = []
      if (response && Array.isArray(response)) {
        textSpanAnnotations = response as TextSpanAnnotation[]
      }

      // Add assistant response to conversation
      const assistantMessage = JSON.stringify(response)
      this.conversation.push({ role: 'assistant', content: assistantMessage })

      // Save conversation
      this.saveConversation()

      console.log('Analysis complete:', textSpanAnnotations)
      return textSpanAnnotations
    } catch (error) {
      console.error('Error analyzing content:', error)
      // Remove the user message if API call failed
      this.conversation.pop()
      return null
    }
  }
}

