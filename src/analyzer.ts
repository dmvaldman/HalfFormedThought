import { ReferenceAnnotation, ListAnnotation } from './types'
import { Message, llmService, LLMOptions, ToolCall, ToolResponse } from './LLMService'
import mockAnnotations from './mock/mockAnnotations.json'

const MOCK = import.meta.env.VITE_MOCK === 'true'

// Tool type definition
export interface Tool {
  type: string
  function: {
    name: string
    description: string
    parameters: any
  }
  execute: (...args: any[]) => any
}

// const SYSTEM_PROMPT = `
// You are a brilliant lateral thinker. A student of history, science, mathematics, philosophy and art.
// You think in multi-disciplinary analogies, finding provocative insights in the long tail of human thought.

// You have access to tools to help you analyze content:
// - Use \`getNoteContent\` to read the full current content of the note when you need context or to find exact text spans
// - Use \`annotate\` to provide annotations for text spans with research sources and insights

// When annotating:
// - Ensure textSpan is an exact string match to the content (no "..." or correcting spelling or changing punctuation)
// - Provide 1-3 annotations per text span from diverse perspectives
// `.trim()

const SYSTEM_PROMPT = `
You are a brilliant lateral thinker. A student of history, science, mathematics, philosophy and art.
You think in multi-disciplinary analogies, finding provocative insights in the long tail of human thought.

You have access to tools to help you analyze content:
- Use \`annotate\` to provide annotations for text spans with research sources and insights
- Use \`extendList\` to extend lists in the document by adding more entries

When annotating:
- We're not going for exhaustive coverage. We want to find the most interesting and provocative insights/extensions. Use your discretion and taste.
- Ensure textSpan is an exact string match to the content (no "..." or correcting spelling or changing punctuation)
- Don't repeat annotations for the same text span
`.trim()

const USER_PROMPT_PREAMBLE = `
Here are some notes (very rough) about an essay I'm writing.
Research these ideas and provide places to extend/elaborate on them from a diversity of perspectives.
`.trim()

const PATCH_PROMPT_PREAMBLE = `
Here's an update to the essay in the form of a patch. Anything to add?
If no significant changes have been made since the last analysis, just exit.
`.trim()

// Conversation storage key
const STORAGE_KEY = 'half-formed-thought-conversations'

// Analyzer class
export class Analyzer {
  private noteID: string
  private messages: Message[]
  private tools: Tool[]

  constructor(noteID: string, tools: Tool[]) {
    this.noteID = noteID
    this.tools = tools
    this.messages = this.loadConversation()
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
    //   conversations[this.noteID] = this.messages
    //   localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations))
    // } catch (error) {
    //   console.error('Error saving conversation:', error)
    // }
  }

  async analyze(currentContent: string, patch: string, title?: string): Promise<void> {
    if (MOCK) {
      // For mock mode, find the annotate tool and call it with mock data
      const annotateTool = this.tools.find(t => t.function.name === 'annotate')
      if (annotateTool) {
        // Mock data still has textSpan - will be converted to position in onAnnotate
        const mockData = mockAnnotations as any[]
        // Call execute for each annotation individually
        mockData.forEach(annotation => {
          annotateTool.execute(annotation)
        })
      }
      return
    }

    console.log('analyzing...')

    // Skip if patch is empty or only contains headers
    const patchLines = patch.split('\n').filter(line => line.trim() !== '')
    if (patchLines.length <= 2) { // Just headers, no actual changes
      return
    }

    let newUserMessage: string

    // If this is a new conversation, create first message with preamble + title
    if (this.messages.length === 0) {
      const titleSection = title ? `Title: ${title}\n\n` : ''
      newUserMessage = `${USER_PROMPT_PREAMBLE}\n\n${titleSection}\n\nInitial Content:\n\n${currentContent}`
    } else {
      // Otherwise, just use the patch
      const patchSection = patch ? `Patch:\n${patch}` : ''
      newUserMessage = `${PATCH_PROMPT_PREAMBLE}\n\n${patchSection}`
    }

    // Add user message to messages
    this.messages.push({ role: 'user', content: newUserMessage })
    console.log('User message:\n\n', newUserMessage)

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

        // Extract tool definitions (without execute functions) for API call
        const toolDefinitions = this.tools.map(tool => ({
          type: tool.type,
          function: tool.function
        }))

        // Call LLM with conversation history and tools
        const options: LLMOptions = {
          temperature: 0.6,
          tools: toolDefinitions,
          reasoning_effort: "medium"
        }

        const response = await llmService.callLLM(messages, options)

        // LLM text accompanying a tool call for logging
        if (response.content) {
          console.log(response.content)
        }

        finishReason = response.finish_reason || null

        // Check if finish_reason indicates tool calls
        if (finishReason === "tool_calls") {
          // Add assistant message with tool calls to messages
          const assistantMessage = {
            role: 'assistant',
            content: response.content,
            tool_calls: response.tool_calls
          }
          this.messages.push(assistantMessage)

          // Execute tool calls
          const toolResponses: ToolResponse[] = []
          for (const toolCall of response.tool_calls) {
            const toolCallName = toolCall.function.name

            const result = await this.executeTool(toolCall)

            // Construct tool message with tool_call_id and name (as per Kimi docs)
            // The tool_call_id and name are required for Kimi to match the tool call correctly
            toolResponses.push({
              tool_call_id: toolCall.id,
              role: 'tool',
              name: toolCallName,
              content: JSON.stringify(result)
            })
          }

          // Add tool responses to messages
          // Cast to Message[] since ToolResponse has compatible structure plus extra fields API needs
          this.messages.push(...(toolResponses as any))

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
      this.saveConversation()
    } catch (error) {
      console.error('Error analyzing content:', error)
      // Remove the user message if API call failed
      this.messages.pop()
      throw error
    }
  }

  private async executeTool(toolCall: ToolCall): Promise<any> {
    const functionName = toolCall.function.name
    const args = JSON.parse(toolCall.function.arguments || '{}')

    // Find the tool by name
    const tool = this.tools.find(t => t.function.name === functionName)
    if (!tool) {
      throw new Error(`Unknown tool: ${functionName}`)
    }

    // Execute the tool with appropriate arguments
    if (functionName === 'annotate') {
      // For annotate, args.records is already an array of 1-3 record objects
      // Note: textSpan will be converted to position in onAnnotate
      const annotation: any = {
        type: 'reference',
        textSpan: args.textSpan, // Temporary - will be converted to position
        records: args.records
      }
      console.log('Calling tool.execute with annotation:', annotation)

      try {
        tool.execute(annotation)
      } catch (error) {
        console.error('Error executing tool:', error)
        throw error
      }

      return { success: true, message: 'Annotation added' }
    } else if (functionName === 'getNoteContent') {
      // For getNoteContent, call execute with no arguments
      const content = tool.execute()
      return { content }
    } else if (functionName === 'extendList') {
      // For extendList, create ListAnnotation object
      // Note: textSpan will be converted to position in onExtendList
      const listExtension: any = {
        type: 'list',
        textSpan: args.textSpan, // Temporary - will be converted to position
        extensions: args.extensions
      }
      console.log('Calling tool.execute with listExtension:', listExtension)

      try {
        tool.execute(listExtension)
      } catch (error) {
        console.error('Error executing tool:', error)
        throw error
      }

      return { success: true, message: 'List extension added' }
    } else {
      // For other tools, call execute with args
      return tool.execute(args)
    }
  }
}

