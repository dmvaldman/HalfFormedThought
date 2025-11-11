import { createReactBlockSpec, ToggleWrapper } from '@blocknote/react'

// Custom toggle block that matches the docs pattern
export const toggleBlockSpec = createReactBlockSpec(
  {
    type: 'toggle',
    propSchema: {
      isAnnotation: {
        default: false,
      },
    },
    content: 'inline',
  },
  {
    render: (props) => (
      <ToggleWrapper block={props.block} editor={props.editor}>
        <p ref={props.contentRef} />
      </ToggleWrapper>
    ),
  }
)

