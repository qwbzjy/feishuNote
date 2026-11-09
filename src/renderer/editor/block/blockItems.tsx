import type { Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import type { ReactNode } from 'react'
import {
  Calendar,
  Code2,
  Columns2,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Image as ImageIcon,
  Lightbulb,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Quote,
  Table as TableIcon,
  Type,
  ChevronsDownUp
} from 'lucide-react'

export interface BlockContext {
  editor: Editor
  pos: number
  node: PMNode
  onPickImage: () => void
}

export interface BlockItem {
  title: string
  description: string
  group: string
  icon: ReactNode
  apply: (ctx: BlockContext) => void
}

function textblockChain(ctx: BlockContext) {
  const { editor, pos, node } = ctx
  if (node.isTextblock) {
    return editor.chain().focus().setTextSelection(pos + 1)
  }
  const at = pos + node.nodeSize
  editor.chain().focus().insertContentAt(at, { type: 'paragraph' }).run()
  return editor.chain().focus().setTextSelection(at + 1)
}

function insertBlock(ctx: BlockContext, content: Record<string, unknown>, replaceEmpty = true) {
  const { editor, pos, node } = ctx
  const empty = Boolean(node.isTextblock && node.content.size === 0)
  if (replaceEmpty && empty) {
    return editor
      .chain()
      .focus()
      .insertContentAt({ from: pos, to: pos + node.nodeSize }, content)
  }
  return editor.chain().focus().insertContentAt(pos + node.nodeSize, content)
}

function tableContent() {
  const cell = (header: boolean) => ({
    type: header ? 'tableHeader' : 'tableCell',
    content: [{ type: 'paragraph' }]
  })
  return {
    type: 'table',
    content: Array.from({ length: 3 }, (_, row) => ({
      type: 'tableRow',
      content: Array.from({ length: 3 }, () => cell(row === 0))
    }))
  }
}

function insertParagraphWithText(ctx: BlockContext, text: string) {
  insertBlock(ctx, { type: 'paragraph', content: [{ type: 'text', text }] }).run()
}

function today(): string {
  const now = new Date()
  return `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`
}

function pickImage(ctx: BlockContext) {
  const { editor, pos, node } = ctx
  if (node.isTextblock && node.content.size === 0) {
    editor.chain().focus().setTextSelection(pos + 1).run()
  } else {
    const at = pos + node.nodeSize
    editor.chain().focus().insertContentAt(at, { type: 'paragraph' }).run()
    editor.chain().focus().setTextSelection(at + 1).run()
  }
  ctx.onPickImage()
}

export function buildBlockItems(): BlockItem[] {
  return [
    {
      title: '正文',
      description: '普通文本段落',
      group: '基础',
      icon: <Type size={15} />,
      apply: (ctx) => {
        textblockChain(ctx).setParagraph().run()
      }
    },
    {
      title: '标题 1',
      description: '大标题',
      group: '基础',
      icon: <Heading1 size={15} />,
      apply: (ctx) => {
        textblockChain(ctx).setHeading({ level: 1 }).run()
      }
    },
    {
      title: '标题 2',
      description: '中标题',
      group: '基础',
      icon: <Heading2 size={15} />,
      apply: (ctx) => {
        textblockChain(ctx).setHeading({ level: 2 }).run()
      }
    },
    {
      title: '标题 3',
      description: '小标题',
      group: '基础',
      icon: <Heading3 size={15} />,
      apply: (ctx) => {
        textblockChain(ctx).setHeading({ level: 3 }).run()
      }
    },
    {
      title: '标题 4',
      description: '更小的标题',
      group: '基础',
      icon: <Heading4 size={15} />,
      apply: (ctx) => {
        textblockChain(ctx).setHeading({ level: 4 }).run()
      }
    },
    {
      title: '引用',
      description: '引用一段内容',
      group: '基础',
      icon: <Quote size={15} />,
      apply: (ctx) => {
        textblockChain(ctx).toggleBlockquote().run()
      }
    },
    {
      title: '无序列表',
      description: '项目符号列表',
      group: '列表',
      icon: <List size={15} />,
      apply: (ctx) => {
        textblockChain(ctx).toggleBulletList().run()
      }
    },
    {
      title: '有序列表',
      description: '带编号的列表',
      group: '列表',
      icon: <ListOrdered size={15} />,
      apply: (ctx) => {
        textblockChain(ctx).toggleOrderedList().run()
      }
    },
    {
      title: '待办事项',
      description: '可勾选的任务清单',
      group: '列表',
      icon: <ListTodo size={15} />,
      apply: (ctx) => {
        textblockChain(ctx).toggleTaskList().run()
      }
    },
    {
      title: '代码块',
      description: '带语法高亮的代码',
      group: '高级',
      icon: <Code2 size={15} />,
      apply: (ctx) => {
        textblockChain(ctx).setCodeBlock().run()
      }
    },
    {
      title: '表格',
      description: '插入 3 × 3 表格',
      group: '高级',
      icon: <TableIcon size={15} />,
      apply: (ctx) => {
        insertBlock(ctx, tableContent()).run()
      }
    },
    {
      title: '图片',
      description: '从本地选择图片',
      group: '高级',
      icon: <ImageIcon size={15} />,
      apply: (ctx) => pickImage(ctx)
    },
    {
      title: '高亮块',
      description: '带颜色的重点提示',
      group: '高级',
      icon: <Lightbulb size={15} />,
      apply: (ctx) => {
        insertBlock(ctx, {
          type: 'callout',
          attrs: { variant: 'note', title: '' },
          content: [{ type: 'paragraph' }]
        }).run()
      }
    },
    {
      title: '折叠块',
      description: '可展开收起的内容',
      group: '高级',
      icon: <ChevronsDownUp size={15} />,
      apply: (ctx) => {
        insertBlock(ctx, {
          type: 'toggle',
          attrs: { title: '折叠块' },
          content: [{ type: 'paragraph' }]
        }).run()
      }
    },
    {
      title: '两栏',
      description: '左右两栏布局',
      group: '高级',
      icon: <Columns2 size={15} />,
      apply: (ctx) => {
        insertBlock(ctx, {
          type: 'columns',
          attrs: { cols: 2 },
          content: [
            { type: 'column', content: [{ type: 'paragraph' }] },
            { type: 'column', content: [{ type: 'paragraph' }] }
          ]
        }).run()
      }
    },
    {
      title: '三栏',
      description: '三栏布局',
      group: '高级',
      icon: <Columns2 size={15} />,
      apply: (ctx) => {
        insertBlock(ctx, {
          type: 'columns',
          attrs: { cols: 3 },
          content: Array.from({ length: 3 }, () => ({
            type: 'column',
            content: [{ type: 'paragraph' }]
          }))
        }).run()
      }
    },
    {
      title: '当前日期',
      description: '插入今天的日期',
      group: '高级',
      icon: <Calendar size={15} />,
      apply: (ctx) => insertParagraphWithText(ctx, today())
    },
    {
      title: '分割线',
      description: '插入一条水平分割线',
      group: '高级',
      icon: <Minus size={15} />,
      apply: (ctx) => {
        insertBlock(ctx, { type: 'horizontalRule' }).run()
      }
    },
  ]
}
