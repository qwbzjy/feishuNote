import { Node, createBlockMarkdownSpec, mergeAttributes } from '@tiptap/core'
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react'
import { useEffect, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { decodeAttributes, encodeAttributes } from '@shared/portable-markdown'

function ToggleView({ node, updateAttributes }: NodeViewProps) {
  const [open, setOpen] = useState(true)
  const [title, setTitle] = useState<string>(node.attrs.title ?? '')

  useEffect(() => {
    setTitle(node.attrs.title ?? '')
  }, [node.attrs.title])

  const commitTitle = (value: string): void => {
    if (value !== (node.attrs.title ?? '')) updateAttributes({ title: value })
  }

  return (
    <NodeViewWrapper className={`fn-toggle${open ? ' open' : ' collapsed'}`}>
      <div className="fn-toggle-head" contentEditable={false}>
        <button
          type="button"
          className="fn-toggle-chevron"
          aria-label={open ? '折叠' : '展开'}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setOpen((value) => !value)}
        >
          <ChevronRight size={15} strokeWidth={2} />
        </button>
        <input
          className="fn-toggle-title"
          value={title}
          placeholder="折叠块标题"
          onChange={(event) => setTitle(event.target.value)}
          onBlur={(event) => commitTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commitTitle(title)
              ;(event.target as HTMLInputElement).blur()
            }
          }}
        />
      </div>
      <NodeViewContent className="fn-toggle-content" />
    </NodeViewWrapper>
  )
}

export const Toggle = Node.create({
  name: 'toggle',
  group: 'block',
  content: 'block+',
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      title: {
        default: '折叠块',
        parseHTML: (element) => element.getAttribute('data-title') || '折叠块',
        renderHTML: (attributes) => ({ 'data-title': attributes.title || '折叠块' })
      }
    }
  },

  parseHTML() {
    const contentElement = (element: HTMLElement): HTMLElement =>
      element.querySelector('.fn-toggle-content') ?? element
    return [
      { tag: 'div[data-type="toggle"]', contentElement },
      { tag: 'details[data-type="toggle"]', contentElement }
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    const title = (node.attrs.title as string) || '折叠块'
    return [
      'details',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'toggle',
        'data-title': title,
        class: 'fn-toggle',
        open: ''
      }),
      ['summary', {}, title],
      ['div', { class: 'fn-toggle-content' }, 0]
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ToggleView)
  },

  ...createBlockMarkdownSpec({
    nodeName: 'toggle',
    allowedAttributes: ['title'],
    defaultAttributes: { title: '折叠块' },
    parseAttributes: decodeAttributes,
    serializeAttributes: encodeAttributes
  })
})
