import { Annotation } from './types'

interface AnnotationBlockData {
  annotations: Annotation[]
  isExpanded: boolean
}

class AnnotationBlock {
  private data: AnnotationBlockData
  private wrapper: HTMLElement | null = null

  constructor({ data }: any) {
    this.data = {
      annotations: data.annotations || [],
      isExpanded: data.isExpanded || false,
    }
  }

  static get toolbox() {
    return {
      title: 'Annotation',
      icon: '📝',
    }
  }

  render() {
    if (!this.wrapper) {
      this.wrapper = document.createElement('div')
      this.wrapper.classList.add('annotation-bar')
    } else {
      this.wrapper.innerHTML = ''
      this.wrapper.classList.add('annotation-bar')
    }

    if (this.data.annotations.length === 0) {
      return this.wrapper
    }

    const line = document.createElement('div')
    line.classList.add('annotation-line')
    line.onclick = () => this.toggleExpanded()

    const indicator = document.createElement('div')
    indicator.classList.add('annotation-line-indicator')
    indicator.textContent = `${this.data.isExpanded ? '▼' : '▶'} ${this.data.annotations.length} annotation${this.data.annotations.length !== 1 ? 's' : ''}`
    line.appendChild(indicator)

    this.wrapper.appendChild(line)

    if (this.data.isExpanded) {
      const content = document.createElement('div')
      content.classList.add('annotation-content')

      this.data.annotations.forEach((annotation) => {
        const item = document.createElement('div')
        item.classList.add('annotation-item')

        const markdown = document.createElement('div')
        markdown.classList.add('annotation-markdown')
        markdown.textContent = annotation.content
        item.appendChild(markdown)

        const deleteBtn = document.createElement('button')
        deleteBtn.classList.add('annotation-delete')
        deleteBtn.textContent = '×'
        deleteBtn.onclick = () => this.deleteAnnotation(annotation.id)
        item.appendChild(deleteBtn)

        content.appendChild(item)
      })

      this.wrapper.appendChild(content)
    }

    return this.wrapper
  }

  toggleExpanded() {
    this.data.isExpanded = !this.data.isExpanded
    this.render()
  }

  deleteAnnotation(annotationId: string) {
    this.data.annotations = this.data.annotations.filter((a) => a.id !== annotationId)
    this.render()
  }

  save() {
    return this.data
  }

  static get isReadOnlySupported() {
    return true
  }
}

export default AnnotationBlock

