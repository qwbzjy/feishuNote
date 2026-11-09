import { useEffect, useRef, type ReactNode } from 'react'

export interface PopupMenuItem {
  label: string
  icon?: ReactNode
  shortcut?: string
  danger?: boolean
  onClick: () => void
  disabled?: boolean
}

interface Props {
  x: number
  y: number
  items: Array<PopupMenuItem | 'separator'>
  onClose: () => void
}

export function PopupMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const close = (event: MouseEvent | KeyboardEvent): void => {
      if (event instanceof KeyboardEvent) {
        if (event.key === 'Escape') onClose()
        return
      }
      if (!ref.current?.contains(event.target as Node)) onClose()
    }
    const closeOnScroll = (): void => onClose()
    window.addEventListener('mousedown', close, true)
    window.addEventListener('keydown', close)
    window.addEventListener('resize', closeOnScroll)
    window.addEventListener('scroll', closeOnScroll, true)
    return () => {
      window.removeEventListener('mousedown', close, true)
      window.removeEventListener('keydown', close)
      window.removeEventListener('resize', closeOnScroll)
      window.removeEventListener('scroll', closeOnScroll, true)
    }
  }, [onClose])

  const width = 210
  const height = items.length * 32 + 12
  const left = Math.max(8, Math.min(x, window.innerWidth - width - 8))
  const top = Math.max(8, Math.min(y, window.innerHeight - height - 8))

  return (
    <div ref={ref} className="context-menu" style={{ left, top }}>
      {items.map((item, index) =>
        item === 'separator' ? (
          <div key={`sep-${index}`} className="context-separator" />
        ) : (
          <button
            key={item.label}
            type="button"
            className={`context-item${item.danger ? ' danger' : ''}`}
            disabled={item.disabled}
            onClick={() => {
              onClose()
              item.onClick()
            }}
          >
            {item.icon && <span className="ctx-icon">{item.icon}</span>}
            <span>{item.label}</span>
            {item.shortcut && <span className="ctx-shortcut">{item.shortcut}</span>}
          </button>
        )
      )}
    </div>
  )
}
