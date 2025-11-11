import Together from "together-ai";
import OpenAI from 'openai'
import { Annotation } from './types'

const SYSTEM_PROMPT = `
You are a brilliant lateral thinker. A student of history, science, mathematics, philosophy and art.
You think in multi-disciplinary analogies, finding provocative insights in the long tail of human thought.
`.trim()

const USER_PROMPT_PREAMBLE = `
Here are some notes (very rough) about an essay I'm writing.
Research these ideas and provide places to extend/elaborate on them from a diversity of perspectives.
Form your response as JSON with replies to each section of the essay {block_id: annotations}.
where annotations is an array (0-3 in length) of {description, title, author, domain} (all fields are optional except description, title, domain):
- \`description\` is a short summary of the source (0-4 sentences)
- \`title\` is the name of the source (book title, essay title, etc).
- \`author\` is the name of the author (person name, optional)
- \`domain\` is the domain of the source (history, physics, philosophy, art, dance, typography, religion, etc)
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
          domain: { type: 'string' }
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

async function callAPI(userPrompt: string, onStreamChunk?: (buffer: string) => void, stream: boolean = false, schemaType: 'annotations' | 'list_items' = 'annotations', useStructuredOutput: boolean = true) {
  if (API_PROVIDER === 'kimi') {
    return callKimiAPI(userPrompt, onStreamChunk, stream)
  } else if (API_PROVIDER === 'openrouter') {
    return callOpenRouterAPI(userPrompt, onStreamChunk, stream, schemaType, useStructuredOutput)
  } else {
    return callTogetherAPI(userPrompt, onStreamChunk, stream, schemaType)
  }
}

async function callTogetherAPI(userPrompt: string, onStreamChunk?: (buffer: string) => void, stream: boolean = true, schemaType: 'annotations' | 'list_items' = 'annotations') {
  console.log('userPrompt\n\n', userPrompt)

  // Select the appropriate schema based on schemaType
  const schema = schemaType === 'annotations' ? ANNOTATIONS_SCHEMA : LIST_ITEMS_SCHEMA

  if (stream) {
    const streamResponse = await together.chat.completions.create({
      model: MODEL_NAMES.together,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ],
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
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      temperature: temperature,
      response_format: { type: 'json_schema', schema },
      reasoning_effort: "high",
      stream: false
    })

    const fullResponse = response.choices[0]?.message?.content || ''
    return parseResponse(fullResponse)
  }
}

async function callKimiAPI(userPrompt: string, onStreamChunk?: (buffer: string) => void, stream: boolean = true) {
  if (stream) {
    const streamResponse = await kimi.chat.completions.create({
      model: MODEL_NAMES.kimi,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ],
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
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      temperature: temperature,
      response_format: { type: 'json_object' },
      stream: false
    })

    const fullResponse = response.choices[0]?.message?.content || ''
    return parseResponse(fullResponse)
  }
}

async function callOpenRouterAPI(userPrompt: string, onStreamChunk?: (buffer: string) => void, stream: boolean = true, schemaType: 'annotations' | 'list_items' = 'annotations', useStructuredOutput: boolean = true) {
  console.log('userPrompt\n\n', userPrompt)

  // Select the appropriate schema based on schemaType
  const responseFormat = useStructuredOutput
    ? (schemaType === 'annotations'
      ? OPENROUTER_ANNOTATIONS_SCHEMA
      : OPENROUTER_LIST_ITEMS_SCHEMA)
    : { type: 'json_object' }

  // OpenRouter-specific body options
  const requestOptions: any = {
    model: MODEL_NAMES.openrouter,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt }
    ],
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

export async function analyzeNote(noteText: string, blockTexts: Array<{ id: string; text: string }>): Promise<Record<string, Annotation[]>> {
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
  const parsedBlocks: Record<string, Annotation[]> = {}

  const parsed = await callAPI(userPrompt, (currentBuffer) => {
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
  const result: Record<string, Annotation[]> = {}
  for (const [blockId, annotations] of Object.entries(parsed)) {
    result[blockId] = (annotations as any[]) || []
  }
  return result
}

export async function analyzeBlock(
  fullNoteText: string,
  currentBlockText: string,
  existingAnnotations: Annotation[] = []
): Promise<Annotation[]> {
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

Form your response as JSON {annotations: [annotation,...]} where annotations is a NON-EMPTY array (1-3 in length) of {description, title, author, domain}:
- \`description\` is a short summary of the source (1-4 sentences)
- \`title\` is the name of the source (book title, essay title, etc).
- \`author\` is the name of the author (person name, optional)
- \`domain\` is the domain of the source (history, physics, philosophy, art, dance, typography, religion, etc)

You MUST provide at least one annotation.${existingSourcesNote}
`.trim()

  const parsed = await callAPI(userPrompt, undefined, false)

  console.log('Response:', parsed.annotations)

  // Ensure we always return an array
  if (!parsed.annotations) {
    return []
  }

  // If it's already an array, return it
  if (Array.isArray(parsed.annotations)) {
    return parsed.annotations as Annotation[]
  }

  // If it's an object, try to convert it to an array
  if (typeof parsed.annotations === 'object') {
    return [parsed.annotations] as Annotation[]
  }

  // Fallback to empty array
  return []
}

export async function analyzeListItems(
  fullNoteText: string,
  originalListText: string,
  generatedItemsText: string = ''
): Promise<string[]> {
  let existingItemsNote = ''
  if (generatedItemsText && generatedItemsText.trim().length > 0) {
    existingItemsNote = `\n\nNote: The following items have already been generated for this list:\n${generatedItemsText}\n\nPlease provide new items that are different from these.`
  }

  const userPrompt = `
Here are some notes (very rough) about an essay I'm writing.

${fullNoteText}

Focus specifically on this list:

${originalListText}

Generate 3-5 more items that match the style, theme, and tone of the existing list items. The new items should fit naturally with the essay's overall direction and the examples already provided.

Form your response as JSON {items: [item1, item2, ...]} where items is a NON-EMPTY array of strings, each string being a new list item that matches the style and theme of the existing items.${existingItemsNote}
`.trim()

  const parsed = await callAPI(userPrompt, undefined, false, 'list_items')

  // Ensure we always return an array
  if (!parsed.items) {
    return []
  }

  // If it's already an array, return it
  if (Array.isArray(parsed.items)) {
    return parsed.items as string[]
  }

  // If it's an object, try to convert it to an array
  if (typeof parsed.items === 'object') {
    return Object.values(parsed.items) as string[]
  }

  return []
}


