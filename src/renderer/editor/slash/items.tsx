import type { Editor, Range } from '@tiptap/core'
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

export interface SlashContext {
  editor: Editor
  range: Range
  onPickImage: () => void
}

export interface SlashItem {
  title: string
  description: string
  group: string
  keywords: string[]
  icon: ReactNode
  run: (ctx: SlashContext) => void
}

function chain(editor: Editor, range: Range) {
  return editor.chain().focus().deleteRange(range)
}

function insertCallout(editor: Editor, range: Range): void {
  chain(editor, range)
    .insertContent({
      type: 'callout',
      attrs: { variant: 'note', title: '' },
      content: [{ type: 'paragraph' }]
    })
    .run()
}

function insertToggle(editor: Editor, range: Range): void {
  chain(editor, range)
    .insertContent({
      type: 'toggle',
      attrs: { title: '折叠块' },
      content: [{ type: 'paragraph' }]
    })
    .run()
}

function insertColumns(editor: Editor, range: Range, cols: number): void {
  const column = { type: 'column', content: [{ type: 'paragraph' }] }
  chain(editor, range)
    .insertContent({
      type: 'columns',
      attrs: { cols },
      content: Array.from({ length: cols }, () => column)
    })
    .run()
}

function today(): string {
  const now = new Date()
  return `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`
}

export function buildSlashItems(onPickImage: () => void): SlashItem[] {
  return [
    {
      title: '正文',
      description: '普通文本段落',
      group: '基础',
      keywords: ['text', 'paragraph', 'wenben', '正文'],
      icon: <Type size={15} />,
      run: ({ editor, range }) => chain(editor, range).setParagraph().run()
    },
    {
      title: '标题 1',
      description: '大标题',
      group: '基础',
      keywords: ['h1', 'heading', 'biaoti'],
      icon: <Heading1 size={15} />,
      run: ({ editor, range }) => chain(editor, range).setHeading({ level: 1 }).run()
    },
    {
      title: '标题 2',
      description: '中标题',
      group: '基础',
      keywords: ['h2', 'heading', 'biaoti'],
      icon: <Heading2 size={15} />,
      run: ({ editor, range }) => chain(editor, range).setHeading({ level: 2 }).run()
    },
    {
      title: '标题 3',
      description: '小标题',
      group: '基础',
      keywords: ['h3', 'heading', 'biaoti'],
      icon: <Heading3 size={15} />,
      run: ({ editor, range }) => chain(editor, range).setHeading({ level: 3 }).run()
    },
    {
      title: '标题 4',
      description: '更小的标题',
      group: '基础',
      keywords: ['h4', 'heading', 'biaoti'],
      icon: <Heading4 size={15} />,
      run: ({ editor, range }) => chain(editor, range).setHeading({ level: 4 }).run()
    },
    {
      title: '无序列表',
      description: '项目符号列表',
      group: '列表',
      keywords: ['bullet', 'list', 'liebiao'],
      icon: <List size={15} />,
      run: ({ editor, range }) => chain(editor, range).toggleBulletList().run()
    },
    {
      title: '有序列表',
      description: '带编号的列表',
      group: '列表',
      keywords: ['ordered', 'number', 'liebiao'],
      icon: <ListOrdered size={15} />,
      run: ({ editor, range }) => chain(editor, range).toggleOrderedList().run()
    },
    {
      title: '待办事项',
      description: '可勾选的任务清单',
      group: '列表',
      keywords: ['todo', 'task', 'check', 'daiban'],
      icon: <ListTodo size={15} />,
      run: ({ editor, range }) => chain(editor, range).toggleTaskList().run()
    },
    {
      title: '引用',
      description: '引用一段内容',
      group: '基础',
      keywords: ['quote', 'blockquote', 'yinyong'],
      icon: <Quote size={15} />,
      run: ({ editor, range }) => chain(editor, range).toggleBlockquote().run()
    },
    {
      title: '分割线',
      description: '插入一条水平分割线',
      group: '基础',
      keywords: ['divider', 'hr', 'fengexian'],
      icon: <Minus size={15} />,
      run: ({ editor, range }) => chain(editor, range).setHorizontalRule().run()
    },
    {
      title: '代码块',
      description: '带语法高亮的代码',
      group: '高级',
      keywords: ['code', 'codeblock', 'daima'],
      icon: <Code2 size={15} />,
      run: ({ editor, range }) => chain(editor, range).setCodeBlock().run()
    },
    {
      title: '表格',
      description: '插入 3 × 3 表格',
      group: '高级',
      keywords: ['table', 'biaoge'],
      icon: <TableIcon size={15} />,
      run: ({ editor, range }) => chain(editor, range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
    },
    {
      title: '图片',
      description: '从本地选择图片',
      group: '高级',
      keywords: ['image', 'picture', 'tupian'],
      icon: <ImageIcon size={15} />,
      run: ({ editor, range }) => {
        chain(editor, range).run()
        onPickImage()
      }
    },
    {
      title: '高亮块',
      description: '带颜色的重点提示',
      group: '高级',
      keywords: ['callout', 'highlight', 'gaoliang'],
      icon: <Lightbulb size={15} />,
      run: ({ editor, range }) => insertCallout(editor, range)
    },
    {
      title: '折叠块',
      description: '可展开收起的内容',
      group: '高级',
      keywords: ['toggle', 'details', 'zhedie'],
      icon: <ChevronsDownUp size={15} />,
      run: ({ editor, range }) => insertToggle(editor, range)
    },
    {
      title: '两栏',
      description: '左右两栏布局',
      group: '高级',
      keywords: ['columns', 'layout', 'fenlan'],
      icon: <Columns2 size={15} />,
      run: ({ editor, range }) => insertColumns(editor, range, 2)
    },
    {
      title: '三栏',
      description: '三栏布局',
      group: '高级',
      keywords: ['columns', 'layout', 'fenlan'],
      icon: <Columns2 size={15} />,
      run: ({ editor, range }) => insertColumns(editor, range, 3)
    },
    {
      title: '当前日期',
      description: '插入今天的日期',
      group: '高级',
      keywords: ['date', 'today', 'riqi'],
      icon: <Calendar size={15} />,
      run: ({ editor, range }) => chain(editor, range).insertContent(today()).run()
    }
  ]
}

export function filterSlashItems(items: SlashItem[], query: string): SlashItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return items
  return items.filter((item) => {
    const haystack = [item.title, item.description, ...item.keywords].join(' ').toLowerCase()
    return haystack.includes(q)
  })
}
