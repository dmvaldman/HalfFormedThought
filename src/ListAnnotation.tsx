interface ListAnnotationProps {
  extensions: string[]
}

const ListAnnotation = (props: ListAnnotationProps) => {
  const { extensions } = props

  return (
    <>
      {extensions.map((extension, index) => (
        <div key={index} className="annotation-item">
          <div className="annotation-description">{extension}</div>
        </div>
      ))}
    </>
  )
}

export default ListAnnotation

