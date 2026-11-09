import type { DocMeta, VersionEntry } from '@shared/types'
import {
  AlertCircle,
  Check,
  ChevronRight,
  Clock,
  Download,
  FileDown,
  FileText,
  History,
  Loader2,
  MoreHorizontal,
  PanelRight,
  Pin,
  PinOff,
  RotateCcw,
  Smile,
  Trash2,
  X
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { formatFullTime, formatRelativeTime, formatShortDate } from '../lib/format'
import { useApp } from '../state/AppProvider'
import { DocumentEditor, type DocumentEditorHandle, type OutlineItem, type SaveState } from '../editor/DocumentEditor'
import { PopupMenu } from '../components/PopupMenu'
import { SidebarToggle } from '../components/SidebarToggle'

const EMOJIS = [
  '📄', '📝', '📚', '💡', '✅', '🚀', '🎯', '📌', '⭐', '🔥',
  '🧠', '🗂️', '📊', '🧩', '🌱', '🎨', '🔖', '📅', '☕️', '🏷️',
  '💬', '🧾', '🛠️', '🌈'
]

type TopMenu = { type: 'export' | 'more'; x: number; y: number } | null

function saveLabel(state: SaveState): string {
  switch (state) {
    case 'dirty':
      return '编辑中…'
    case 'saving':
      return '保存中…'
    case 'saved':
      return '已保存'
    case 'error':
      return '保存失败'
    default:
      return ''
  }
}

export function DocPage() {
  const app = useApp()
  const doc = app.currentDoc
  const [meta, setMeta] = useState<DocMeta | null>(doc?.meta ?? null)
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [outline, setOutline] = useState<OutlineItem[]>([])
  const [wordCount, setWordCount] = useState(doc?.meta.wordCount ?? 0)
  const [outlineVisible, setOutlineVisible] = useState(app.outlineVisible)
  const [topMenu, setTopMenu] = useState<TopMenu>(null)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [versions, setVersions] = useState<VersionEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [dismissedExternal, setDismissedExternal] = useState(0)
  const editorRef = useRef<DocumentEditorHandle>(null)
  const titleRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (doc) setMeta(doc.meta)
    setWordCount(doc?.meta.wordCount ?? 0)
  }, [app.docVersion, doc])

  useEffect(() => {
    setOutlineVisible(app.outlineVisible)
  }, [app.outlineVisible])

  // 标题自适应高度
  useEffect(() => {
    const element = titleRef.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${element.scrollHeight}px`
  }, [meta?.title])

  const flushAnd = useCallback(
    async (action: () => Promise<void>) => {
      try {
        await editorRef.current?.flush()
        await action()
      } catch (error) {
        app.toast(`操作失败：${error instanceof Error ? error.message : String(error)}`, 'error')
      }
    },
    [app]
  )

  const exportPdf = useCallback(() => {
    void flushAnd(async () => {
      if (!meta) return
      const file = await api.export.pdf(meta.title)
      if (file) {
        app.toast('PDF 已导出', 'success')
        void api.shell.showItemInFolder(file)
      }
    })
  }, [app, flushAnd, meta])

  const exportHtml = useCallback(() => {
    void flushAnd(async () => {
      if (!meta) return
      const html = editorRef.current?.getHTML() ?? ''
      const file = await api.export.html({ title: meta.title, html, docPath: meta.path })
      if (file) {
        app.toast('HTML 已导出（图片已复制到同名 .assets 文件夹）', 'success')
        void api.shell.showItemInFolder(file)
      }
    })
  }, [app, flushAnd, meta])

  const exportMarkdown = useCallback(() => {
    void flushAnd(async () => {
      if (!meta) return
      const markdown = editorRef.current?.getMarkdown() ?? ''
      const file = await api.export.markdown({ title: meta.title, markdown })
      if (file) {
        app.toast('Markdown 已导出', 'success')
        void api.shell.showItemInFolder(file)
      }
    })
  }, [app, flushAnd, meta])

  const toggleOutline = useCallback(() => {
    const next = !outlineVisible
    setOutlineVisible(next)
    app.setOutlineVisible(next)
  }, [app, outlineVisible])

  useEffect(() => {
    if (!doc) return
    app.setBridge({
      flush: () => editorRef.current?.flush() ?? Promise.resolve(),
      exportPdf,
      exportHtml,
      exportMarkdown,
      toggleOutline,
      format: (command) => editorRef.current?.format(command),
      openFind: () => editorRef.current?.openFind(),
      rebaseAssets: (oldPath, newPath) => editorRef.current?.rebaseAssets(oldPath, newPath),
      reload: () => void app.reloadCurrentDoc()
    })
    return () => app.setBridge(null)
  }, [app, doc, exportHtml, exportMarkdown, exportPdf, toggleOutline])

  useEffect(() => {
    if (!historyOpen || !meta) return
    setHistoryLoading(true)
    void api.doc
      .history(meta.path)
      .then(setVersions)
      .catch(() => setVersions([]))
      .finally(() => setHistoryLoading(false))
  }, [historyOpen, meta])

  if (!doc || !meta) {
    return (
      <>
        <div className={`topbar${app.sidebarVisible ? '' : ' no-sidebar'} drag-region`}>
          <div className="topbar-left no-drag">
            <SidebarToggle />
          </div>
        </div>
        <div className="empty-state">
          <Loader2 size={20} className="spin" />
          <p>正在打开文档…</p>
        </div>
      </>
    )
  }

  const folderCrumbs = meta.path.includes('/') ? meta.path.slice(0, meta.path.lastIndexOf('/')).split('/') : []
  const externalVisible =
    app.externalChange &&
    app.externalChange.path === meta.path &&
    app.externalChange.tick !== dismissedExternal

  const restoreVersion = async (version: VersionEntry): Promise<void> => {
    const ok = await app.confirm({
      title: '恢复历史版本',
      message: `确定把文档恢复到 ${formatFullTime(version.savedAt)} 的版本吗？当前内容会先保存一份历史快照。`,
      confirmText: '恢复'
    })
    if (!ok) return
    try {
      await api.doc.restoreVersion(meta.path, version.file)
      setHistoryOpen(false)
      await app.reloadCurrentDoc()
      app.toast('已恢复历史版本', 'success')
    } catch (error) {
      app.toast(`恢复失败：${error instanceof Error ? error.message : String(error)}`, 'error')
    }
  }

  return (
    <>
      <div className={`topbar${app.sidebarVisible ? '' : ' no-sidebar'} drag-region`}>
        <div className="topbar-left no-drag">
          <SidebarToggle />
          <div className="breadcrumb">
            <span className="crumb">文档</span>
            {folderCrumbs.map((crumb) => (
              <span key={crumb} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <ChevronRight className="sep" size={12} />
                <span className="crumb">{crumb}</span>
              </span>
            ))}
            <ChevronRight className="sep" size={12} />
            <span className="crumb current">{meta.title || '无标题'}</span>
          </div>
        </div>
        <div className="topbar-right no-drag">
          <span className="save-state">
            {saveState === 'saving' ? (
              <Loader2 size={12} className="spin" />
            ) : saveState === 'error' ? (
              <AlertCircle size={12} />
            ) : saveState === 'saved' ? (
              <Check size={12} />
            ) : null}
            {saveLabel(saveState)}
          </span>
          <button
            type="button"
            className={`icon-btn${outlineVisible ? ' active' : ''}`}
            title="大纲"
            onClick={toggleOutline}
          >
            <PanelRight size={16} />
          </button>
          <button
            type="button"
            className="icon-btn"
            title="导出"
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect()
              setTopMenu({ type: 'export', x: rect.right - 200, y: rect.bottom + 4 })
            }}
          >
            <Download size={16} />
          </button>
          <button
            type="button"
            className="icon-btn"
            title="更多"
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect()
              setTopMenu({ type: 'more', x: rect.right - 200, y: rect.bottom + 4 })
            }}
          >
            <MoreHorizontal size={16} />
          </button>
        </div>
      </div>

      <div className="doc-page">
        <div className="doc-scroll">
          <div className="doc-container">
            {externalVisible && (
              <div className="fn-external-banner">
                <AlertCircle size={14} />
                <span>检测到文件已被其他程序修改。</span>
                <button type="button" onClick={() => void app.reloadCurrentDoc()}>
                  重新载入
                </button>
                <button type="button" className="ghost" onClick={() => setDismissedExternal(app.externalChange!.tick)}>
                  忽略
                </button>
              </div>
            )}

            <div className="doc-title-row">
              <div className="doc-title-icon-wrap">
                <button
                  type="button"
                  className={`doc-title-icon${meta.icon ? '' : ' empty'}`}
                  title="更改图标"
                  onClick={() => setEmojiOpen((value) => !value)}
                >
                  {meta.icon ?? <Smile size={18} />}
                </button>
                {emojiOpen && (
                  <div className="emoji-popover">
                    <div className="emoji-grid">
                      {EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          className={emoji === meta.icon ? 'active' : ''}
                          onClick={() => {
                            setMeta({ ...meta, icon: emoji })
                            setEmojiOpen(false)
                          }}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="emoji-clear"
                      onClick={() => {
                        setMeta({ ...meta, icon: null })
                        setEmojiOpen(false)
                      }}
                    >
                      移除图标
                    </button>
                  </div>
                )}
              </div>
              <textarea
                ref={titleRef}
                className="doc-title-input"
                rows={1}
                value={meta.title}
                placeholder="无标题"
                spellCheck={false}
                onChange={(event) => setMeta({ ...meta, title: event.target.value.replace(/\n/g, '') })}
                onBlur={() => {
                  const fallback = meta.title.trim() || '未命名文档'
                  const targetBase = fallback.replace(/[\\/:*?"<>|]/g, ' ').trim()
                  const currentBase = (meta.path.split('/').pop() ?? '').replace(/\.md$/i, '')
                  if (targetBase && targetBase !== currentBase) {
                    void app.renameDocTo(meta.path, fallback)
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    ;(event.target as HTMLTextAreaElement).blur()
                  }
                }}
              />
            </div>

            <div className="doc-meta">
              <span>更新于 {formatRelativeTime(meta.updatedAt)}</span>
              <span>·</span>
              <span>{wordCount} 字</span>
              {meta.pinned && (
                <>
                  <span>·</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <Pin size={10} /> 已置顶
                  </span>
                </>
              )}
            </div>

            <div className="doc-body">
              <DocumentEditor
                ref={editorRef}
                doc={doc}
                settings={app.settings}
                meta={meta}
                reloadToken={app.docVersion}
                onMetaChange={(saved) => {
                  setMeta(saved)
                  setWordCount(saved.wordCount)
                  app.noteDocSaved(saved)
                }}
                onSaveState={setSaveState}
                onRequestLink={() =>
                  app.prompt({
                    title: '插入链接',
                    label: '链接地址',
                    placeholder: 'https://',
                    confirmText: '插入'
                  })
                }
                onOutline={setOutline}
                onWordCount={setWordCount}
                onError={(message) => app.toast(message, 'error')}
                onDirty={() => setSaveState('dirty')}
              />
            </div>
          </div>
        </div>

        {outlineVisible && (
          <aside className="doc-outline">
            <div className="outline-title">大纲</div>
            {outline.length === 0 ? (
              <div className="outline-empty">使用标题样式后，这里会自动生成文档大纲。</div>
            ) : (
              <div className="outline-list">
                {outline.map((item, index) => (
                  <button
                    key={`${item.pos}-${index}`}
                    type="button"
                    className={`outline-item level-${item.level}`}
                    title={item.text}
                    onClick={() => editorRef.current?.scrollToPos(item.pos)}
                  >
                    {item.text || '未命名标题'}
                  </button>
                ))}
              </div>
            )}
          </aside>
        )}

        {app.settings.showWordCount && <div className="doc-status">字数 {wordCount}</div>}
      </div>

      {topMenu?.type === 'export' && (
        <PopupMenu
          x={topMenu.x}
          y={topMenu.y}
          onClose={() => setTopMenu(null)}
          items={[
            { label: '导出 PDF…', icon: <FileDown size={14} />, onClick: exportPdf },
            { label: '导出 HTML…', icon: <FileText size={14} />, onClick: exportHtml },
            { label: '导出 Markdown…', icon: <FileText size={14} />, onClick: exportMarkdown }
          ]}
        />
      )}
      {topMenu?.type === 'more' && (
        <PopupMenu
          x={topMenu.x}
          y={topMenu.y}
          onClose={() => setTopMenu(null)}
          items={[
            {
              label: '历史版本…',
              icon: <History size={14} />,
              onClick: () => setHistoryOpen(true)
            },
            {
              label: meta.pinned ? '取消置顶' : '置顶文档',
              icon: meta.pinned ? <PinOff size={14} /> : <Pin size={14} />,
              onClick: () => void app.togglePinned(meta.path, !meta.pinned)
            },
            'separator',
            {
              label: '移到回收站',
              icon: <Trash2 size={14} />,
              danger: true,
              onClick: () => void app.deleteDoc(meta.path, meta.title)
            }
          ]}
        />
      )}

      {historyOpen && (
        <div className="overlay center" onMouseDown={(event) => event.target === event.currentTarget && setHistoryOpen(false)}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">历史版本</div>
              <button type="button" className="modal-close" onClick={() => setHistoryOpen(false)}>
                <X size={15} />
              </button>
            </div>
            <div className="modal-body">
              <p className="field-hint" style={{ marginTop: 0 }}>
                每次内容变化后间隔 5 分钟自动保留一份快照，最多保留 20 份。
              </p>
              {historyLoading ? (
                <div className="empty-state" style={{ padding: 30 }}>
                  <Loader2 size={18} className="spin" />
                </div>
              ) : versions.length === 0 ? (
                <div className="empty-state" style={{ padding: 30 }}>
                  <Clock size={20} />
                  <p>还没有历史版本</p>
                </div>
              ) : (
                <div className="version-list">
                  {versions.map((version) => (
                    <div key={version.file} className="version-row">
                      <Clock size={13} style={{ color: 'var(--text-tertiary)' }} />
                      <span className="version-time">{formatShortDate(version.savedAt)}</span>
                      <span className="version-size">{Math.max(1, Math.round(version.size / 1024))} KB</span>
                      <button type="button" className="btn sm" onClick={() => void restoreVersion(version)}>
                        <RotateCcw size={12} /> 恢复
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn ghost" onClick={() => setHistoryOpen(false)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
