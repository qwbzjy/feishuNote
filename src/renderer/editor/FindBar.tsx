import type { Editor } from '@tiptap/core'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { applyFind, selectFindMatch, type FindState } from './search'

interface Props {
  editor: Editor
  onClose: () => void
}

export function FindBar({ editor, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<FindState>({ query: '', active: 0, matches: [] })
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
    return () => {
      applyFind(editor, '')
    }
  }, [editor])

  const search = (value: string, startAt = 0): void => {
    const next = applyFind(editor, value, startAt)
    setResult(next)
    if (next.matches[next.active]) selectFindMatch(editor, next.matches[next.active])
  }

  const move = (delta: number): void => {
    if (!result.matches.length) return
    const total = result.matches.length
    const active = (result.active + delta + total) % total
    const next = applyFind(editor, query, active)
    setResult(next)
    if (next.matches[active]) selectFindMatch(editor, next.matches[active])
  }

  return (
    <div className="fn-findbar">
      <input
        ref={inputRef}
        value={query}
        placeholder="在文档中查找"
        onChange={(event) => {
          setQuery(event.target.value)
          search(event.target.value)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            move(event.shiftKey ? -1 : 1)
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            onClose()
          }
        }}
      />
      <span className="fn-find-count">
        {query ? `${result.matches.length ? result.active + 1 : 0}/${result.matches.length}` : '0/0'}
      </span>
      <button type="button" className="icon-btn" title="上一个" onClick={() => move(-1)}>
        <ChevronUp size={14} />
      </button>
      <button type="button" className="icon-btn" title="下一个" onClick={() => move(1)}>
        <ChevronDown size={14} />
      </button>
      <button type="button" className="icon-btn" title="关闭" onClick={onClose}>
        <X size={14} />
      </button>
    </div>
  )
}
