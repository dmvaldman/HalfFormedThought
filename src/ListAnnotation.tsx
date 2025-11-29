interface ListAnnotationProps {
  extensions: string[]
  onDeleteExtension?: (extensionIndex: number) => void
}

const ListAnnotation = (props: ListAnnotationProps) => {
  const { extensions, onDeleteExtension } = props

  return (
    <>
      {extensions.map((extension, index) => (
        <div key={index} className="annotation-item">
          {onDeleteExtension && (
            <button
              className="annotation-item-delete-button"
              onClick={(e) => {
                e.stopPropagation()
                onDeleteExtension(index)
              }}
              aria-label="Delete extension"
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
          <div className="annotation-description">{extension}</div>
        </div>
      ))}
    </>
  )
}

export default ListAnnotation

