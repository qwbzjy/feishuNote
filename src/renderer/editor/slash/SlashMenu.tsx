import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import type { SuggestionProps } from '@tiptap/suggestion'
import type { SlashItem } from './items'

export interface SlashMenuHandle {
  onKeyDown: (event: KeyboardEvent) => boolean
}

type Props = SuggestionProps<SlashItem>

export const SlashMenu = forwardRef<SlashMenuHandle, Props>(function SlashMenu(props, ref) {
  const [active, setActive] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const items = props.items

  useEffect(() => {
    setActive(0)
  }, [props.query])

  const choose = (index: number): void => {
    const item = items[index]
    if (!item) return
    props.command(item)
  }

  useImperativeHandle(ref, () => ({
    onKeyDown: (event) => {
      if (event.key === 'ArrowUp') {
        setActive((value) => (value <= 0 ? items.length - 1 : value - 1))
        return true
      }
      if (event.key === 'ArrowDown') {
        setActive((value) => (value >= items.length - 1 ? 0 : value + 1))
        return true
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        choose(active)
        return true
      }
      if (event.key === 'Escape') {
        props.editor.chain().focus().deleteRange(props.range).run()
        return true
      }
      return false
    }
  }))

  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)
    node?.scrollIntoView({ block: 'nearest' })
  }, [active])

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const rect = props.clientRect?.()
    if (!rect) return
    const width = 308
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))
    const below = window.innerHeight - rect.bottom - 16
    const above = rect.top - 16
    const showAbove = below < 220 && above > below
    const top = showAbove ? Math.max(12, rect.top - Math.min(356, above)) : rect.bottom + 6
    container.style.left = `${left}px`
    container.style.top = `${top}px`
  })

  if (!items.length) {
    return (
      <div className="fn-slash" ref={containerRef}>
        <div className="fn-slash-empty">没有匹配的插入项</div>
      </div>
    )
  }

  let lastGroup = ''
  return (
    <div className="fn-slash" ref={containerRef}>
      <div ref={listRef}>
        {items.map((item, index) => {
          const showGroup = item.group !== lastGroup
          lastGroup = item.group
          return (
            <div key={`${item.title}-${index}`}>
              {showGroup && <div className="fn-slash-group">{item.group}</div>}
              <button
                type="button"
                data-index={index}
                className={`fn-slash-item${index === active ? ' active' : ''}`}
                onMouseEnter={() => setActive(index)}
                onMouseDown={(event) => {
                  event.preventDefault()
                  choose(index)
                }}
              >
                <span className="fn-slash-icon">{item.icon}</span>
                <span className="fn-slash-main">
                  <div className="fn-slash-title">{item.title}</div>
                  <div className="fn-slash-desc">{item.description}</div>
                </span>
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
})
