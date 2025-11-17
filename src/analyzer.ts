import Together from "together-ai";
import OpenAI from 'openai'
import { AnnotationType } from './types'

interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string
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

const temperature = 0.6

// Configuration: choose API provider ('together', 'kimi', or 'openrouter')
// NOTE: 'kimi' requires a backend proxy due to CORS restrictions - direct browser access is blocked
// Use 'together' or 'openrouter' for direct browser access without a proxy
const API_PROVIDER: 'together' | 'kimi' | 'openrouter' = 'together'

// Model names differ between providers
const MODEL_NAMES = {
  together: 'moonshotai/Kimi-K2-Instruct-0905',
  kimi: 'kimi-k2-0905-preview',
  openrouter: 'moonshotai/kimi-k2-0905'
}

// JSON Schema for annotations response (for Together.ai JSON mode)
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

// OpenRouter structured output format for annotations
const OPENROUTER_ANNOTATIONS_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'annotations',
    strict: true,
    schema: ANNOTATIONS_SCHEMA
  }
}

// JSON Schema for list items response
const LIST_ITEMS_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      minItems: 1,
      maxItems: 5,
      items: {
        type: 'string'
      }
    }
  },
  required: ['items']
}

// OpenRouter structured output format for list items
const OPENROUTER_LIST_ITEMS_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'list_items',
    strict: true,
    schema: LIST_ITEMS_SCHEMA
  }
}

// Initialize API clients
const together = new Together({
  apiKey: (import.meta as any).env?.VITE_TOGETHER_API_KEY || '',
})

const kimi = new OpenAI({
  apiKey: (import.meta as any).env?.VITE_MOONSHOT_API_KEY || '',
  baseURL: 'https://api.moonshot.ai/v1',
  dangerouslyAllowBrowser: true, // Required for browser environments
})

const openrouter = new OpenAI({
  apiKey: (import.meta as any).env?.VITE_OPENROUTER_API_KEY || '',
  baseURL: 'https://openrouter.ai/api/v1',
  dangerouslyAllowBrowser: true,
  defaultHeaders: {
    'HTTP-Referer': window.location.origin,
    'X-Title': 'Half-Formed Thought'
  }
})

async function callAPI(messages: Message[], onStreamChunk?: (buffer: string) => void, stream: boolean = false, schemaType: 'annotations' | 'list_items' = 'annotations', useStructuredOutput: boolean = true) {
  if (API_PROVIDER === 'kimi') {
    return callKimiAPI(messages, onStreamChunk, stream)
  } else if (API_PROVIDER === 'openrouter') {
    return callOpenRouterAPI(messages, onStreamChunk, stream, schemaType, useStructuredOutput)
  } else {
    return callTogetherAPI(messages, onStreamChunk, stream, schemaType)
  }
}

async function callTogetherAPI(messages: Message[], onStreamChunk?: (buffer: string) => void, stream: boolean = true, schemaType: 'annotations' | 'list_items' = 'annotations') {
  console.log('Messages:\n\n', messages)

  // Select the appropriate schema based on schemaType
  const schema = schemaType === 'annotations' ? ANNOTATIONS_SCHEMA : LIST_ITEMS_SCHEMA

  if (stream) {
    const streamResponse = await together.chat.completions.create({
      model: MODEL_NAMES.together,
      messages: messages,
      temperature: temperature,
      response_format: { type: 'json_schema', schema },
      reasoning_effort: "high",
      stream: true
    })

    let fullResponse = ''
    let currentBuffer = ''

    for await (const chunk of streamResponse) {
      const content = chunk.choices[0]?.delta?.content || ''
      if (content) {
        fullResponse += content
        currentBuffer += content
        if (onStreamChunk) {
          onStreamChunk(currentBuffer)
        }
      }
    }

    return parseResponse(fullResponse)
  } else {
    const response = await together.chat.completions.create({
      model: MODEL_NAMES.together,
      messages: messages,
      temperature: temperature,
      response_format: { type: 'json_schema', schema },
      reasoning_effort: "high",
      stream: false
    })

    const fullResponse = response.choices[0]?.message?.content || ''
    return parseResponse(fullResponse)
  }
}

async function callKimiAPI(messages: Message[], onStreamChunk?: (buffer: string) => void, stream: boolean = true) {
  if (stream) {
    const streamResponse = await kimi.chat.completions.create({
      model: MODEL_NAMES.kimi,
      messages: messages,
      temperature: temperature,
      response_format: { type: 'json_object' },
      stream: true
    })

    let fullResponse = ''
    let currentBuffer = ''

    for await (const chunk of streamResponse) {
      const content = chunk.choices[0]?.delta?.content || ''
      if (content) {
        fullResponse += content
        currentBuffer += content
        if (onStreamChunk) {
          onStreamChunk(currentBuffer)
        }
      }
    }

    return parseResponse(fullResponse)
  } else {
    const response = await kimi.chat.completions.create({
      model: MODEL_NAMES.kimi,
      messages: messages,
      temperature: temperature,
      response_format: { type: 'json_object' },
      stream: false
    })

    const fullResponse = response.choices[0]?.message?.content || ''
    return parseResponse(fullResponse)
  }
}

async function callOpenRouterAPI(messages: Message[], onStreamChunk?: (buffer: string) => void, stream: boolean = true, schemaType: 'annotations' | 'list_items' = 'annotations', useStructuredOutput: boolean = true) {
  console.log('Messages:\n\n', messages)

  // Select the appropriate schema based on schemaType
  const responseFormat = useStructuredOutput
    ? (schemaType === 'annotations'
      ? OPENROUTER_ANNOTATIONS_SCHEMA
      : OPENROUTER_LIST_ITEMS_SCHEMA)
    : { type: 'json_object' }

  // OpenRouter-specific body options
  const requestOptions: any = {
    model: MODEL_NAMES.openrouter,
    messages: messages,
    temperature: temperature,
    response_format: responseFormat,
    stream,
    provider: {
      sort: 'throughput'
    }
  }

  if (stream) {
    const streamResponse = await openrouter.chat.completions.create({
      ...requestOptions,
      stream: true
    })

    let fullResponse = ''
    let currentBuffer = ''

    for await (const chunk of streamResponse as any) {
      const content = chunk.choices[0]?.delta?.content || ''
      if (content) {
        fullResponse += content
        currentBuffer += content
        if (onStreamChunk) {
          onStreamChunk(currentBuffer)
        }
      }
    }

    return parseResponse(fullResponse)
  } else {
    const response = await openrouter.chat.completions.create({
      ...requestOptions,
      stream: false
    })
    const fullResponse = response.choices[0]?.message?.content || ''
    return parseResponse(fullResponse)
  }
}

async function parseResponse(fullResponse: string) {
  // Parse the response
  let cleanedResponse = fullResponse.trim()

  const jsonMatch = cleanedResponse.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/)
  if (jsonMatch) {
    cleanedResponse = jsonMatch[1].trim()
  }

  try {
    const parsed = JSON.parse(cleanedResponse)
    return parsed
  } catch (parseError) {
    // Try jsonrepair if available
    try {
      const { jsonrepair } = await import('jsonrepair')
      const repaired = jsonrepair(cleanedResponse)
      const parsed = JSON.parse(repaired)
      return parsed
    } catch (repairError) {
      console.error('\nFailed to parse or repair JSON response:')
      console.error('Full response:')
      console.log(cleanedResponse)
      throw parseError
    }
  }
}

function tryExtractCompleteBlock(
  currentBuffer: string,
  blockIds: string[],
  completedBlocks: Set<string>
): { blockId: string; parsed: any } | null {
  for (let i = 0; i < blockIds.length; i++) {
    const blockId = blockIds[i]
    if (completedBlocks.has(blockId)) continue

    const escapedBlockId = blockId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const blockPattern = new RegExp(`"\\s*${escapedBlockId}"\\s*:`)
    const startMatch = currentBuffer.match(blockPattern)

    if (!startMatch) continue

    const startIndex = startMatch.index! + startMatch[0].length
    const nextBlockId = blockIds[i + 1]

    let endIndex = currentBuffer.length
    if (nextBlockId) {
      const escapedNextBlockId = nextBlockId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const nextPattern = new RegExp(`"\\s*${escapedNextBlockId}"\\s*:`)
      const nextMatch = currentBuffer.match(nextPattern)
      if (nextMatch) {
        endIndex = nextMatch.index!
      }
    }

    const blockContent = currentBuffer.substring(startIndex, endIndex).trim()

    if (blockContent && (blockContent.endsWith(']') || blockContent.endsWith('],'))) {
      try {
        const blockEntry = `{"${blockId}":${blockContent.replace(/,$/, '')}}`
        // Try to parse directly first
        const parsed = JSON.parse(blockEntry)
        return { blockId, parsed }
      } catch (e) {
        // Not parseable yet, might be incomplete
      }
    }
  }

  return null
}

// Conversation storage
const STORAGE_KEY = 'half-formed-thought-conversations'
let conversationsCache: Map<string, Message[]> | null = null

function loadConversations(): Map<string, Message[]> {
  if (conversationsCache) {
    return conversationsCache
  }

  conversationsCache = new Map()
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored) {
    try {
      const parsed = JSON.parse(stored)
      for (const [noteID, messages] of Object.entries(parsed)) {
        conversationsCache.set(noteID, messages as Message[])
      }
    } catch (error) {
      console.error('Error loading conversations:', error)
    }
  }
  return conversationsCache
}

function saveConversations(): void {
  if (!conversationsCache) return

  try {
    const obj: Record<string, Message[]> = {}
    conversationsCache.forEach((messages, noteID) => {
      obj[noteID] = messages
    })
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj))
  } catch (error) {
    console.error('Error saving conversations:', error)
  }
}

function getConversation(noteID: string): Message[] {
  const conversations = loadConversations()
  return conversations.get(noteID) || []
}

// Analyzer class
export class Analyzer {
  private noteID: string
  private conversation: Message[]

  constructor(noteID: string) {
    this.noteID = noteID
    this.conversation = getConversation(noteID)
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
      // Call API with conversation history
      const response = await callAPI(messages, undefined, false, 'annotations')

      // Add assistant response to conversation
      const assistantMessage = JSON.stringify(response)
      this.conversation.push({ role: 'assistant', content: assistantMessage })

      // Update cache and save
      const conversations = loadConversations()
      conversations.set(this.noteID, this.conversation)
      saveConversations()

      console.log('Analysis complete:', response)
    } catch (error) {
      console.error('Error analyzing content:', error)
      // Remove the user message if API call failed
      this.conversation.pop()
    }
  }
}

// Initialize conversations cache on module load
loadConversations()

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

  const blockIds = blockTexts.map(b => b.id)
  const completedBlocks = new Set<string>()
  const parsedBlocks: Record<string, AnnotationType[]> = {}

  const messages: Message[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userPrompt }
  ]
  const parsed = await callAPI(messages, (currentBuffer) => {
    const completedBlock = tryExtractCompleteBlock(currentBuffer, blockIds, completedBlocks)

    if (completedBlock) {
      completedBlocks.add(completedBlock.blockId)
      parsedBlocks[completedBlock.blockId] = completedBlock.parsed[completedBlock.blockId] || []
    }
  }, true)

  // Return parsed blocks from streaming, or fallback to full parsed response
  if (Object.keys(parsedBlocks).length > 0) {
    return parsedBlocks
  }

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
  const parsed = await callAPI(messages, undefined, false)

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
