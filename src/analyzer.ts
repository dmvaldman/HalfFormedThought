import Together from 'together-ai'
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
where annotations is an array (0-3 in length) of {description, relevance, source, domain} (all fields are optional):
- \`description\` is a short summary of the source (0-4 sentences)
- \`relevance\` is why this source is relevant to the text block (0-4 sentences)
- \`source\` is the name of the source (person name, book title, essay title, etc).
- \`domain\` is the domain of the source (history, physics, philosophy, art, dance, typography, religion, etc)
`.trim()

// Configuration: choose API provider ('together' or 'kimi')
// NOTE: 'kimi' requires a backend proxy due to CORS restrictions - direct browser access is blocked
// Use 'together' for direct browser access without a proxy
const API_PROVIDER: 'together' | 'kimi' = 'together'

// Model names differ between providers
const MODEL_NAMES = {
  together: 'moonshotai/Kimi-K2-Instruct-0905',
  kimi: 'kimi-k2-0905-preview'
}

// JSON Schema for annotations response (for Together.ai JSON mode)
const ANNOTATIONS_SCHEMA = {
  type: 'object',
  properties: {
    annotations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          relevance: { type: 'string' },
          source: { type: 'string' },
          domain: { type: 'string' }
        },
        required: []
      }
    }
  },
  required: ['annotations']
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

async function callAPI(userPrompt: string, onStreamChunk?: (buffer: string) => void) {
  if (API_PROVIDER === 'kimi') {
    return callKimiAPI(userPrompt, onStreamChunk)
  } else {
    return callTogetherAPI(userPrompt, onStreamChunk)
  }
}

async function callTogetherAPI(userPrompt: string, onStreamChunk?: (buffer: string) => void) {
  const stream = await together.chat.completions.create({
    model: MODEL_NAMES.together,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.6,
    response_format: { type: 'json_schema', schema: ANNOTATIONS_SCHEMA },
    stream: true
  })

  console.log('userPrompt\n\n', userPrompt)

  let fullResponse = ''
  let currentBuffer = ''

  for await (const chunk of stream) {
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
}

async function callKimiAPI(userPrompt: string, onStreamChunk?: (buffer: string) => void) {
  const stream = await kimi.chat.completions.create({
    model: MODEL_NAMES.kimi,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.8,
    response_format: { type: 'json_object' },
    stream: true
  })

  let fullResponse = ''
  let currentBuffer = ''

  for await (const chunk of stream) {
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

export async function analyzeNote(blocks: Array<{ id: string; text: string }>): Promise<Record<string, Annotation[]>> {
  const blocksText = blocks
    .map(block => {
      const textWithBreaks = block.text.replace(/\\n/g, '\n')
      return `block_id: ${block.id}\n${textWithBreaks}`
    })
    .join('\n\n')

  const userPrompt = `${USER_PROMPT_PREAMBLE}\n\n${blocksText}`

  const blockIds = blocks.map(b => b.id)
  const completedBlocks = new Set<string>()
  const parsedBlocks: Record<string, Annotation[]> = {}

  const parsed = await callAPI(userPrompt, (currentBuffer) => {
    const completedBlock = tryExtractCompleteBlock(currentBuffer, blockIds, completedBlocks)

    if (completedBlock) {
      completedBlocks.add(completedBlock.blockId)
      parsedBlocks[completedBlock.blockId] = completedBlock.parsed[completedBlock.blockId] || []
    }
  })

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
  allBlocks: Array<{ id: string; text: string }>,
  currentBlock: { id: string; text: string },
  existingAnnotations: Annotation[] = []
): Promise<Annotation[]> {
  let existingSourcesNote = ''
  if (existingAnnotations && existingAnnotations.length > 0) {
    const sources = existingAnnotations
      .map(ann => ann.source)
      .filter(Boolean)
      .join(', ')
    if (sources) {
      existingSourcesNote = `\n\nNote: The following sources have already been provided for this block: ${sources}. Please provide annotations from different sources.`
    }
  }

  // Format all blocks as context
  const allBlocksText = allBlocks
    .map(block => {
      const textWithBreaks = block.text.replace(/\\n/g, '\n')
      return `block_id: ${block.id}\n${textWithBreaks}`
    })
    .join('\n\n')

  const userPrompt = `
Here are some notes (very rough) about an essay I'm writing.
Research the ideas and provide places to extend/elaborate on them from a diversity of perspectives.

${allBlocksText}

Focus specifically on this block:

block_id: ${currentBlock.id}
${currentBlock.text.replace(/\\n/g, '\n')}

Form your response as JSON with an array of annotations: {annotations: [...]}
where annotations is an array (1-3 in length) of {description, relevance, source, domain} (all fields are optional):
- \`description\` is a short summary of the source (0-4 sentences)
- \`relevance\` is why this source is relevant to the text block (0-4 sentences)
- \`source\` is the name of the source (person name, book title, essay title, etc).
- \`domain\` is the domain of the source (history, physics, philosophy, art, dance, typography, religion, etc)
You must provide at least one annotation.${existingSourcesNote}
`.trim()

  const parsed = await callAPI(userPrompt, undefined)

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


