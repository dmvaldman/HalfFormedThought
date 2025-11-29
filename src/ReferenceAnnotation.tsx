import { RecordType } from './types'

interface ReferenceAnnotationProps {
  records: RecordType[]
  onDeleteRecord?: (recordIndex: number) => void
}

const ReferenceAnnotation = (props: ReferenceAnnotationProps) => {
  const { records, onDeleteRecord } = props

  return (
    <>
      {records.map((ann, index) => (
        <div key={index} className="annotation-item">
          {onDeleteRecord && (
            <button
              className="annotation-item-delete-button"
              onClick={(e) => {
                e.stopPropagation()
                onDeleteRecord(index)
              }}
              aria-label="Delete record"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          )}
          {ann.title && (
            <div className="annotation-title">{ann.title}</div>
          )}
          {ann.author && (
            <div className="annotation-author">{ann.author}</div>
          )}
          {ann.domain && (
            <div className="annotation-domain">{ann.domain}</div>
          )}
          {ann.search_query && (
            <div className="annotation-search-query">{ann.search_query}</div>
          )}
          {ann.description && (
            <div className="annotation-description">{ann.description}</div>
          )}
        </div>
      ))}
    </>
  )
}

export default ReferenceAnnotation
