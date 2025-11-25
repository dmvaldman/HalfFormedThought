import { RecordType } from './types'

interface ReferenceAnnotationProps {
  records: RecordType[]
}

const ReferenceAnnotation = (props: ReferenceAnnotationProps) => {
  const { records } = props

  return (
    <>
      {records.map((ann, index) => (
        <div key={index} className="annotation-item">
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
