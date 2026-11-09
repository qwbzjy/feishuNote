import { FileText, FileUp, Pin, Plus, Search, Sparkles } from 'lucide-react'
import { useApp } from '../state/AppProvider'
import { formatRelativeTime } from '../lib/format'
import { SidebarToggle } from '../components/SidebarToggle'
import { shortcut } from '../lib/platform'

export function HomePage() {
  const app = useApp()
  const { recent, settings } = app
  const today = new Date()
  const greeting =
    today.getHours() < 6
      ? '夜深了'
      : today.getHours() < 12
        ? '早上好'
        : today.getHours() < 18
          ? '下午好'
          : '晚上好'

  return (
    <>
      <div className={`topbar${app.sidebarVisible ? '' : ' no-sidebar'} drag-region`}>
        <div className="topbar-left no-drag">
          <SidebarToggle />
          <div className="breadcrumb">
            <span className="crumb current">首页</span>
          </div>
        </div>
        <div className="topbar-right no-drag">
          <button type="button" className="topbar-btn" onClick={() => app.setPaletteOpen(true)}>
            <Search size={14} /> 搜索
            <kbd>{shortcut('⌘P', 'Ctrl+P')}</kbd>
          </button>
          <button type="button" className="topbar-btn" onClick={() => void app.importMarkdown()}>
            <FileUp size={14} /> 导入
          </button>
          <button type="button" className="topbar-btn primary" onClick={() => void app.createDoc()}>
            <Plus size={14} /> 新建
          </button>
        </div>
      </div>

      <div className="home-scroll">
        <div className="home">
          <div className="home-hero">
            <div>
              <h1 className="home-heading">{greeting}，今天想写点什么？</h1>
              <p className="home-sub">
                所有内容都保存在本地 Markdown 文件中 · {settings.vaultPath}
              </p>
            </div>
          </div>

          <div className="home-section-head">
            <span className="home-section-title">最近编辑</span>
            <button type="button" className="topbar-btn" onClick={() => void app.goTrash()}>
              查看回收站
            </button>
          </div>

          {recent.length === 0 ? (
            <div className="home-empty">
              <div className="empty-icon">
                <Sparkles size={24} />
              </div>
              <h3>从第一篇文档开始</h3>
              <p>支持标题、列表、待办、表格、代码块、高亮块、折叠块与分栏。</p>
              <button type="button" className="btn primary" onClick={() => void app.createDoc()}>
                <Plus size={15} /> 新建文档
              </button>
            </div>
          ) : (
            <div className="doc-list">
              {recent.map((doc) => (
                <button key={doc.id} type="button" className="doc-card" onClick={() => void app.openDoc(doc.path)}>
                  <span className="doc-card-icon">
                    {doc.icon ? <span>{doc.icon}</span> : <FileText size={17} />}
                  </span>
                  <span className="doc-card-main">
                    <span className="doc-card-title">
                      {doc.title}
                      {doc.pinned && (
                        <span className="pin-dot" title="已置顶">
                          <Pin size={11} />
                        </span>
                      )}
                    </span>
                    <span className="doc-card-excerpt">{doc.excerpt || '空白文档'}</span>
                    <span className="doc-card-meta">
                      <span>{doc.path.includes('/') ? doc.path.slice(0, doc.path.lastIndexOf('/')) : '根目录'}</span>
                      <span>{doc.wordCount} 字</span>
                    </span>
                  </span>
                  <span className="doc-card-time">{formatRelativeTime(doc.updatedAt)}</span>
                </button>
              ))}
            </div>
          )}

          <div className="home-stats">
            <span>共 {countDocs(app.tree)} 篇文档</span>
            <span>本地优先 · 无需联网</span>
          </div>
        </div>
      </div>
    </>
  )
}

function countDocs(nodes: ReturnType<typeof useApp>['tree']): number {
  let count = 0
  for (const node of nodes) {
    if (node.type === 'doc') count += 1
    else count += countDocs(node.children)
  }
  return count
}
