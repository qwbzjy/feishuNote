import StarterKit from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import Highlight from '@tiptap/extension-highlight'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import TextAlign from '@tiptap/extension-text-align'
import { TableKit } from '@tiptap/extension-table'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { Placeholder } from '@tiptap/extension-placeholder'
import { CharacterCount } from '@tiptap/extension-character-count'
import type { Extensions } from '@tiptap/core'
import { Callout } from './nodes/Callout'
import { Toggle } from './nodes/Toggle'
import { Column, Columns } from './nodes/Columns'
import { CodeBlock } from './nodes/CodeBlock'
import { ResizableImage } from './nodes/ResizableImage'
import { SlashCommand } from './slash/SlashCommand'
import { FindHighlight } from './search'

export function createExtensions(options: { onPickImage: () => void }): Extensions {
  return [
    Markdown.configure({ indentation: { style: 'space', size: 2 } }),
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4] },
      codeBlock: false,
      dropcursor: { color: '#3370FF', width: 2 },
      undoRedo: { depth: 300 },
      link: {
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: { rel: 'noopener noreferrer', class: 'fn-link' }
      },
      underline: {},
      trailingNode: { node: 'paragraph' }
    }),
    Highlight.configure({ multicolor: true }),
    TextStyle,
    Color,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    TableKit.configure({
      table: { resizable: true, lastColumnResizable: true, allowTableNodeSelection: true }
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Placeholder.configure({
      placeholder: ({ node }) => (node.type.name === 'heading' ? '标题' : '输入 “/” 选择插入内容'),
      showOnlyCurrent: true
    }),
    CharacterCount,
    ResizableImage,
    CodeBlock,
    Callout,
    Toggle,
    Columns,
    Column,
    SlashCommand.configure({ onPickImage: options.onPickImage }),
    FindHighlight
  ]
}
