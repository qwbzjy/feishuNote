import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import {
  Bold,
  Code,
  Highlighter,
  Italic,
  Link2,
  Palette,
  RemoveFormatting,
  Strikethrough,
  Underline as UnderlineIcon
} from 'lucide-react'
import { useState } from 'react'
import { keyCombo } from '../lib/platform'

const TEXT_COLORS = ['#1F2329', '#3370FF', '#34C724', '#FF8800', '#F54A45', '#7B61FF', '#00B5AD', '#8F959E']

export function BubbleToolbar({ editor }: { editor: Editor }) {
  const [linkOpen, setLinkOpen] = useState(false)
  const [href, setHref] = useState('')
  const [colorOpen, setColorOpen] = useState(false)

  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive('bold'),
      italic: current.isActive('italic'),
      underline: current.isActive('underline'),
      strike: current.isActive('strike'),
      highlight: current.isActive('highlight'),
      code: current.isActive('code'),
      link: current.isActive('link')
    })
  })

  const toggleLink = (): void => {
    setHref((editor.getAttributes('link').href as string) ?? '')
    setLinkOpen((value) => !value)
    setColorOpen(false)
  }

  const applyLink = (): void => {
    const value = href.trim()
    if (value) {
      editor.chain().focus().extendMarkRange('link').setLink({ href: value }).run()
    } else {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
    }
    setLinkOpen(false)
  }

  return (
    <div className="fn-bubble">
      <button
        type="button"
        className={`fn-bubble-btn${state.bold ? ' active' : ''}`}
        title={`加粗 ${keyCombo('B')}`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold size={15} />
      </button>
      <button
        type="button"
        className={`fn-bubble-btn${state.italic ? ' active' : ''}`}
        title={`斜体 ${keyCombo('I')}`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic size={15} />
      </button>
      <button
        type="button"
        className={`fn-bubble-btn${state.underline ? ' active' : ''}`}
        title={`下划线 ${keyCombo('U')}`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <UnderlineIcon size={15} />
      </button>
      <button
        type="button"
        className={`fn-bubble-btn${state.strike ? ' active' : ''}`}
        title="删除线"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough size={15} />
      </button>
      <span className="fn-bubble-sep" />
      <button
        type="button"
        className={`fn-bubble-btn${state.highlight ? ' active' : ''}`}
        title="高亮"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => editor.chain().focus().toggleHighlight({ color: '#FFF1B8' }).run()}
      >
        <Highlighter size={15} />
      </button>
      <div className="fn-bubble-pop">
        <button
          type="button"
          className={`fn-bubble-btn${colorOpen ? ' active' : ''}`}
          title="文字颜色"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            setColorOpen((value) => !value)
            setLinkOpen(false)
          }}
        >
          <Palette size={15} />
        </button>
        {colorOpen && (
          <div className="fn-popover" onMouseDown={(event) => event.preventDefault()}>
            <div className="fn-color-grid">
              {TEXT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className="fn-color-cell"
                  style={{ backgroundColor: color }}
                  title={color}
                  onClick={() => {
                    editor.chain().focus().setColor(color).run()
                    setColorOpen(false)
                  }}
                />
              ))}
            </div>
            <button
              type="button"
              className="btn ghost sm"
              style={{ marginTop: 6, width: '100%' }}
              onClick={() => {
                editor.chain().focus().unsetColor().run()
                setColorOpen(false)
              }}
            >
              恢复默认颜色
            </button>
          </div>
        )}
      </div>
      <div className="fn-bubble-pop">
        <button
          type="button"
          className={`fn-bubble-btn${state.link ? ' active' : ''}`}
          title={`链接 ${keyCombo('K')}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={toggleLink}
        >
          <Link2 size={15} />
        </button>
        {linkOpen && (
          <div className="fn-link-pop" onMouseDown={(event) => event.stopPropagation()}>
            <input
              autoFocus
              value={href}
              placeholder="粘贴链接后回车"
              onChange={(event) => setHref(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  applyLink()
                }
                if (event.key === 'Escape') setLinkOpen(false)
              }}
            />
            <button type="button" onClick={applyLink}>
              确定
            </button>
          </div>
        )}
      </div>
      <button
        type="button"
        className={`fn-bubble-btn${state.code ? ' active' : ''}`}
        title="行内代码"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <Code size={15} />
      </button>
      <span className="fn-bubble-sep" />
      <button
        type="button"
        className="fn-bubble-btn"
        title="清除格式"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => editor.chain().focus().unsetAllMarks().run()}
      >
        <RemoveFormatting size={15} />
      </button>
    </div>
  )
}
