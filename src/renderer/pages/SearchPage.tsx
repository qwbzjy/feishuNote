import type { SearchHit } from '@shared/types'
import { FileText, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { formatRelativeTime } from '../lib/format'
import { useApp } from '../state/AppProvider'
import { SidebarToggle } from '../components/SidebarToggle'

function Snippet({ text }: { text: string }) {
  const parts: Array<{ text: string; mark: boolean }> = []
  let rest = text
  while (rest.length) {
    const start = rest.indexOf('\u0001')
    if (start === -1) {
      parts.push({ text: rest, mark: false })
      break
    }
    if (start > 0) parts.push({ text: rest.slice(0, start), mark: false })
    const end = rest.indexOf('\u0002', start + 1)
    if (end === -1) {
      parts.push({ text: rest.slice(start + 1), mark: true })
      break
    }
    parts.push({ text: rest.slice(start + 1, end), mark: true })
    rest = rest.slice(end + 1)
  }
  return (
    <>
      {parts.map((part, index) => (part.mark ? <mark key={index}>{part.text}</mark> : <span key={index}>{part.text}</span>))}
    </>
  )
}

export function SearchPage() {
  const app = useApp()
  const initialQuery = app.view.name === 'search' ? app.view.query : ''
  const [query, setQuery] = useState(initialQuery)
  const [hits, setHits] = useState<SearchHit[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setHits([])
      return
    }
    let cancelled = false
    setLoading(true)
    const timer = window.setTimeout(() => {
      void api.search
        .query(q)
        .then((next) => {
          if (!cancelled) setHits(next)
        })
        .catch(() => {
          if (!cancelled) setHits([])
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, 160)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [query])

  return (
    <>
      <div className={`topbar${app.sidebarVisible ? '' : ' no-sidebar'} drag-region`}>
        <div className="topbar-left no-drag">
          <SidebarToggle />
          <div className="breadcrumb">
            <span className="crumb current">搜索</span>
          </div>
        </div>
      </div>

      <div className="page-scroll">
        <div className="page-inner">
          <h1 className="page-heading">搜索文档</h1>
          <p className="page-sub">全文检索标题和正文，支持中文。</p>

          <div className="search-page-bar">
            <Search size={16} />
            <input
              autoFocus
              value={query}
              placeholder="输入关键词…"
              onChange={(event) => setQuery(event.target.value)}
            />
            {query && (
              <span className="muted" style={{ fontSize: 12 }}>
                {loading ? '搜索中…' : `${hits.length} 个结果`}
              </span>
            )}
          </div>

          {!query.trim() ? (
            <div className="empty-state">
              <Search size={22} />
              <h3>输入关键词开始搜索</h3>
              <p>例如输入「会议」可以找到所有包含该词的文档。</p>
            </div>
          ) : hits.length === 0 ? (
            <div className="empty-state">
              <Search size={22} />
              <h3>没有找到匹配内容</h3>
              <p>试试更短的关键词，或检查是否有错别字。</p>
            </div>
          ) : (
            <div className="doc-list">
              {hits.map((hit) => (
                <button
                  key={hit.meta.id}
                  type="button"
                  className="doc-card"
                  onClick={() => void app.openDoc(hit.meta.path)}
                >
                  <span className="doc-card-icon">
                    {hit.meta.icon ? <span>{hit.meta.icon}</span> : <FileText size={17} />}
                  </span>
                  <span className="doc-card-main">
                    <span className="doc-card-title">{hit.meta.title}</span>
                    <span className="doc-card-excerpt">
                      <Snippet text={hit.snippet || hit.meta.excerpt} />
                    </span>
                    <span className="doc-card-meta">
                      <span>{hit.meta.path}</span>
                      <span>{formatRelativeTime(hit.meta.updatedAt)}</span>
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
