import { app, Menu, dialog, shell, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'
import type { MenuAction } from '@shared/types'
import { emitToRenderer } from './events'
import { getVaultRoot } from './vault'
import { getSettingsStore } from './settings'

function sendAction(action: MenuAction): void {
  emitToRenderer('menu:action', action)
}

function sendFormat(command: string): void {
  emitToRenderer('menu:format', command)
}

export function installMenu(win: BrowserWindow): void {
  const isMac = process.platform === 'darwin'
  const template: MenuItemConstructorOptions[] = []

  if (isMac) {
    template.push({
      label: app.name,
      submenu: [
        { role: 'about', label: '关于 FeishuNote' },
        { type: 'separator' },
        { label: '设置…', accelerator: 'Command+,', registerAccelerator: false, click: () => sendAction('settings') },
        { type: 'separator' },
        { role: 'services', label: '服务' },
        { type: 'separator' },
        { role: 'hide', label: '隐藏 FeishuNote' },
        { role: 'hideOthers', label: '隐藏其他' },
        { role: 'unhide', label: '全部显示' },
        { type: 'separator' },
        { role: 'quit', label: '退出 FeishuNote' }
      ]
    })
  }

  template.push(
    {
      label: '文件',
      submenu: [
        { label: '新建文档', accelerator: 'CommandOrControl+N', registerAccelerator: false, click: () => sendAction('new-doc') },
        { label: '新建文件夹', accelerator: 'CommandOrControl+Shift+N', registerAccelerator: false, click: () => sendAction('new-folder') },
        { label: '保存', accelerator: 'CommandOrControl+S', registerAccelerator: false, click: () => sendFormat('save') },
        { type: 'separator' },
        { label: '导入 Markdown…', accelerator: 'CommandOrControl+Shift+I', registerAccelerator: false, click: () => sendAction('import-markdown') },
        { type: 'separator' },
        { label: '快速打开…', accelerator: 'CommandOrControl+P', registerAccelerator: false, click: () => sendAction('quick-open') },
        { label: '全局搜索…', accelerator: 'CommandOrControl+Shift+F', registerAccelerator: false, click: () => sendAction('global-search') },
        { type: 'separator' },
        {
          label: '导出',
          submenu: [
            { label: '导出 PDF…', click: () => sendAction('export-pdf') },
            { label: '导出 HTML…', click: () => sendAction('export-html') },
            { label: '导出 Markdown…', click: () => sendAction('export-markdown') }
          ]
        },
        { type: 'separator' },
        { label: process.platform === 'darwin' ? '在 Finder 中打开文档库' : '在资源管理器中打开文档库', click: () => sendAction('open-vault') },
        ...(process.platform === 'darwin'
          ? []
          : [
              { type: 'separator' as const },
              { label: '设置…', accelerator: 'CommandOrControl+,', registerAccelerator: false, click: () => sendAction('settings') }
            ]),
        { type: 'separator' },
        { label: '关闭窗口', accelerator: 'CommandOrControl+W', role: 'close' }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', accelerator: 'CommandOrControl+Z', click: () => sendFormat('undo') },
        { label: '重做', accelerator: 'CommandOrControl+Shift+Z', click: () => sendFormat('redo') },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'pasteAndMatchStyle', label: '粘贴为纯文本' },
        { label: '粘贴为 Markdown', accelerator: 'CommandOrControl+Alt+V', registerAccelerator: false, click: () => sendFormat('pasteMarkdown') },
        { role: 'selectAll', label: '全选' },
        { type: 'separator' },
        { label: '查找', accelerator: 'CommandOrControl+F', registerAccelerator: false, click: () => sendFormat('find') }
      ]
    },
    {
      label: '格式',
      submenu: [
        { label: '标题 1', accelerator: 'CommandOrControl+Alt+1', click: () => sendFormat('h1') },
        { label: '标题 2', accelerator: 'CommandOrControl+Alt+2', click: () => sendFormat('h2') },
        { label: '标题 3', accelerator: 'CommandOrControl+Alt+3', click: () => sendFormat('h3') },
        { label: '正文', accelerator: 'CommandOrControl+Alt+0', click: () => sendFormat('paragraph') },
        { type: 'separator' },
        { label: '加粗', accelerator: 'CommandOrControl+B', click: () => sendFormat('bold') },
        { label: '斜体', accelerator: 'CommandOrControl+I', click: () => sendFormat('italic') },
        { label: '下划线', accelerator: 'CommandOrControl+U', click: () => sendFormat('underline') },
        { label: '删除线', accelerator: 'CommandOrControl+Shift+X', click: () => sendFormat('strike') },
        { label: '高亮', accelerator: 'CommandOrControl+Shift+H', click: () => sendFormat('highlight') },
        { label: '行内代码', accelerator: 'CommandOrControl+E', click: () => sendFormat('code') },
        { label: '链接…', accelerator: 'CommandOrControl+K', click: () => sendFormat('link') },
        { type: 'separator' },
        { label: '有序列表', accelerator: 'CommandOrControl+Shift+7', click: () => sendFormat('orderedList') },
        { label: '无序列表', accelerator: 'CommandOrControl+Shift+8', click: () => sendFormat('bulletList') },
        { label: '待办事项', accelerator: 'CommandOrControl+Shift+9', click: () => sendFormat('taskList') },
        { type: 'separator' },
        { label: '引用', click: () => sendFormat('blockquote') },
        { label: '代码块', accelerator: 'CommandOrControl+Alt+C', click: () => sendFormat('codeBlock') },
        { label: '分割线', click: () => sendFormat('horizontalRule') },
        { label: '高亮块', click: () => sendFormat('callout') },
        { label: '折叠块', click: () => sendFormat('details') }
      ]
    },
    {
      label: '视图',
      submenu: [
        { label: '显示/隐藏侧边栏', accelerator: 'CommandOrControl+\\', registerAccelerator: false, click: () => sendAction('toggle-sidebar') },
        { label: '显示/隐藏大纲', accelerator: 'CommandOrControl+Shift+O', registerAccelerator: false, click: () => sendAction('toggle-outline') },
        { type: 'separator' },
        {
          label: '外观',
          submenu: [
            { label: '浅色', click: () => sendAction('theme-light') },
            { label: '深色', click: () => sendAction('theme-dark') },
            { label: '跟随系统', click: () => sendAction('theme-system') }
          ]
        },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' },
        { type: 'separator' },
        { role: 'toggleDevTools', label: '开发者工具' }
      ]
    },
    {
      label: '帮助',
      submenu: [
        { label: '打开文档库文件夹', click: () => void shell.openPath(getVaultRoot()) },
        {
          label: '显示设置文件',
          click: () => void shell.showItemInFolder(getSettingsStore().get().vaultPath)
        },
        { type: 'separator' },
        {
          label: '关于 FeishuNote',
          click: () => {
            void dialog.showMessageBox(win, {
              type: 'info',
              title: '关于 FeishuNote',
              message: 'FeishuNote',
              detail: `本地优先的飞书风格文档客户端\n版本 ${app.getVersion()}\n\n文档库：${getSettingsStore().get().vaultPath}`,
              buttons: ['好']
            })
          }
        }
      ]
    }
  )

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
