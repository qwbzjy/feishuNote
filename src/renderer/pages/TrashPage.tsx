import type { TrashedDoc } from '@shared/types'
import { FileText, FolderClosed, RotateCcw, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'
import { formatRelativeTime } from '../lib/format'
import { useApp } from '../state/AppProvider'
import { SidebarToggle } from '../components/SidebarToggle'

export function TrashPage() {
  const app = useApp()
  const [items, setItems] = useState<TrashedDoc[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      setItems(await api.trash.list())
    } catch (error) {
      app.toast(`读取回收站失败：${error instanceof Error ? error.message : String(error)}`, 'error')
    } finally {
      setLoading(false)
    }
  }, [app])

  useEffect(() => {
    void load()
  }, [load])

  const restore = async (item: TrashedDoc): Promise<void> => {
    try {
      if (item.kind === 'doc') {
        const doc = await api.trash.restoreDoc(item.id)
        app.toast(`已恢复「${doc.meta.title}」`, 'success')
      } else {
        await api.trash.restoreFolder(item.id)
        app.toast(`已恢复文件夹「${item.title}」`, 'success')
      }
      await load()
      await app.refreshAll()
    } catch (error) {
      app.toast(`恢复失败：${error instanceof Error ? error.message : String(error)}`, 'error')
    }
  }

  const remove = async (item: TrashedDoc): Promise<void> => {
    const ok = await app.confirm({
      title: '永久删除',
      message: `确定永久删除「${item.title}」吗？此操作不可撤销。`,
      confirmText: '永久删除',
      danger: true
    })
    if (!ok) return
    try {
      if (item.kind === 'doc') await api.trash.deleteDoc(item.id)
      else await api.trash.deleteFolder(item.id)
      await load()
      app.toast('已永久删除', 'success')
    } catch (error) {
      app.toast(`删除失败：${error instanceof Error ? error.message : String(error)}`, 'error')
    }
  }

  return (
    <>
      <div className={`topbar${app.sidebarVisible ? '' : ' no-sidebar'} drag-region`}>
        <div className="topbar-left no-drag">
          <SidebarToggle />
          <div className="breadcrumb">
            <span className="crumb current">回收站</span>
          </div>
        </div>
      </div>

      <div className="page-scroll">
        <div className="page-inner">
          <h1 className="page-heading">回收站</h1>
          <p className="page-sub">删除的文档和文件夹会先放在这里，可随时恢复或永久删除。</p>

          {loading ? (
            <div className="empty-state">
              <p>正在读取…</p>
            </div>
          ) : items.length === 0 ? (
            <div className="empty-state">
              <Trash2 size={24} />
              <h3>回收站是空的</h3>
              <p>被删除的文档会出现在这里。</p>
            </div>
          ) : (
            <div className="trash-list">
              {items.map((item) => (
                <div key={`${item.kind}-${item.id}`} className="trash-row">
                  <span className="doc-card-icon">
                    {item.kind === 'folder' ? <FolderClosed size={17} /> : <FileText size={17} />}
                  </span>
                  <div className="trash-info">
                    <div className="trash-title">
                      {item.title}
                      <span className="muted" style={{ fontSize: 11, fontWeight: 400 }}>
                        {item.kind === 'folder' ? '文件夹' : '文档'}
                      </span>
                    </div>
                    <div className="trash-meta">
                      {item.originalPath} · 删除于 {formatRelativeTime(item.deletedAt)}
                    </div>
                  </div>
                  <div className="trash-actions">
                    <button type="button" className="btn sm" onClick={() => void restore(item)}>
                      <RotateCcw size={12} /> 恢复
                    </button>
                    <button type="button" className="btn sm danger-ghost" onClick={() => void remove(item)}>
                      <Trash2 size={12} /> 删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
