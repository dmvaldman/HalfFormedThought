import { Annotation } from './types'
import { generateId } from './storage'

export function formatAnnotationAsMarkdown(annotation: Annotation): string {
  const parts: string[] = []

  if (annotation.description) {
    parts.push(annotation.description)
  }

  if (annotation.relevance) {
    parts.push(`\n\n**Relevance:** ${annotation.relevance}`)
  }

  if (annotation.source) {
    parts.push(`\n\n**Source:** ${annotation.source}`)
  }

  if (annotation.domain) {
    parts.push(`\n\n**Domain:** ${annotation.domain}`)
  }

  return parts.join('')
}

export function createAnnotationFromAPI(apiAnnotation: any): Annotation {
  return {
    id: generateId(),
    description: apiAnnotation.description,
    relevance: apiAnnotation.relevance,
    source: apiAnnotation.source,
    domain: apiAnnotation.domain,
  }
}
