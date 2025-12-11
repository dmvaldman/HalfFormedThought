import Together from "together-ai";
import OpenAI from 'openai'

export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface ToolResponse {
  tool_call_id: string
  role: string
  name: string
  content: string
}

export interface Message {
  role: string
  content?: string
  tool_calls?: ToolCall[]
}

export interface LLMOptions {
  temperature?: number
  response_format?: any
  reasoning_effort?: 'medium' | 'high' | 'low'
  tools?: any[]
  signal?: AbortSignal // For request cancellation
  [key: string]: any // Allow additional LLM-specific options
}

// Configuration: choose API provider ('together', 'kimi', or 'openrouter')
// NOTE: 'kimi' requires a backend proxy due to CORS restrictions - direct browser access is blocked
// Use 'together' or 'openrouter' for direct browser access without a proxy
const API_PROVIDER = (import.meta.env.VITE_API_PROVIDER as 'together' | 'kimi' | 'openrouter') || 'together'

// Model names differ between providers
const MODEL_NAMES = {
  together: 'moonshotai/Kimi-K2-Instruct-0905',
  kimi: 'kimi-k2-0905-preview',
  openrouter: 'moonshotai/kimi-k2-0905'
}

interface LLMResponse {
  content: string | null
  tool_calls?: ToolCall[]
  finish_reason?: string | null
}

// Abstract LLM Service
export abstract class LLMService {
  abstract callLLM(messages: Message[], options?: LLMOptions): Promise<LLMResponse>
}

// Together.ai implementation
class TogetherLLMService extends LLMService {
  private client: Together

  constructor() {
    super()
    this.client = new Together({
      apiKey: (import.meta as any).env?.VITE_TOGETHER_API_KEY || '',
    })
  }

  async callLLM(messages: Message[], options: LLMOptions = {}): Promise<LLMResponse> {
    const {
      temperature = 0.6,
      response_format,
      reasoning_effort = "high",
      tools,
      signal,
      ...restOptions
    } = options

    const response = await this.client.chat.completions.create({
      model: MODEL_NAMES.together,
      messages: messages as any,
      temperature,
      ...(response_format && { response_format }),
      reasoning_effort,
      ...(tools && { tools }),
      stream: false,
      ...restOptions
    }, { signal })

    const choice = response.choices[0]
    const message = choice?.message
    const content = message?.content || null
    const tool_calls = message?.tool_calls as ToolCall[] | undefined
    const finish_reason = choice?.finish_reason || null

    // If there are tool calls, return them directly
    if (tool_calls && tool_calls.length > 0) {
      return { content, tool_calls, finish_reason }
    }

    // If tools are provided, don't parse as JSON - LLM may return plain text
    if (tools && tools.length > 0) {
      return { content, tool_calls, finish_reason }
    }

    console.error('Empty response from Together.ai API')
    console.error('Full response object:', JSON.stringify(response, null, 2))
    throw new Error('Empty response from API')
  }
}

// Kimi/Moonshot implementation
class KimiLLMService extends LLMService {
  private client: OpenAI

  constructor() {
    super()
    this.client = new OpenAI({
      apiKey: (import.meta as any).env?.VITE_MOONSHOT_API_KEY || '',
      baseURL: 'https://api.moonshot.ai/v1',
      dangerouslyAllowBrowser: true,
    })
  }

  async callLLM(messages: Message[], options: LLMOptions = {}): Promise<LLMResponse> {
    const {
      temperature = 0.6,
      response_format,
      reasoning_effort, // Not supported by Kimi, ignore
      tools,
      signal,
      ...restOptions
    } = options

    const response = await this.client.chat.completions.create({
      model: MODEL_NAMES.kimi,
      messages: messages as any,
      temperature,
      ...(response_format && { response_format }),
      ...(tools && { tools }),
      stream: false,
      ...restOptions
    }, { signal })

    const choice = response.choices[0]
    const message = choice?.message
    const content = message?.content || null
    const tool_calls = message?.tool_calls as ToolCall[] | undefined
    const finish_reason = choice?.finish_reason || null

    // If there are tool calls, return them directly
    if (tool_calls && tool_calls.length > 0) {
      return { content, tool_calls, finish_reason }
    }

    // If tools are provided, don't parse as JSON - LLM may return plain text
    if (tools && tools.length > 0) {
      return { content, tool_calls, finish_reason }
    }

    return { content: null, tool_calls, finish_reason }
  }
}

// OpenRouter implementation
class OpenRouterLLMService extends LLMService {
  private client: OpenAI

  constructor() {
    super()
    this.client = new OpenAI({
      apiKey: (import.meta as any).env?.VITE_OPENROUTER_API_KEY || '',
      baseURL: 'https://openrouter.ai/api/v1',
      dangerouslyAllowBrowser: true,
      defaultHeaders: {
        'HTTP-Referer': window.location.origin,
        'X-Title': 'Half-Formed Thought'
      }
    })
  }

  async callLLM(messages: Message[], options: LLMOptions = {}): Promise<LLMResponse> {
    const {
      temperature = 0.6,
      response_format = { type: 'json_object' },
      tools,
      signal,
      ...restOptions
    } = options

    const response = await this.client.chat.completions.create({
      model: MODEL_NAMES.openrouter,
      messages: messages as any,
      temperature,
      response_format: response_format as any,
      ...(tools && { tools }),
      stream: false,
      ...restOptions
    } as any, { signal })

    const choice = response.choices[0]
    const message = choice?.message
    const content = message?.content || null
    const tool_calls = message?.tool_calls as ToolCall[] | undefined
    const finish_reason = choice?.finish_reason || null

    // If there are tool calls, return them directly
    if (tool_calls && tool_calls.length > 0) {
      return { content, tool_calls, finish_reason }
    }

    // If tools are provided, don't parse as JSON - LLM may return plain text
    if (tools && tools.length > 0) {
      return { content, tool_calls, finish_reason }
    }

    return { content: null, tool_calls, finish_reason }
  }
}

// Factory function to create the appropriate LLM service
function createLLMService(): LLMService {
  if (API_PROVIDER === 'kimi') {
    return new KimiLLMService()
  } else if (API_PROVIDER === 'openrouter') {
    return new OpenRouterLLMService()
  } else {
    return new TogetherLLMService()
  }
}

// Singleton instance
export const llmService = createLLMService()

