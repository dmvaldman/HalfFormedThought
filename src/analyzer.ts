import Together from 'together-ai'
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
An annotation is a unique expansion on the essay's theme relative to the text block
`.trim()

const model = 'moonshotai/Kimi-K2-Instruct-0905'

// Initialize Together client
const together = new Together({
  apiKey: (import.meta as any).env?.VITE_TOGETHER_API_KEY || '',
})

async function callTogetherAPI(userPrompt: string, onStreamChunk?: (buffer: string) => void) {
  const stream = await together.chat.completions.create({
    model: model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.6,
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

  const parsed = await callTogetherAPI(userPrompt, (currentBuffer) => {
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
where annotations is an array (0-3 in length) of {description, relevance, source, domain} (all fields are optional):
- \`description\` is a short summary of the source (0-4 sentences)
- \`relevance\` is why this source is relevant to the text block (0-4 sentences)
- \`source\` is the name of the source (person name, book title, essay title, etc).
- \`domain\` is the domain of the source (history, physics, philosophy, art, dance, typography, religion, etc)
An annotation is a unique expansion on the essay's theme relative to the text block${existingSourcesNote}
`.trim()

  console.log('userPrompt', userPrompt)

  const parsed = await callTogetherAPI(userPrompt)

  console.log('Response', parsed.annotations)
  return (parsed.annotations || []) as Annotation[]
}


