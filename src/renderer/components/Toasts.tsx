import { useApp } from '../state/AppProvider'

export function Toasts() {
  const { toasts } = useApp()
  if (!toasts.length) return null
  return (
    <div className="toasts">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.tone}`}>
          {toast.message}
        </div>
      ))}
    </div>
  )
}
