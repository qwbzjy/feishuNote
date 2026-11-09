import { useApp } from '../state/AppProvider'

export function ConfirmDialog() {
  const { confirmState, answerConfirm } = useApp()
  if (!confirmState) return null
  const { request } = confirmState

  return (
    <div className="overlay center" onMouseDown={(event) => event.target === event.currentTarget && answerConfirm(false)}>
      <div className="modal" role="dialog" aria-modal>
        <div className="modal-header">
          <div className="modal-title">{request.title}</div>
        </div>
        <div className="modal-body">
          <p style={{ margin: '4px 0 12px', color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.7 }}>{request.message}</p>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn ghost" onClick={() => answerConfirm(false)}>
            取消
          </button>
          <button
            type="button"
            className={`btn ${request.danger ? 'danger' : 'primary'}`}
            onClick={() => answerConfirm(true)}
          >
            {request.confirmText ?? '确定'}
          </button>
        </div>
      </div>
    </div>
  )
}
