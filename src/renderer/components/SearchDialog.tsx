import type { SearchHit } from '@shared/types'
import { ArrowRight, CornerDownLeft, FileText, Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { formatRelativeTime } from '../lib/format'
import { useApp } from '../state/AppProvider'

function Snippet({ text }: { text: string }) {
  const nodes: React.ReactNode[] = []
  const segments = text.split('\u0001')
  segments.forEach((segment, index) => {
    if (index === 0) {
      nodes.push(<span key={`t-${index}`}>{segment}</span>)
      return
    }
    const [marked, rest] = segment.split('\u0002')
    nodes.push(<mark key={`m-${index}`}>{marked}</mark>)
    if (rest) nodes.push(<span key={`r-${index}`}>{rest}</span>)
  })
  return <>{nodes}</>
}

export function SearchDialog() {
  const app = useApp()
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [active, setActive] = useState(0)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!app.searchOpen) return
    setQuery('')
    setHits([])
    setActive(0)
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30)
    return () => window.clearTimeout(timer)
  }, [app.searchOpen])

  useEffect(() => {
    if (!app.searchOpen) return
    const q = query.trim()
    if (q.length < 2) {
      setHits([])
      return
    }
    let cancelled = false
    setLoading(true)
    const timer = window.setTimeout(() => {
      void api.search
        .query(q)
        .then((result) => {
          if (!cancelled) {
            setHits(result)
            setActive(0)
          }
        })
        .catch(() => undefined)
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, 200)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [query, app.searchOpen])

  if (!app.searchOpen) return null

  const open = (hit: SearchHit): void => {
    app.setSearchOpen(false)
    void app.openDoc(hit.meta.path)
  }

  return (
    <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && app.setSearchOpen(false)}>
      <div className="palette" role="dialog" aria-modal>
        <div className="palette-input-row">
          <Search size={16} style={{ color: 'var(--text-tertiary)' }} />
          <input
            ref={inputRef}
            className="palette-input"
            value={query}
            placeholder="全文搜索标题和正文…"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setActive((value) => (value + 1) % Math.max(1, hits.length))
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault()
                setActive((value) => (value - 1 + hits.length) % Math.max(1, hits.length))
              }
              if (event.key === 'Enter' && hits[active]) {
                event.preventDefault()
                open(hits[active])
              }
              if (event.key === 'Escape') app.setSearchOpen(false)
            }}
          />
          <kbd>esc</kbd>
        </div>

        <div className="palette-list">
          <div className="palette-group">
            {query.trim().length < 2 ? '至少输入 2 个字符' : loading ? '搜索中…' : `${hits.length} 个结果`}
          </div>
          {hits.map((hit, index) => (
            <button
              key={hit.meta.id}
              type="button"
              className={`search-hit${index === active ? ' active' : ''}`}
              onMouseEnter={() => setActive(index)}
              onClick={() => open(hit)}
            >
              <span className="search-hit-title">
                {hit.meta.icon ? <span>{hit.meta.icon}</span> : <FileText size={13} />}
                {hit.meta.title}
                <span style={{ marginLeft: 'auto', color: 'var(--text-tertiary)', fontSize: 11, fontWeight: 400 }}>
                  {formatRelativeTime(hit.meta.updatedAt)}
                </span>
              </span>
              <span className="search-hit-snippet">
                <Snippet text={hit.snippet || hit.meta.excerpt} />
              </span>
              <span className="search-hit-path">{hit.meta.path}</span>
            </button>
          ))}
          {query.trim().length >= 2 && !loading && hits.length === 0 && (
            <div className="palette-empty">没有找到匹配内容</div>
          )}
        </div>

        <div className="palette-footer">
          <span className="hint">
            <CornerDownLeft size={11} /> 打开
          </span>
          <span className="hint">↑↓ 选择</span>
          <button
            type="button"
            className="hint"
            style={{ marginLeft: 'auto', color: 'var(--accent)' }}
            onClick={() => {
              app.setSearchOpen(false)
              void app.goSearch(query.trim())
            }}
          >
            在页面中查看全部结果 <ArrowRight size={11} />
          </button>
        </div>
      </div>
    </div>
  )
}
