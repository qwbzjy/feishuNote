import { Node, createBlockMarkdownSpec, mergeAttributes } from '@tiptap/core'
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react'
import { useEffect, useState } from 'react'
import {
  CALLOUT_VARIANTS,
  decodeAttributes,
  encodeAttributes,
  type CalloutVariant
} from '@shared/portable-markdown'

const ICONS: Record<CalloutVariant, string> = {
  note: '💡',
  tip: '✅',
  warning: '⚠️',
  caution: '⛔',
  important: '📌'
}

const LABELS: Record<CalloutVariant, string> = {
  note: '蓝色高亮块',
  tip: '绿色高亮块',
  warning: '黄色高亮块',
  caution: '红色高亮块',
  important: '紫色高亮块'
}

function CalloutView({ node, updateAttributes }: NodeViewProps) {
  const variant = (node.attrs.variant as CalloutVariant) || 'note'
  const [title, setTitle] = useState<string>(node.attrs.title ?? '')

  useEffect(() => {
    setTitle(node.attrs.title ?? '')
  }, [node.attrs.title])

  const commitTitle = (value: string): void => {
    if (value !== (node.attrs.title ?? '')) updateAttributes({ title: value })
  }

  return (
    <NodeViewWrapper className="fn-callout" data-variant={variant}>
      <div className="fn-callout-head" contentEditable={false}>
        <span className="fn-callout-icon" aria-hidden>
          {ICONS[variant]}
        </span>
        <input
          className="fn-callout-title"
          value={title}
          placeholder="高亮块标题"
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
        <div className="fn-callout-palette">
          {CALLOUT_VARIANTS.map((item) => (
            <button
              key={item}
              type="button"
              className={`fn-callout-dot${item === variant ? ' active' : ''}`}
              style={{ background: item === variant ? undefined : undefined, backgroundColor: paletteColor(item) }}
              title={LABELS[item]}
              aria-label={LABELS[item]}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => updateAttributes({ variant: item })}
            />
          ))}
        </div>
      </div>
      <NodeViewContent className="fn-callout-content" />
    </NodeViewWrapper>
  )
}

function paletteColor(variant: CalloutVariant): string {
  return { note: '#3370FF', tip: '#34C724', warning: '#FF8800', caution: '#F54A45', important: '#7B61FF' }[variant]
}

export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      variant: {
        default: 'note',
        parseHTML: (element) => element.getAttribute('data-variant') || 'note',
        renderHTML: (attributes) => ({ 'data-variant': attributes.variant })
      },
      title: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-title') || '',
        renderHTML: (attributes) => (attributes.title ? { 'data-title': attributes.title } : {})
      }
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="callout"]',
        contentElement: (element: HTMLElement) => element.querySelector('.fn-callout-content') ?? element
      },
      {
        tag: 'div[data-callout]',
        contentElement: (element: HTMLElement) => element.querySelector('.fn-callout-content') ?? element
      }
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    const variant = (node.attrs.variant as CalloutVariant) || 'note'
    const title = (node.attrs.title as string) || ''
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'callout',
        'data-variant': variant,
        class: 'fn-callout'
      }),
      [
        'div',
        { class: 'fn-callout-head' },
        ['span', { class: 'fn-callout-icon' }, ICONS[variant]],
        ...(title ? [['span', { class: 'fn-callout-title' }, title]] : [])
      ],
      ['div', { class: 'fn-callout-content' }, 0]
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutView)
  },

  ...createBlockMarkdownSpec({
    nodeName: 'callout',
    allowedAttributes: ['variant', 'title'],
    defaultAttributes: { variant: 'note', title: '' },
    parseAttributes: decodeAttributes,
    serializeAttributes: encodeAttributes
  })
})
