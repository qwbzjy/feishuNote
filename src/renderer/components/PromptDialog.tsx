import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useApp } from '../state/AppProvider'

export function PromptDialog() {
  const { promptState, answerPrompt } = useApp()
  const [value, setValue] = useState(promptState?.request.initial ?? '')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setValue(promptState?.request.initial ?? '')
    const timer = window.setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 30)
    return () => window.clearTimeout(timer)
  }, [promptState])

  if (!promptState) return null
  const { request } = promptState

  const submit = (): void => {
    answerPrompt(value)
  }

  return (
    <div className="overlay center" onMouseDown={(event) => event.target === event.currentTarget && answerPrompt(null)}>
      <div className="modal" role="dialog" aria-modal>
        <div className="modal-header">
          <div className="modal-title">{request.title}</div>
          <button type="button" className="modal-close" onClick={() => answerPrompt(null)}>
            <X size={15} />
          </button>
        </div>
        <div className="modal-body">
          <div className="field">
            {request.label && <label className="field-label">{request.label}</label>}
            <input
              ref={inputRef}
              type="text"
              value={value}
              placeholder={request.placeholder}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  submit()
                }
                if (event.key === 'Escape') answerPrompt(null)
              }}
            />
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn ghost" onClick={() => answerPrompt(null)}>
            取消
          </button>
          <button type="button" className="btn primary" onClick={submit}>
            {request.confirmText ?? '确定'}
          </button>
        </div>
      </div>
    </div>
  )
}
