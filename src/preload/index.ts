import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { FeishuNoteApi } from '@shared/types'

const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> => ipcRenderer.invoke(channel, ...args) as Promise<T>

const api: FeishuNoteApi = {
  platform: process.platform as 'darwin' | 'win32' | 'linux',
  settings: {
    get: () => invoke('settings:get'),
    update: (patch) => invoke('settings:update', patch),
    chooseVault: () => invoke('settings:choose-vault'),
    openVaultInFinder: () => invoke('settings:open-vault')
  },
  vault: {
    tree: () => invoke('vault:tree'),
    recent: (limit) => invoke('vault:recent', limit),
    refresh: () => invoke('vault:refresh')
  },
  doc: {
    create: (input) => invoke('doc:create', input),
    importDialog: (folder) => invoke('doc:import-dialog', folder),
    importPaths: (folder, paths) => invoke('doc:import-paths', folder, paths),
    open: (p) => invoke('doc:open', p),
    save: (input) => invoke('doc:save', input),
    rename: (p, title) => invoke('doc:rename', p, title),
    setPinned: (p, pinned) => invoke('doc:set-pinned', p, pinned),
    move: (p, folder) => invoke('doc:move', p, folder),
    trash: (p) => invoke('doc:trash', p),
    history: (p) => invoke('doc:history', p),
    restoreVersion: (p, file) => invoke('doc:restore-version', p, file)
  },
  folder: {
    create: (parent) => invoke('folder:create', parent),
    rename: (p, name) => invoke('folder:rename', p, name),
    trash: (p) => invoke('folder:trash', p)
  },
  trash: {
    list: () => invoke('trash:list'),
    restoreDoc: (id) => invoke('trash:restore-doc', id),
    restoreFolder: (id) => invoke('trash:restore-folder', id),
    deleteDoc: (id) => invoke('trash:delete-doc', id),
    deleteFolder: (id) => invoke('trash:delete-folder', id)
  },
  search: {
    query: (q) => invoke('search:query', q),
    quick: (q) => invoke('search:quick', q)
  },
  asset: {
    import: (input) => invoke('asset:import', input),
    url: (absPath) => invoke('asset:url', absPath)
  },
  export: {
    pdf: (name) => invoke('export:pdf', name),
    html: (input) => invoke('export:html', input),
    markdown: (input) => invoke('export:markdown', input)
  },
  shell: {
    openExternal: (url) => invoke('shell:open-external', url),
    showItemInFolder: (p) => invoke('shell:show-item', p)
  },
  clipboard: {
    readText: () => invoke('clipboard:read-text')
  },
  pathForFile: (file) => webUtils.getPathForFile(file as File),
  app: {
    closeReady: () => invoke('app:close-ready'),
    setTitleBarTheme: (theme) => invoke('app:title-bar-theme', theme)
  },
  events: {
    onTreeChanged: (cb) => subscribe('vault:tree-changed', cb),
    onMenu: (cb) => subscribe('menu:action', cb),
    onFormat: (cb) => subscribe('menu:format', cb),
    onExternalChange: (cb) => subscribe('vault:external-change', cb),
    onBeforeClose: (cb) => subscribe('app:before-close', cb)
  }
}

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('feishuNote', api)
