import { clipboard, dialog, ipcMain, shell, type BrowserWindow } from 'electron'
import { z } from 'zod'
import type { AppSettings } from '@shared/types'
import { getSettings, getSettingsStore } from './settings'
import { closeVault, initVault } from './vault'
import * as vault from './vault'
import { exportHtml, exportMarkdown, exportPdf } from './export'
import { emitToRenderer } from './events'

const saveSchema = z.object({
  path: z.string().min(1),
  id: z.string().min(1),
  markdown: z.string().max(20 * 1024 * 1024),
  title: z.string().max(300),
  icon: z.string().nullable(),
  pinned: z.boolean()
})

const createSchema = z.object({
  folder: z.string().nullable(),
  title: z.string().max(300).optional()
})

const pathSchema = z.string().min(1).max(4096)

function settingsUpdateSchema() {
  return z
    .object({
      vaultPath: z.string().min(1).optional(),
      theme: z.enum(['light', 'dark', 'system']).optional(),
      fontSize: z.number().int().min(13).max(20).optional(),
      lineWidth: z.number().int().min(620).max(1000).optional(),
      showWordCount: z.boolean().optional(),
      autoSaveDelay: z.number().int().min(200).max(3000).optional(),
      lastDocPath: z.string().nullable().optional()
    })
    .strict()
}

export function registerIpc(getWindow: () => BrowserWindow | null, onCloseReady: () => void): void {
  const handle = (channel: string, fn: (...args: unknown[]) => unknown): void => {
    ipcMain.handle(channel, async (_event, ...args) => fn(...args))
  }

  handle('settings:get', () => getSettings())

  handle('settings:update', async (patch) => {
    const parsed = settingsUpdateSchema().parse(patch) as Partial<AppSettings>
    const before = getSettings()
    const next = getSettingsStore().update(parsed)
    if (parsed.vaultPath && next.vaultPath !== before.vaultPath) {
      await closeVault()
      await initVault(next.vaultPath)
      emitToRenderer('vault:tree-changed')
    }
    return next
  })

  handle('settings:choose-vault', async () => {
    const win = getWindow()
    const options = {
      title: '选择文档库文件夹',
      buttonLabel: '使用此文件夹',
      properties: ['openDirectory', 'createDirectory'] as const
    }
    const result = win
      ? await dialog.showOpenDialog(win, { ...options, properties: [...options.properties] })
      : await dialog.showOpenDialog({ ...options, properties: [...options.properties] })
    if (result.canceled || !result.filePaths[0]) return null
    const before = getSettings()
    const next = getSettingsStore().update({ vaultPath: result.filePaths[0] })
    if (next.vaultPath !== before.vaultPath) {
      await closeVault()
      await initVault(next.vaultPath)
      emitToRenderer('vault:tree-changed')
    }
    return next
  })

  handle('settings:open-vault', async () => {
    await shell.openPath(vault.getVaultRoot())
  })

  handle('app:title-bar-theme', (theme) => {
    const win = getWindow()
    if (process.platform === 'win32' && win && !win.isDestroyed()) {
      const dark = theme === 'dark'
      win.setTitleBarOverlay({
        color: dark ? '#17181A' : '#FFFFFF',
        symbolColor: dark ? '#E8E9EB' : '#1F2329',
        height: 46
      })
    }
  })

  handle('vault:tree', () => vault.getTree())
  handle('vault:recent', (limit) => vault.recentDocs(typeof limit === 'number' ? limit : 12))
  handle('vault:refresh', () => vault.refreshTree())

  handle('doc:create', (input) => vault.createDoc(createSchema.parse(input)))
  handle('doc:import-dialog', async (folder) => {
    const win = getWindow()
    const options = {
      title: '导入 Markdown 文件',
      buttonLabel: '导入',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdown'] }]
    }
    const result = win
      ? await dialog.showOpenDialog(win, { ...options, properties: ['openFile', 'multiSelections'] })
      : await dialog.showOpenDialog({ ...options, properties: ['openFile', 'multiSelections'] })
    if (result.canceled || !result.filePaths.length) return { docs: [], skipped: [] }
    return vault.importMarkdownFiles(folder === null ? null : z.string().parse(folder), result.filePaths)
  })
  handle('doc:import-paths', (folder, paths) =>
    vault.importMarkdownFiles(
      folder === null ? null : z.string().parse(folder),
      z.array(z.string().min(1).max(4096)).max(300).parse(paths)
    )
  )
  handle('doc:open', (p) => vault.openDoc(pathSchema.parse(p)))
  handle('doc:save', (input) => vault.saveDoc(saveSchema.parse(input)))
  handle('doc:rename', (p, title) => vault.renameDoc(pathSchema.parse(p), z.string().max(300).parse(title)))
  handle('doc:set-pinned', (p, pinned) => vault.setPinned(pathSchema.parse(p), z.boolean().parse(pinned)))
  handle('doc:move', (p, folder) => vault.moveDoc(pathSchema.parse(p), folder === null ? null : z.string().parse(folder)))
  handle('doc:trash', (p) => vault.trashDoc(pathSchema.parse(p)))
  handle('doc:history', (p) => vault.listVersions(pathSchema.parse(p)))
  handle('doc:restore-version', (p, file) => vault.restoreVersion(pathSchema.parse(p), z.string().parse(file)))

  handle('folder:create', (parent) => vault.createFolder(parent === null ? null : z.string().parse(parent)))
  handle('folder:rename', (p, name) => vault.renameFolder(pathSchema.parse(p), z.string().max(200).parse(name)))
  handle('folder:trash', (p) => vault.trashFolder(pathSchema.parse(p)))

  handle('trash:list', () => vault.trashList())
  handle('trash:restore-doc', (id) => vault.restoreDoc(z.string().parse(id)))
  handle('trash:restore-folder', (id) => vault.restoreFolder(z.string().parse(id)))
  handle('trash:delete-doc', (id) => vault.deleteDocForever(z.string().parse(id)))
  handle('trash:delete-folder', (id) => vault.deleteFolderForever(z.string().parse(id)))

  handle('search:query', (q) => vault.searchDocs(z.string().max(200).parse(q)))
  handle('search:quick', (q) => vault.quickSearchDocs(z.string().max(200).parse(q)))

  handle('asset:import', (input) => {
    const parsed = z
      .object({
        docPath: z.string().min(1),
        name: z.string().max(300),
        data: z.custom<Uint8Array>((v) => v instanceof Uint8Array || Buffer.isBuffer(v))
      })
      .parse(input)
    return vault.importAsset({ ...parsed, data: new Uint8Array(parsed.data) })
  })
  handle('asset:url', (absPath) => vault.assetUrl(z.string().parse(absPath)))

  handle('export:pdf', (name) => {
    const win = getWindow()
    if (!win) return null
    return exportPdf(win, z.string().parse(name))
  })
  handle('export:html', (input) => {
    const win = getWindow()
    if (!win) return null
    return exportHtml(
      win,
      z.object({ title: z.string(), html: z.string(), docPath: z.string() }).parse(input)
    )
  })
  handle('export:markdown', (input) => {
    const win = getWindow()
    if (!win) return null
    return exportMarkdown(win, z.object({ title: z.string(), markdown: z.string() }).parse(input))
  })

  handle('clipboard:read-text', () => clipboard.readText())

  handle('shell:open-external', async (url) => {
    const parsed = z.string().url().parse(url)
    if (!/^https?:|^mailto:/i.test(parsed)) throw new Error('不支持的链接协议')
    await shell.openExternal(parsed)
  })
  handle('shell:show-item', async (p) => {
    shell.showItemInFolder(z.string().parse(p))
  })

  ipcMain.handle('app:close-ready', () => {
    onCloseReady()
  })
}
