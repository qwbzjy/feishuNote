import { PanelLeft } from 'lucide-react'
import { useApp } from '../state/AppProvider'
import { shortcut } from '../lib/platform'

export function SidebarToggle() {
  const { sidebarVisible, setSidebarVisible } = useApp()
  return (
    <button
      type="button"
      className={`icon-btn no-drag${sidebarVisible ? '' : ''}`}
      title={sidebarVisible ? shortcut('隐藏侧边栏 ⌘\\', '隐藏侧边栏 Ctrl+\\') : shortcut('显示侧边栏 ⌘\\', '显示侧边栏 Ctrl+\\')}
      onClick={() => setSidebarVisible(!sidebarVisible)}
    >
      <PanelLeft size={16} />
    </button>
  )
}
