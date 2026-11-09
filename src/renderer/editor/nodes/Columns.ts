import { Node, createBlockMarkdownSpec, mergeAttributes } from '@tiptap/core'
import { decodeAttributes, encodeAttributes } from '@shared/portable-markdown'

export const Columns = Node.create({
  name: 'columns',
  group: 'block',
  content: 'column+',
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      cols: {
        default: 2,
        parseHTML: (element) => Number(element.getAttribute('data-cols')) || 2,
        renderHTML: (attributes) => ({ 'data-cols': String(attributes.cols || 2) })
      }
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="columns"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'columns',
        class: 'fn-columns',
        'data-cols': String(node.attrs.cols || 2)
      }),
      0
    ]
  },

  ...createBlockMarkdownSpec({
    nodeName: 'columns',
    allowedAttributes: ['cols'],
    defaultAttributes: { cols: 2 },
    parseAttributes: decodeAttributes,
    serializeAttributes: encodeAttributes
  })
})

export const Column = Node.create({
  name: 'column',
  content: 'block+',
  defining: true,
  isolating: true,

  parseHTML() {
    return [{ tag: 'div[data-type="column"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'column', class: 'fn-column' }), 0]
  },

  ...createBlockMarkdownSpec({
    nodeName: 'column',
    parseAttributes: decodeAttributes,
    serializeAttributes: encodeAttributes
  })
})
