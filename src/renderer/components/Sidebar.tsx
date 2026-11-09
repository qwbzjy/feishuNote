import type { TreeNode } from '@shared/types'
import {
  ChevronRight,
  FilePlus,
  FileUp,
  FileText,
  FolderClosed,
  FolderOpen,
  FolderPlus,
  Home,
  Monitor,
  Moon,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Settings,
  Sun,
  Trash2
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { useApp } from '../state/AppProvider'
import { PopupMenu, type PopupMenuItem } from './PopupMenu'
import { shortcut } from '../lib/platform'

interface MenuState {
  x: number
  y: number
  node: TreeNode
}

const EXPANDED_KEY = 'feishunote:expanded'

function loadExpanded(): Set<string> {
  try {
    const raw = localStorage.getItem(EXPANDED_KEY)
    if (raw) return new Set(JSON.parse(raw) as string[])
  } catch {
    // ignore
  }
  return new Set()
}

export function Sidebar() {
  const app = useApp()
  const { tree, view, settings } = app
  const [expanded, setExpanded] = useState<Set<string>>(loadExpanded)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(EXPANDED_KEY, JSON.stringify([...expanded]))
    } catch {
      // ignore
    }
  }, [expanded])

  useEffect(() => {
    if (view.name !== 'doc') return
    const parts = view.path.split('/')
    const dirs: string[] = []
    for (let i = 1; i < parts.length; i += 1) dirs.push(parts.slice(0, i).join('/'))
    if (!dirs.length) return
    setExpanded((prev) => {
      let changed = false
      const next = new Set(prev)
      for (const dir of dirs) {
        if (!next.has(dir)) {
          next.add(dir)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [view])

  const pinned = useMemo(() => {
    const out: Array<Extract<TreeNode, { type: 'doc' }>> = []
    const walk = (nodes: TreeNode[]): void => {
      for (const node of nodes) {
        if (node.type === 'doc') {
          if (node.pinned) out.push(node)
        } else {
          walk(node.children)
        }
      }
    }
    walk(tree)
    return out
  }, [tree])

  const toggleFolder = (path: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const openMenu = (event: React.MouseEvent, node: TreeNode): void => {
    event.preventDefault()
    event.stopPropagation()
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    setMenu({ x: rect.right - 6, y: rect.bottom + 2, node })
  }

  const menuItems = (node: TreeNode): Array<PopupMenuItem | 'separator'> => {
    if (node.type === 'doc') {
      return [
        {
          label: node.pinned ? '取消置顶' : '置顶',
          icon: node.pinned ? <PinOff size={14} /> : <Pin size={14} />,
          onClick: () => void app.togglePinned(node.path, !node.pinned)
        },
        {
          label: '重命名',
          icon: <Pencil size={14} />,
          onClick: () => void app.renameDoc(node.path, node.title)
        },
        'separator',
        {
          label: '移到回收站',
          icon: <Trash2 size={14} />,
          danger: true,
          onClick: () => void app.deleteDoc(node.path, node.title)
        }
      ]
    }
    return [
      {
        label: '新建文档',
        icon: <FilePlus size={14} />,
        onClick: () => void app.createDoc(node.path)
      },
      {
        label: '新建子文件夹',
        icon: <FolderPlus size={14} />,
        onClick: () => void app.createFolder(node.path)
      },
      {
        label: '导入 Markdown…',
        icon: <FileUp size={14} />,
        onClick: () => void app.importMarkdown(node.path)
      },
      'separator',
      {
        label: '重命名',
        icon: <Pencil size={14} />,
        onClick: () => void app.renameFolder(node.path, node.name)
      },
      'separator',
      {
        label: '删除文件夹',
        icon: <Trash2 size={14} />,
        danger: true,
        onClick: () => void app.deleteFolder(node.path, node.name)
      }
    ]
  }

  const handleDrop = async (event: React.DragEvent, folder: string | null): Promise<void> => {
    event.preventDefault()
    event.stopPropagation()
    setDropTarget(null)
    const files = Array.from(event.dataTransfer.files ?? [])
    if (files.length) {
      const paths = files
        .map((file) => api.pathForFile(file))
        .filter((filePath): filePath is string => Boolean(filePath))
      if (paths.length) await app.importPaths(folder, paths)
      return
    }
    const path = event.dataTransfer.getData('application/x-fn-doc')
    if (!path) return
    try {
      await api.doc.move(path, folder)
      await app.refreshAll()
      app.toast('文档已移动', 'success')
    } catch (error) {
      app.toast(`移动失败：${error instanceof Error ? error.message : String(error)}`, 'error')
    }
  }

  const renderNodes = (nodes: TreeNode[], depth: number): React.ReactNode => {
    return nodes.map((node) => {
      if (node.type === 'folder') {
        const open = expanded.has(node.path)
        return (
          <div key={node.path}>
            <button
              type="button"
              className={`tree-row${dropTarget === node.path ? ' drop-target' : ''}`}
              style={{ paddingLeft: 6 + depth * 12 }}
              onClick={() => toggleFolder(node.path)}
              onContextMenu={(event) => openMenu(event, node)}
              onDragOver={(event) => {
                if (
                  !event.dataTransfer.types.includes('application/x-fn-doc') &&
                  !event.dataTransfer.types.includes('Files')
                ) {
                  return
                }
                event.preventDefault()
                setDropTarget(node.path)
              }}
              onDragLeave={() => setDropTarget((value) => (value === node.path ? null : value))}
              onDrop={(event) => void handleDrop(event, node.path)}
            >
              <span className={`tree-caret${open ? ' open' : ''}`}>
                <ChevronRight size={12} />
              </span>
              <span className="tree-icon">
                {open ? <FolderOpen size={14} /> : <FolderClosed size={14} />}
              </span>
              <span className="tree-label">{node.name}</span>
              <span
                className="row-action"
                role="button"
                tabIndex={-1}
                title="更多"
                onClick={(event) => openMenu(event, node)}
              >
                <MoreHorizontal size={14} />
              </span>
            </button>
            {open && node.children.length > 0 && <div className="tree-children">{renderNodes(node.children, depth + 1)}</div>}
          </div>
        )
      }

      const active = view.name === 'doc' && view.path === node.path
      return (
        <button
          key={node.path}
          type="button"
          draggable
          className={`tree-row${active ? ' active' : ''}`}
          style={{ paddingLeft: 6 + depth * 12 }}
          onClick={() => void app.openDoc(node.path)}
          onContextMenu={(event) => openMenu(event, node)}
          onDragStart={(event) => {
            event.dataTransfer.setData('application/x-fn-doc', node.path)
            event.dataTransfer.effectAllowed = 'move'
          }}
        >
          <span className="tree-caret" />
          <span className="tree-icon">
            {node.icon ? <span style={{ fontSize: 14 }}>{node.icon}</span> : <FileText size={14} />}
          </span>
          <span className="tree-label">{node.title}</span>
          <span
            className="row-action"
            role="button"
            tabIndex={-1}
            title="更多"
            onClick={(event) => openMenu(event, node)}
          >
            <MoreHorizontal size={14} />
          </span>
        </button>
      )
    })
  }

  const ThemeIcon = settings.theme === 'dark' ? Moon : settings.theme === 'light' ? Sun : Monitor

  return (
    <>
      <aside
        className={`sidebar${app.sidebarVisible ? '' : ' collapsed'}`}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes('Files')) event.preventDefault()
        }}
        onDrop={(event) => void handleDrop(event, null)}
      >
        <div className="sidebar-header drag-region">
          <div className="brand no-drag">
            <span className="brand-mark">F</span>
            <span className="brand-name">FeishuNote</span>
            <span className="brand-spacer" />
          </div>
          <button type="button" className="new-doc-btn no-drag" onClick={() => void app.createDoc()}>
            <Plus size={15} /> 新建文档
          </button>
          <button type="button" className="search-trigger no-drag" onClick={() => app.setPaletteOpen(true)}>
            <Search size={14} />
            <span>搜索文档</span>
            <span className="shortcut">{shortcut('⌘P', 'Ctrl+P')}</span>
          </button>
        </div>

        <div className="sidebar-scroll">
          <button
            type="button"
            className={`nav-item${view.name === 'home' ? ' active' : ''}`}
            onClick={() => void app.goHome()}
          >
            <span className="nav-icon">
              <Home size={15} />
            </span>
            首页
          </button>
          <button
            type="button"
            className={`nav-item${view.name === 'trash' ? ' active' : ''}`}
            onClick={() => void app.goTrash()}
          >
            <span className="nav-icon">
              <Trash2 size={15} />
            </span>
            回收站
          </button>

          {pinned.length > 0 && (
            <div className="sidebar-section">
              <div className="section-head">
                <Pin size={11} /> 置顶
              </div>
              <div className="tree">
                {pinned.map((doc) => (
                  <button
                    key={`pin-${doc.path}`}
                    type="button"
                    className={`tree-row${view.name === 'doc' && view.path === doc.path ? ' active' : ''}`}
                    style={{ paddingLeft: 8 }}
                    onClick={() => void app.openDoc(doc.path)}
                    onContextMenu={(event) => openMenu(event, doc)}
                  >
                    <span className="tree-caret" />
                    <span className="tree-icon">
                      {doc.icon ? <span style={{ fontSize: 14 }}>{doc.icon}</span> : <FileText size={14} />}
                    </span>
                    <span className="tree-label">{doc.title}</span>
                    <span
                      className="row-action"
                      role="button"
                      tabIndex={-1}
                      title="更多"
                      onClick={(event) => openMenu(event, doc)}
                    >
                      <MoreHorizontal size={14} />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="sidebar-section">
            <div
              className="section-head"
              onDragOver={(event) => {
                if (
                  !event.dataTransfer.types.includes('application/x-fn-doc') &&
                  !event.dataTransfer.types.includes('Files')
                ) {
                  return
                }
                event.preventDefault()
                setDropTarget('__root__')
              }}
              onDragLeave={() => setDropTarget((value) => (value === '__root__' ? null : value))}
              onDrop={(event) => void handleDrop(event, null)}
              style={dropTarget === '__root__' ? { background: 'var(--accent-soft)', borderRadius: 6 } : undefined}
            >
              文档
              <span className="section-action">
                <button
                  type="button"
                  className="icon-btn sm"
                  title="导入 Markdown"
                  onClick={() => void app.importMarkdown(null)}
                >
                  <FileUp size={14} />
                </button>
                <button
                  type="button"
                  className="icon-btn sm"
                  title="新建文件夹"
                  onClick={() => void app.createFolder(null)}
                >
                  <FolderPlus size={14} />
                </button>
                <button type="button" className="icon-btn sm" title="新建文档" onClick={() => void app.createDoc(null)}>
                  <Plus size={14} />
                </button>
              </span>
            </div>
            {tree.length === 0 ? (
              <div className="sidebar-empty">
                还没有文档。
                <br />
                点击上方「新建文档」开始记录。
              </div>
            ) : (
              <div className="tree">{renderNodes(tree, 0)}</div>
            )}
          </div>
        </div>

        <div className="sidebar-footer">
          <button type="button" className="footer-btn" onClick={() => app.setSettingsOpen(true)} title="设置">
            <Settings size={15} /> 设置
          </button>
          <span className="spacer" />
          <button
            type="button"
            className="footer-btn"
            title={`外观：${settings.theme === 'system' ? '跟随系统' : settings.theme === 'dark' ? '深色' : '浅色'}`}
            onClick={() => {
              const next = settings.theme === 'light' ? 'dark' : settings.theme === 'dark' ? 'system' : 'light'
              void app.updateSettings({ theme: next })
            }}
          >
            <ThemeIcon size={15} />
          </button>
          <button type="button" className="footer-btn" title={shortcut('收起侧边栏 ⌘\\', '收起侧边栏 Ctrl+\\')} onClick={() => app.setSidebarVisible(false)}>
            <ChevronRight size={15} style={{ transform: 'rotate(180deg)' }} />
          </button>
        </div>
      </aside>

      {menu && (
        <PopupMenu
          x={menu.x}
          y={menu.y}
          items={menuItems(menu.node)}
          onClose={() => setMenu(null)}
        />
      )}
    </>
  )
}
