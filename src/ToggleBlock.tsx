import { createReactBlockSpec, ToggleWrapper } from '@blocknote/react'

// Custom toggle block that matches the docs pattern
export const toggleBlockSpec = createReactBlockSpec(
  {
    type: 'toggle',
    propSchema: {
      textContent: {
        default: 'More examples',
      },
    },
    content: 'none',
  },
  {
    render: (props) => (
      <ToggleWrapper block={props.block} editor={props.editor}>
        <span>{(props.block.props as any).textContent}</span>
      </ToggleWrapper>
    ),
  }
)

