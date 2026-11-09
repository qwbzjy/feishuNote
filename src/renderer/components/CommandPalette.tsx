import type { DocMeta } from '@shared/types'
import { CornerDownLeft, FileText, Plus, Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { formatRelativeTime } from '../lib/format'
import { useApp } from '../state/AppProvider'
import { shortcut } from '../lib/platform'

type PaletteEntry =
  | { kind: 'action'; id: string; label: string; hint: string }
  | { kind: 'doc'; id: string; doc: DocMeta }

export function CommandPalette() {
  const app = useApp()
  const [query, setQuery] = useState('')
  const [docs, setDocs] = useState<DocMeta[]>([])
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!app.paletteOpen) return
    setQuery('')
    setDocs(app.recent)
    setActive(0)
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.paletteOpen])

  useEffect(() => {
    if (!app.paletteOpen) return
    const q = query.trim()
    if (!q) {
      setDocs(app.recent)
      setActive(0)
      return
    }
    let cancelled = false
    const timer = window.setTimeout(() => {
      void api.search
        .quick(q)
        .then((result) => {
          if (!cancelled) {
            setDocs(result)
            setActive(0)
          }
        })
        .catch(() => undefined)
    }, 120)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [query, app.paletteOpen, app.recent])

  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)
    node?.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (!app.paletteOpen) return null

  const entries: PaletteEntry[] = [
    { kind: 'action', id: 'new-doc', label: '新建文档', hint: shortcut('⌘N', 'Ctrl+N') },
    ...docs.map((doc) => ({ kind: 'doc' as const, id: `doc-${doc.id}`, doc }))
  ]

  const activate = (entry: PaletteEntry | undefined): void => {
    if (!entry) return
    app.setPaletteOpen(false)
    if (entry.kind === 'action') void app.createDoc()
    else void app.openDoc(entry.doc.path)
  }

  return (
    <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && app.setPaletteOpen(false)}>
      <div className="palette" role="dialog" aria-modal>
        <div className="palette-input-row">
          <Search size={16} style={{ color: 'var(--text-tertiary)' }} />
          <input
            ref={inputRef}
            className="palette-input"
            value={query}
            placeholder="搜索文档标题，或输入关键词…"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setActive((value) => (value + 1) % Math.max(1, entries.length))
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault()
                setActive((value) => (value - 1 + entries.length) % Math.max(1, entries.length))
              }
              if (event.key === 'Enter') {
                event.preventDefault()
                activate(entries[active])
              }
              if (event.key === 'Escape') app.setPaletteOpen(false)
            }}
          />
          <kbd>esc</kbd>
        </div>

        <div className="palette-list" ref={listRef}>
          <div className="palette-group">{query.trim() ? '搜索结果' : '快速操作'}</div>
          {entries.map((entry, index) => (
            <button
              key={entry.id}
              type="button"
              data-index={index}
              className={`palette-item${index === active ? ' active' : ''}`}
              onMouseEnter={() => setActive(index)}
              onClick={() => activate(entry)}
            >
              <span className="palette-icon">
                {entry.kind === 'action' ? <Plus size={14} /> : entry.doc.icon ? <span>{entry.doc.icon}</span> : <FileText size={14} />}
              </span>
              <span className="palette-main">
                <span className="palette-item-title">
                  {entry.kind === 'action' ? entry.label : entry.doc.title}
                </span>
                <span className="palette-item-sub">
                  {entry.kind === 'action'
                    ? '在当前目录下创建一篇空白文档'
                    : entry.doc.path + (entry.doc.excerpt ? ` · ${entry.doc.excerpt}` : '')}
                </span>
              </span>
              <span className="palette-meta">
                {entry.kind === 'action' ? entry.hint : formatRelativeTime(entry.doc.updatedAt)}
              </span>
            </button>
          ))}
          {entries.length <= 1 && (
            <div className="palette-empty">没有找到匹配的文档</div>
          )}
        </div>

        <div className="palette-footer">
          <span className="hint">
            <CornerDownLeft size={11} /> 打开
          </span>
          <span className="hint">↑↓ 选择</span>
          <span className="hint">esc 关闭</span>
          <span style={{ marginLeft: 'auto' }}>全局搜索 {shortcut('⌘⇧F', 'Ctrl+Shift+F')}</span>
        </div>
      </div>
    </div>
  )
}
