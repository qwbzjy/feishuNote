import { useEffect, useRef, useState } from 'react'
import type { BlockItem } from './blockItems'

interface Props {
  x: number
  y: number
  items: BlockItem[]
  onSelect: (item: BlockItem) => void
  onClose: () => void
}

const COLUMNS = 3

export function BlockMenu({ x, y, items, onSelect, onClose }: Props) {
  const [active, setActive] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onPointerDown = (event: MouseEvent): void => {
      if (!ref.current?.contains(event.target as Node)) onClose()
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      const move = (delta: number): void => {
        setActive((value) => (value + delta + items.length) % items.length)
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        move(COLUMNS)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        move(-COLUMNS)
        return
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        move(1)
        return
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        move(-1)
        return
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault()
        const item = items[active]
        if (item) onSelect(item)
      }
    }
    window.addEventListener('mousedown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [active, items, onClose, onSelect])

  useEffect(() => {
    const node = ref.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)
    node?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const width = 560
  const left = Math.max(8, Math.min(x, window.innerWidth - width - 12))
  const top = Math.max(8, Math.min(y, window.innerHeight - 500))

  let lastGroup = ''
  return (
    <div ref={ref} className="fn-slash fn-block-menu" style={{ left, top, width }}>
      <div className="fn-block-menu-title">
        <span>插入内容</span>
        <span>← ↑ ↓ → 选择 · ↵ 确认</span>
      </div>
      <div className="fn-block-menu-grid">
        {items.map((item, index) => {
          const showGroup = item.group !== lastGroup
          lastGroup = item.group
          return (
            <div key={item.title} style={{ display: 'contents' }}>
              {showGroup && <div className="fn-block-group">{item.group}</div>}
              <button
                type="button"
                data-index={index}
                className={`fn-block-cell${index === active ? ' active' : ''}`}
                title={item.description}
                onMouseEnter={() => setActive(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onSelect(item)}
              >
                <span className="fn-block-icon">{item.icon}</span>
                <span className="fn-block-label">{item.title}</span>
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
