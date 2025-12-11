import { RecordType } from './types'
import { Message, llmService, LLMOptions, ToolCall, ToolResponse } from './LLMService'
import mockAnnotations from './mock/mockAnnotations.json'

const MOCK = import.meta.env.VITE_MOCK === 'true'
const SHOULD_SAVE_MESSAGES = import.meta.env.VITE_SAVE_MESSAGES === 'true'

// Result from a single annotation tool call
export interface AnnotationResult {
  type: 'reference' | 'list'
  textSpan: string
  records?: RecordType[]
  extensions?: string[]
}

// Result from analyze() - returns annotations instead of mutating state
export interface AnalyzeResult {
  noteId: string // The note this analysis was for (for routing results correctly)
  annotations: AnnotationResult[]
  toolCallsExecuted: boolean
}

const SYSTEM_PROMPT = `
You are a brilliant lateral thinker. A student of history, science, mathematics, philosophy and art.
You think in multi-disciplinary analogies, finding provocative insights in the long tail of human thought.

You have access to tools to help you analyze content:
- Use \`annotate\` to provide annotations for text spans with research sources and insights
- Use \`extendList\` to extend lists in the document by adding more entries

When annotating:
- We're not going for exhaustive coverage. We want to find the most interesting and provocative insights/extensions. Use your discretion and taste.
- Ensure textSpan is an exact string match to the content (no "..." or correcting spelling or changing punctuation)
- Ensure textSpan is not empty. It should match some part of the content.
- Don't repeat annotations for the same text span
`.trim()

const USER_PROMPT_PREAMBLE = `
Here are some notes (very rough) about an essay I'm writing.
Research these ideas and provide places to extend/elaborate on them from a diversity of perspectives.
`.trim()

const PATCH_PROMPT_PREAMBLE = `
Here's an update to the essay in the form of a patch. Anything to add?
If no significant changes have been made since the last analysis, or the user appears to be mid-edit, or simply rearranging content,just exit by returning an empty array.
`.trim()

// Conversation storage key
const STORAGE_KEY = 'half-formed-thought-conversations'

// Tool definitions
const ANNOTATE_TOOL = {
  type: 'function',
  function: {
    name: 'annotate',
    description: 'Annotate a text span with research sources and insights. Call this tool multiple times to annotate different text spans. Each call should annotate one text span.',
    parameters: {
      type: 'object',
      properties: {
        textSpan: {
          type: 'string',
          description: 'The exact span of text being annotated. Must be an exact string match to the content (no "...", correcting spelling/punctuation or starting/ending with punctuation/whitespace).'
        },
        records: {
          type: 'array',
          minItems: 1,
          maxItems: 3,
          description: 'Array of 1-3 record objects for this text span, providing diverse perspectives from different domains',
          items: {
            type: 'object',
            properties: {
              description: {
                type: 'string',
                description: 'A short summary of the source (0-4 sentences)'
              },
              title: {
                type: 'string',
                description: 'The name of the source (book title, essay title, etc)'
              },
              author: {
                type: 'string',
                description: 'The name of the author (optional)'
              },
              domain: {
                type: 'string',
                description: 'The domain of the source (history, physics, philosophy, poetry, art, dance, typography, religion, etc)'
              },
              search_query: {
                type: 'string',
                description: 'A search query that will be used by a search engine to find more information about the source'
              }
            },
            required: ['description', 'title', 'domain', 'search_query']
          }
        }
      },
      required: ['textSpan', 'records']
    }
  }
}

const GET_NOTE_CONTENT_TOOL = {
  type: 'function',
  function: {
    name: 'getNoteContent',
    description: 'Get the full current content of the note. Use this when you need to see the complete text to understand context or find exact text spans.',
    parameters: {
      type: 'object',
      properties: {},
    }
  }
}

const EXTEND_LIST_TOOL = {
  type: 'function',
  function: {
    name: 'extendList',
    description: 'Extend a list in the document by adding more entries. Lists can be identified by repeated use of "and/or" conjunctions or by literal bulletpointed lists with dashes. Provide 1-4 additional entries that extend the list in a meaningful way.',
    parameters: {
      type: 'object',
      properties: {
        textSpan: {
          type: 'string',
          description: 'The exact span of text containing the list to extend. Must be an exact string match to the content (no "...", correcting spelling/punctuation or starting/ending with punctuation/whitespace).'
        },
        extensions: {
          type: 'array',
          minItems: 1,
          maxItems: 4,
          description: 'Array of 1-4 string entries that extend the list',
          items: {
            type: 'string'
          }
        }
      },
      required: ['textSpan', 'extensions']
    }
  }
}

const TOOL_DEFINITIONS = [ANNOTATE_TOOL, GET_NOTE_CONTENT_TOOL, EXTEND_LIST_TOOL]

// Analyzer class - returns annotation data instead of mutating state
export class Analyzer {
  private noteID: string
  private messages: Message[]
  private currentContent: string = '' // Stored content for getNoteContent tool
  private abortController: AbortController | null = null

  constructor(noteID: string) {
    this.noteID = noteID
    this.messages = this.loadMessages()

    if (this.messages.length > 0) {
      console.log('Previous Messages:', this.messages)
    }
  }

  // Get the noteID this analyzer is for
  getNoteID(): string {
    return this.noteID
  }

  // Abort any in-progress analysis
  abort(): void {
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
  }

  // Get messages array (for checkpoint creation)
  getMessages(): Message[] {
    return this.messages
  }

  // Truncate messages to a specific index (for checkpoint restoration)
  truncateMessages(messageIndex: number): void {
    this.messages = this.messages.slice(0, messageIndex + 1)
    this.saveMessages()
  }

  private loadMessages(): Message[] {
    if (!SHOULD_SAVE_MESSAGES) {
      return []
    }

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

  private saveMessages(): void {
    if (!SHOULD_SAVE_MESSAGES) {
      return
    }

    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      const conversations: Record<string, Message[]> = stored ? JSON.parse(stored) : {}
      conversations[this.noteID] = this.messages
      localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations))
    } catch (error) {
      console.error('Error saving conversation:', error)
    }
  }

  async analyze(patch: string, currentContent: string, title?: string): Promise<AnalyzeResult> {
    // Store current content for getNoteContent tool
    this.currentContent = currentContent

    // Abort any previous in-progress analysis
    this.abort()
    this.abortController = new AbortController()

    const collectedAnnotations: AnnotationResult[] = []

    if (MOCK) {
      // For mock mode, return mock data as annotations
      const mockData = mockAnnotations as any[]
      mockData.forEach(annotation => {
        collectedAnnotations.push({
          type: 'reference',
          textSpan: annotation.textSpan,
          records: annotation.records
        })
      })
      return { noteId: this.noteID, annotations: collectedAnnotations, toolCallsExecuted: true }
    }

    console.log('analyzing...')

    // Skip if patch is empty or only contains headers
    const patchLines = patch.split('\n').filter(line => line.trim() !== '')
    if (patchLines.length <= 2) { // Just headers, no actual changes
      return { noteId: this.noteID, annotations: [], toolCallsExecuted: false }
    }

    let newUserMessage: string

    // If this is a new conversation, create first message with preamble + title
    if (this.messages.length === 0) {
      const titleSection = title ? `Title: ${title}\n\n` : ''
      newUserMessage = `${USER_PROMPT_PREAMBLE}\n\n${titleSection}\n\nInitial Content:\n\n${patch}`
    } else {
      // Otherwise, just use the patch
      const patchSection = patch ? `Patch:\n${patch}` : ''
      newUserMessage = `${PATCH_PROMPT_PREAMBLE}\n\n${patchSection}`
    }

    // Add user message to messages
    this.messages.push({ role: 'user', content: newUserMessage })
    console.log('User message:\n\n', newUserMessage)

    let toolCallsExecuted = false

    try {
      let finishReason: string | null = null
      let maxIterations = 10 // Prevent infinite loops
      let iteration = 0

      // Loop while finish_reason is null or "tool_calls" (following Kimi's pattern)
      while ((finishReason === null || finishReason === "tool_calls") && iteration < maxIterations) {
        iteration++

        // Rebuild messages array from message history each iteration
        // This ensures we always have the latest conversation state
        const messages: Message[] = [
          { role: 'system', content: SYSTEM_PROMPT },
          ...this.messages
        ]

        // Call LLM with conversation history and tools
        const options: LLMOptions = {
          temperature: 0.6,
          tools: TOOL_DEFINITIONS,
          reasoning_effort: "medium",
          signal: this.abortController?.signal
        }

        const response = await llmService.callLLM(messages, options)

        // LLM text accompanying a tool call for logging
        if (response.content) {
          console.log(response.content)
        }

        finishReason = response.finish_reason || null

        // Check if finish_reason indicates tool calls
        if (finishReason === "tool_calls" && response.tool_calls) {
          toolCallsExecuted = true // Mark that tool calls were executed

          // Add assistant message with tool calls to messages
          const assistantMessage = {
            role: 'assistant',
            content: response.content,
            tool_calls: response.tool_calls
          }
          this.messages.push(assistantMessage)

          // Execute tool calls and collect annotations
          const toolResponses: ToolResponse[] = []
          for (const toolCall of response.tool_calls) {
            const toolCallName = toolCall.function.name

            try {
              const result = this.executeTool(toolCall, collectedAnnotations)
              // Format successful result as JSON
              const content = JSON.stringify(result)

              toolResponses.push({
                tool_call_id: toolCall.id,
                role: 'tool',
                name: toolCallName,
                content
              })
            } catch (error) {
              // Catch errors and send error message to LLM so it can retry with different parameters
              const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'

              toolResponses.push({
                tool_call_id: toolCall.id,
                role: 'tool',
                name: toolCallName,
                content: errorMessage
              })
            }
          }

          // Add tool responses to messages
          this.messages.push(...(toolResponses as Message[]))

          // Continue the loop to allow more tool calls or get final response
          continue
        }

        // finish_reason is "stop" or something else - this is the final response
        // Add assistant response to messages
        if (response.content) {
          const finalMessage = {
            role: 'assistant',
            content: response.content
          }
          this.messages.push(finalMessage)
        }

        break
      }

      // Save conversation
      this.saveMessages()

      return { noteId: this.noteID, annotations: collectedAnnotations, toolCallsExecuted }
    } catch (error) {
      // Check if this was an abort
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Analysis aborted')
        // Remove the user message since we didn't complete
        this.messages.pop()
        return { noteId: this.noteID, annotations: [], toolCallsExecuted: false }
      }

      console.error('Error analyzing content:', error)
      // Remove the user message if API call failed
      this.messages.pop()
      throw error
    } finally {
      this.abortController = null
    }
  }

  // Execute a tool call and return the result (also collects annotations)
  private executeTool(toolCall: ToolCall, collectedAnnotations: AnnotationResult[]): any {
    const functionName = toolCall.function.name
    const args = JSON.parse(toolCall.function.arguments || '{}')

    if (functionName === 'annotate') {
      const textSpan = args.textSpan?.trim().replace(/^[.,:;!?]+|[.,:;!?]+$/g, '').trim()
      if (!textSpan) {
        throw new Error('TextSpan is empty after cleaning')
      }

      console.log('Annotate:', { textSpan, records: args.records })

      // Collect the annotation - Note will handle validation and storage
      collectedAnnotations.push({
        type: 'reference',
        textSpan,
        records: args.records
      })

      return { success: true, message: 'Annotation added' }
    } else if (functionName === 'getNoteContent') {
      console.log('getNoteContent called')
      return { content: this.currentContent }
    } else if (functionName === 'extendList') {
      const textSpan = args.textSpan?.trim().replace(/^[.,:;!?]+|[.,:;!?]+$/g, '').trim()
      if (!textSpan) {
        throw new Error('TextSpan is empty after cleaning')
      }
      if (!args.extensions || args.extensions.length === 0) {
        throw new Error('Extensions array is empty')
      }

      console.log('ExtendList:', { textSpan, extensions: args.extensions })

      // Collect the annotation - Note will handle validation and storage
      collectedAnnotations.push({
        type: 'list',
        textSpan,
        extensions: args.extensions
      })

      return { success: true, message: 'List extension added' }
    } else {
      throw new Error(`Unknown tool: ${functionName}`)
    }
  }
}

