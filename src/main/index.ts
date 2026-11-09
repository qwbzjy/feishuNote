import { app, BrowserWindow, dialog, nativeTheme, net, protocol, shell } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
import { getSettings, getSettingsStore } from './settings'
import { closeVault, initVault, isInsideVault } from './vault'
import { registerIpc } from './ipc'
import { installMenu } from './menu'

if (process.env.FEISHUNOTE_USER_DATA) {
  app.setPath('userData', path.resolve(process.env.FEISHUNOTE_USER_DATA))
}

app.setName('FeishuNote')

if (process.env.ELECTRON_RENDERER_URL) {
  app.commandLine.appendSwitch('remote-debugging-port', '9222')
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'fnasset',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true }
  }
])

let mainWindow: BrowserWindow | null = null
let appQuitting = false
let closeWindowHandler: (() => void) | null = null

interface WindowState {
  width: number
  height: number
  x?: number
  y?: number
  maximized?: boolean
}

function windowStateFile(): string {
  return path.join(app.getPath('userData'), 'window-state.json')
}

function loadWindowState(): WindowState {
  try {
    const parsed = JSON.parse(fs.readFileSync(windowStateFile(), 'utf8')) as WindowState
    return {
      width: Math.max(960, parsed.width || 1360),
      height: Math.max(620, parsed.height || 880),
      x: typeof parsed.x === 'number' ? parsed.x : undefined,
      y: typeof parsed.y === 'number' ? parsed.y : undefined,
      maximized: parsed.maximized
    }
  } catch {
    return { width: 1360, height: 880 }
  }
}

function saveWindowState(win: BrowserWindow): void {
  if (win.isDestroyed()) return
  const bounds = win.getNormalBounds()
  const state: WindowState = { ...bounds, maximized: win.isMaximized() }
  try {
    const file = windowStateFile()
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(state), 'utf8')
  } catch {
    // ignore
  }
}

function createWindow(): void {
  const state = loadWindowState()
  const dark = nativeTheme.shouldUseDarkColors
  const isMac = process.platform === 'darwin'
  const win = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 960,
    minHeight: 620,
    show: false,
    ...(isMac
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 16, y: 18 } }
      : {
          titleBarStyle: 'hidden' as const,
          titleBarOverlay: {
            color: dark ? '#17181A' : '#FFFFFF',
            symbolColor: dark ? '#E8E9EB' : '#1F2329',
            height: 46
          }
        }),
    backgroundColor: dark ? '#17181A' : '#FFFFFF',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: true
    }
  })
  mainWindow = win
  win.setTitle('FeishuNote')
  if (process.platform === 'win32') {
    win.setMenuBarVisibility(false)
    win.setAutoHideMenuBar(true)
  }

  win.once('ready-to-show', () => {
    win.show()
    win.focus()
    if (state.maximized) win.maximize()
  })

  setTimeout(() => {
    if (win.isDestroyed()) return
    if (!win.isVisible()) {
      app.focus({ steal: true })
      win.center()
      win.show()
      win.moveTop()
      win.focus()
      win.setAlwaysOnTop(true, 'floating')
      setTimeout(() => win.setAlwaysOnTop(false), 2500)
    }
  }, 3000)

  win.webContents.on('console-message', (event) => {
    if (process.env.ELECTRON_RENDERER_URL) {
      console.log(`[renderer:${event.level}] ${event.message} (${event.sourceId}:${event.lineNumber})`)
    }
  })

  win.webContents.on('did-fail-load', (_event, code, description, url) => {
    console.error('[renderer] did-fail-load', code, description, url)
    if (!win.isDestroyed()) win.show()
  })

  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('[renderer] render-process-gone', details)
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env.ELECTRON_RENDERER_URL
    if (devUrl && url.startsWith(devUrl)) return
    event.preventDefault()
    if (/^https?:/i.test(url)) void shell.openExternal(url)
  })

  let closeConfirmed = false
  let closeTimer: NodeJS.Timeout | null = null
  const confirmClose = (): void => {
    closeConfirmed = true
    if (closeTimer) {
      clearTimeout(closeTimer)
      closeTimer = null
    }
    if (!win.isDestroyed()) win.close()
  }
  closeWindowHandler = confirmClose
  win.on('close', (event) => {
    if (closeConfirmed) {
      saveWindowState(win)
      return
    }
    event.preventDefault()
    saveWindowState(win)
    win.webContents.send('app:before-close')
    if (closeTimer) clearTimeout(closeTimer)
    closeTimer = setTimeout(() => {
      closeConfirmed = true
      if (!win.isDestroyed()) win.close()
    }, 1600)
  })

  let saveTimer: NodeJS.Timeout | null = null
  const scheduleSave = (): void => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => saveWindowState(win), 400)
  }
  win.on('resize', scheduleSave)
  win.on('move', scheduleSave)
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
    closeWindowHandler = null
  })

  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) {
    void win.loadURL(devUrl)
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  installMenu(win)
  if (process.platform === 'win32') {
    win.setMenuBarVisibility(false)
    win.setAutoHideMenuBar(true)
  }
}

async function bootstrap(): Promise<void> {
  const settings = getSettings()
  try {
    await initVault(settings.vaultPath)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    await dialog.showMessageBox({
      type: 'error',
      title: '无法打开文档库',
      message: '初始化本地文档库失败',
      detail: `${detail}\n\n路径：${settings.vaultPath}`
    })
    await initVault(path.join(app.getPath('documents'), 'FeishuNote'))
  }

  protocol.handle('fnasset', async (request) => {
    try {
      const url = new URL(request.url)
      const abs = path.resolve(decodeURIComponent(url.pathname.replace(/^\//, '')))
      if (!isInsideVault(abs) || !fs.existsSync(abs)) return new Response('Not found', { status: 404 })
      return net.fetch(pathToFileURL(abs).toString())
    } catch {
      return new Response('Bad request', { status: 400 })
    }
  })

  createWindow()
  registerIpc(() => mainWindow, () => closeWindowHandler?.())
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) {
      createWindow()
      return
    }
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(bootstrap).catch((error) => {
    console.error(error)
    app.quit()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  app.on('before-quit', () => {
    appQuitting = true
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' || appQuitting) app.quit()
  })

  app.on('will-quit', () => {
    void closeVault()
  })
}

process.on('uncaughtException', (error) => {
  console.error('[main] uncaughtException', error)
})

process.on('unhandledRejection', (error) => {
  console.error('[main] unhandledRejection', error)
})
