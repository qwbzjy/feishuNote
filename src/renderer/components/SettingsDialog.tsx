import { ExternalLink, FolderOpen, Monitor, Moon, Sun, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { useApp } from '../state/AppProvider'
import { isMac } from '../lib/platform'

const SHORTCUTS: Array<[string, string]> = isMac
  ? [
      ['⌘ N', '新建文档'],
      ['⌘ ⇧ N', '新建文件夹'],
      ['⌘ P', '快速打开'],
      ['⌘ ⇧ F', '全局搜索'],
      ['⌘ S', '立即保存'],
      ['⌘ B / I / U', '加粗 / 斜体 / 下划线'],
      ['⌘ K', '插入链接'],
      ['⌘ ⌥ 1~4', '标题 1~4'],
      ['⌘ ⇧ 7 / 8 / 9', '有序 / 无序 / 待办'],
      ['/ 开头', '打开插入菜单'],
      ['⌘ \\', '显示/隐藏侧边栏'],
      ['⌘ ⇧ O', '显示/隐藏大纲'],
      ['⌘ ⇧ Z', '重做'],
      ['⌘ F', '文档内查找'],
      ['⌘ ⇧ I', '导入 Markdown'],
      ['⌘ ⌥ V', '粘贴为 Markdown']
    ]
  : [
      ['Ctrl+N', '新建文档'],
      ['Ctrl+Shift+N', '新建文件夹'],
      ['Ctrl+P', '快速打开'],
      ['Ctrl+Shift+F', '全局搜索'],
      ['Ctrl+S', '立即保存'],
      ['Ctrl+B / I / U', '加粗 / 斜体 / 下划线'],
      ['Ctrl+K', '插入链接'],
      ['Ctrl+Alt+1~4', '标题 1~4'],
      ['Ctrl+Shift+7 / 8 / 9', '有序 / 无序 / 待办'],
      ['/ 开头', '打开插入菜单'],
      ['Ctrl+\\', '显示/隐藏侧边栏'],
      ['Ctrl+Shift+O', '显示/隐藏大纲'],
      ['Ctrl+Shift+Z', '重做'],
      ['Ctrl+F', '文档内查找'],
      ['Ctrl+Shift+I', '导入 Markdown'],
      ['Ctrl+Alt+V', '粘贴为 Markdown']
    ]

export function SettingsDialog() {
  const app = useApp()
  const { settingsOpen, settings, setSettingsOpen, updateSettings, chooseVault } = app
  const [fontSize, setFontSize] = useState(settings.fontSize)
  const [lineWidth, setLineWidth] = useState(settings.lineWidth)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    setFontSize(settings.fontSize)
    setLineWidth(settings.lineWidth)
  }, [settings.fontSize, settings.lineWidth])

  useEffect(() => {
    if (!settingsOpen) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setSettingsOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [settingsOpen, setSettingsOpen])

  if (!settingsOpen) return null

  const commitLayout = (patch: { fontSize?: number; lineWidth?: number }): void => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      void updateSettings(patch)
    }, 220)
  }

  return (
    <div className="overlay center" onMouseDown={(event) => event.target === event.currentTarget && setSettingsOpen(false)}>
      <div className="modal wide">
        <div className="modal-header">
          <div className="modal-title">设置</div>
          <button type="button" className="modal-close" onClick={() => setSettingsOpen(false)}>
            <X size={15} />
          </button>
        </div>

        <div className="modal-body">
          <div className="settings-section">
            <div className="settings-section-title">外观</div>
            <div className="field">
              <label className="field-label">主题</label>
              <div className="segmented">
                <button
                  type="button"
                  className={settings.theme === 'light' ? 'active' : ''}
                  onClick={() => void updateSettings({ theme: 'light' })}
                >
                  <Sun size={13} /> 浅色
                </button>
                <button
                  type="button"
                  className={settings.theme === 'dark' ? 'active' : ''}
                  onClick={() => void updateSettings({ theme: 'dark' })}
                >
                  <Moon size={13} /> 深色
                </button>
                <button
                  type="button"
                  className={settings.theme === 'system' ? 'active' : ''}
                  onClick={() => void updateSettings({ theme: 'system' })}
                >
                  <Monitor size={13} /> 跟随系统
                </button>
              </div>
            </div>

            <div className="field">
              <label className="field-label">
                <span>正文字号</span>
                <span className="muted">{fontSize}px</span>
              </label>
              <input
                type="range"
                min={13}
                max={20}
                step={1}
                value={fontSize}
                onChange={(event) => {
                  const value = Number(event.target.value)
                  setFontSize(value)
                  commitLayout({ fontSize: value })
                }}
              />
            </div>

            <div className="field">
              <label className="field-label">
                <span>正文宽度</span>
                <span className="muted">{lineWidth}px</span>
              </label>
              <input
                type="range"
                min={640}
                max={980}
                step={20}
                value={lineWidth}
                onChange={(event) => {
                  const value = Number(event.target.value)
                  setLineWidth(value)
                  commitLayout({ lineWidth: value })
                }}
              />
            </div>

            <div className="field" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div className="field-label">显示字数统计</div>
                <div className="field-hint">在文档右下角显示实时字数。</div>
              </div>
              <button
                type="button"
                className={`switch${settings.showWordCount ? ' on' : ''}`}
                aria-label="显示字数统计"
                onClick={() => void updateSettings({ showWordCount: !settings.showWordCount })}
              />
            </div>
          </div>

          <div className="settings-section">
            <div className="settings-section-title">文档库</div>
            <div className="vault-box">
              <div className="vault-path-text" title={settings.vaultPath}>
                {settings.vaultPath}
              </div>
              <button type="button" className="btn sm" onClick={() => void chooseVault()}>
                <FolderOpen size={13} /> 更改…
              </button>
            </div>
            <div className="field-hint" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <ExternalLink size={11} />
              文档以 Markdown 文件保存在该文件夹中，可直接用其他工具打开或备份。
            </div>
            <button
              type="button"
              className="btn ghost sm"
              style={{ marginTop: 8, paddingLeft: 0 }}
              onClick={() => void api.settings.openVaultInFinder()}
            >
              在 Finder 中显示文档库
            </button>
          </div>

          <div className="settings-section">
            <div className="settings-section-title">快捷键</div>
            <div className="shortcut-list">
              {SHORTCUTS.map(([keys, label]) => (
                <div key={keys} className="shortcut-row">
                  <span>{label}</span>
                  <kbd>{keys}</kbd>
                </div>
              ))}
            </div>
          </div>

          <div className="settings-section" style={{ borderBottom: 0 }}>
            <div className="settings-section-title">关于</div>
            <div className="field-hint" style={{ lineHeight: 1.8 }}>
              FeishuNote 0.1.3 · 本地优先的飞书风格文档客户端
              <br />
              运行于 macOS · 内容完全存储在本地，不上传任何服务器。
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn primary" onClick={() => setSettingsOpen(false)}>
            完成
          </button>
        </div>
      </div>
    </div>
  )
}
