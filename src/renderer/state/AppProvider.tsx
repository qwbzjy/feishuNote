import type { AppSettings, DocContent, DocMeta, ImportResult, MenuAction, TreeNode } from '@shared/types'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode
} from 'react'
import { api } from '../lib/api'
import { isWindows } from '../lib/platform'
import type {
  ConfirmRequest,
  DocBridge,
  PromptRequest,
  ToastItem,
  ToastTone,
  View
} from './types'

interface AppContextValue {
  ready: boolean
  settings: AppSettings
  tree: TreeNode[]
  recent: DocMeta[]
  view: View
  currentDoc: DocContent | null
  loadingDoc: boolean
  docVersion: number
  sidebarVisible: boolean
  outlineVisible: boolean
  externalChange: { path: string; tick: number } | null

  paletteOpen: boolean
  searchOpen: boolean
  settingsOpen: boolean
  promptState: { request: PromptRequest; resolve: (value: string | null) => void } | null
  confirmState: { request: ConfirmRequest; resolve: (value: boolean) => void } | null
  toasts: ToastItem[]

  openDoc: (path: string) => Promise<void>
  createDoc: (folder?: string | null) => Promise<void>
  deleteDoc: (path: string, title: string) => Promise<void>
  renameDoc: (path: string, title: string) => Promise<void>
  renameDocTo: (path: string, title: string) => Promise<void>
  importMarkdown: (folder?: string | null) => Promise<void>
  importPaths: (folder: string | null, paths: string[]) => Promise<void>
  togglePinned: (path: string, pinned: boolean) => Promise<void>
  createFolder: (parent: string | null) => Promise<void>
  renameFolder: (path: string, name: string) => Promise<void>
  deleteFolder: (path: string, name: string) => Promise<void>
  goHome: () => Promise<void>
  goTrash: () => Promise<void>
  goSearch: (query: string) => Promise<void>
  refreshAll: () => Promise<void>
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>
  chooseVault: () => Promise<void>

  setSidebarVisible: (value: boolean) => void
  toggleSidebar: () => void
  setOutlineVisible: (value: boolean) => void
  setPaletteOpen: (value: boolean) => void
  setSearchOpen: (value: boolean) => void
  setSettingsOpen: (value: boolean) => void

  prompt: (request: PromptRequest) => Promise<string | null>
  confirm: (request: ConfirmRequest) => Promise<boolean>
  answerPrompt: (value: string | null) => void
  answerConfirm: (value: boolean) => void
  toast: (message: string, tone?: ToastTone) => void

  setBridge: (bridge: DocBridge | null) => void
  bridgeRef: MutableRefObject<DocBridge | null>
  noteDocSaved: (meta: DocMeta) => void
  reloadCurrentDoc: () => Promise<void>
}

const fallbackSettings: AppSettings = {
  vaultPath: '',
  theme: 'system',
  fontSize: 15,
  lineWidth: 780,
  showWordCount: true,
  autoSaveDelay: 600,
  lastDocPath: null
}

const AppContext = createContext<AppContextValue | null>(null)

export function useApp(): AppContextValue {
  const value = useContext(AppContext)
  if (!value) throw new Error('AppProvider 未挂载')
  return value
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [settings, setSettings] = useState<AppSettings>(fallbackSettings)
  const [tree, setTree] = useState<TreeNode[]>([])
  const [recent, setRecent] = useState<DocMeta[]>([])
  const [view, setView] = useState<View>({ name: 'home' })
  const [currentDoc, setCurrentDoc] = useState<DocContent | null>(null)
  const [loadingDoc, setLoadingDoc] = useState(false)
  const [docVersion, setDocVersion] = useState(0)
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const [outlineVisible, setOutlineVisible] = useState(false)
  const [externalChange, setExternalChange] = useState<{ path: string; tick: number } | null>(null)

  const [paletteOpen, setPaletteOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [promptState, setPromptState] = useState<AppContextValue['promptState']>(null)
  const [confirmState, setConfirmState] = useState<AppContextValue['confirmState']>(null)
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const bridgeRef = useRef<DocBridge | null>(null)
  const toastIdRef = useRef(0)
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  const toast = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = ++toastIdRef.current
    setToasts((prev) => [...prev.slice(-2), { id, message, tone }])
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id))
    }, 3600)
  }, [])

  const prompt = useCallback(
    (request: PromptRequest) =>
      new Promise<string | null>((resolve) => {
        setPromptState({ request, resolve })
      }),
    []
  )

  const confirm = useCallback(
    (request: ConfirmRequest) =>
      new Promise<boolean>((resolve) => {
        setConfirmState({ request, resolve })
      }),
    []
  )

  const answerPrompt = useCallback((value: string | null) => {
    setPromptState((state) => {
      state?.resolve(value)
      return null
    })
  }, [])

  const answerConfirm = useCallback((value: boolean) => {
    setConfirmState((state) => {
      state?.resolve(value)
      return null
    })
  }, [])

  const refreshAll = useCallback(async () => {
    try {
      const [nextTree, nextRecent] = await Promise.all([api.vault.tree(), api.vault.recent(12)])
      setTree(nextTree)
      setRecent(nextRecent)
    } catch (error) {
      toast(`刷新文档列表失败：${error instanceof Error ? error.message : String(error)}`, 'error')
    }
  }, [toast])

  const flush = useCallback(async () => {
    try {
      await bridgeRef.current?.flush?.()
    } catch {
      // ignore
    }
  }, [])

  const openDoc = useCallback(
    async (path: string) => {
      if (view.name === 'doc' && view.path === path) return
      await flush()
      setLoadingDoc(true)
      try {
        const doc = await api.doc.open(path)
        setCurrentDoc(doc)
        setView({ name: 'doc', path })
        setDocVersion((value) => value + 1)
        setExternalChange(null)
        setRecent((prev) => {
          const rest = prev.filter((item) => item.id !== doc.meta.id)
          return [doc.meta, ...rest].slice(0, 12)
        })
        void api.settings.update({ lastDocPath: path }).then(setSettings).catch(() => undefined)
      } catch (error) {
        toast(`打开文档失败：${error instanceof Error ? error.message : String(error)}`, 'error')
      } finally {
        setLoadingDoc(false)
      }
    },
    [flush, toast, view]
  )

  const createDoc = useCallback(
    async (folder?: string | null) => {
      await flush()
      try {
        const created = await api.doc.create({
          folder: folder === undefined ? currentFolderOf(view) : folder
        })
        setCurrentDoc(created)
        setView({ name: 'doc', path: created.meta.path })
        setDocVersion((value) => value + 1)
        setRecent((prev) => [created.meta, ...prev.filter((item) => item.id !== created.meta.id)].slice(0, 12))
        await refreshAll()
        void api.settings.update({ lastDocPath: created.meta.path }).then(setSettings).catch(() => undefined)
      } catch (error) {
        toast(`新建文档失败：${error instanceof Error ? error.message : String(error)}`, 'error')
      }
    },
    [flush, refreshAll, toast, view]
  )

  const deleteDoc = useCallback(
    async (path: string, title: string) => {
      const ok = await confirm({
        title: '删除文档',
        message: `确定把「${title}」移到回收站吗？可以在回收站中恢复。`,
        confirmText: '移到回收站',
        danger: true
      })
      if (!ok) return
      await flush()
      try {
        await api.doc.trash(path)
        if (view.name === 'doc' && view.path === path) {
          setCurrentDoc(null)
          setView({ name: 'home' })
        }
        await refreshAll()
        toast('已移到回收站', 'success')
      } catch (error) {
        toast(`删除失败：${error instanceof Error ? error.message : String(error)}`, 'error')
      }
    },
    [confirm, flush, refreshAll, toast, view]
  )

  const applyRenamedDoc = useCallback((oldPath: string, meta: DocMeta) => {
    bridgeRef.current?.rebaseAssets?.(oldPath, meta.path)
    setCurrentDoc((prev) => (prev && prev.meta.path === oldPath ? { ...prev, meta } : prev))
    setView((prev) => (prev.name === 'doc' && prev.path === oldPath ? { name: 'doc', path: meta.path } : prev))
    void api.settings.update({ lastDocPath: meta.path }).then(setSettings).catch(() => undefined)
  }, [])

  const renameDocTo = useCallback(
    async (path: string, title: string) => {
      if (!title.trim()) return
      try {
        await bridgeRef.current?.flush?.()
        const meta = await api.doc.rename(path, title.trim())
        if (meta.path !== path) applyRenamedDoc(path, meta)
        await refreshAll()
      } catch (error) {
        toast(`重命名失败：${error instanceof Error ? error.message : String(error)}`, 'error')
      }
    },
    [applyRenamedDoc, refreshAll, toast]
  )

  const renameDoc = useCallback(
    async (path: string, title: string) => {
      const value = await prompt({
        title: '重命名文档',
        label: '文档标题',
        initial: title,
        confirmText: '保存'
      })
      if (value === null || !value.trim()) return
      await renameDocTo(path, value)
    },
    [prompt, renameDocTo]
  )

  const applyImport = useCallback(
    async (result: ImportResult) => {
      if (result.docs.length) {
        await refreshAll()
        await openDoc(result.docs[0].path)
        const extra = result.skipped.length ? `，跳过 ${result.skipped.length} 个文件` : ''
        toast(`已导入 ${result.docs.length} 篇 Markdown${extra}`, 'success')
      } else if (result.skipped.length) {
        toast(`未导入文件：${result.skipped.slice(0, 2).join('；')}`, 'error')
      }
    },
    [openDoc, refreshAll, toast]
  )

  const importMarkdown = useCallback(
    async (folder?: string | null) => {
      await flush()
      try {
        const result = await api.doc.importDialog(
          folder === undefined ? currentFolderOf(view) : folder
        )
        await applyImport(result)
      } catch (error) {
        toast(`导入失败：${error instanceof Error ? error.message : String(error)}`, 'error')
      }
    },
    [applyImport, flush, toast, view]
  )

  const importPaths = useCallback(
    async (folder: string | null, paths: string[]) => {
      if (!paths.length) return
      await flush()
      try {
        const result = await api.doc.importPaths(folder, paths)
        await applyImport(result)
      } catch (error) {
        toast(`导入失败：${error instanceof Error ? error.message : String(error)}`, 'error')
      }
    },
    [applyImport, flush, toast]
  )

  const togglePinned = useCallback(
    async (path: string, pinned: boolean) => {
      try {
        const meta = await api.doc.setPinned(path, pinned)
        await refreshAll()
        if (view.name === 'doc' && view.path === path && currentDoc) {
          setCurrentDoc({ ...currentDoc, meta })
        }
      } catch (error) {
        toast(`操作失败：${error instanceof Error ? error.message : String(error)}`, 'error')
      }
    },
    [currentDoc, refreshAll, toast, view]
  )

  const createFolder = useCallback(
    async (parent: string | null) => {
      const name = await prompt({
        title: '新建文件夹',
        label: '文件夹名称',
        initial: '新建文件夹',
        confirmText: '创建'
      })
      if (name === null || !name.trim()) return
      try {
        const path = await api.folder.create(parent)
        if (name.trim() !== '新建文件夹') {
          await api.folder.rename(path, name.trim())
        }
        await refreshAll()
      } catch (error) {
        toast(`新建文件夹失败：${error instanceof Error ? error.message : String(error)}`, 'error')
      }
    },
    [prompt, refreshAll, toast]
  )

  const renameFolder = useCallback(
    async (path: string, name: string) => {
      const value = await prompt({ title: '重命名文件夹', label: '文件夹名称', initial: name, confirmText: '保存' })
      if (value === null || !value.trim()) return
      try {
        const nextPath = await api.folder.rename(path, value.trim())
        await refreshAll()
        if (view.name === 'doc' && view.path.startsWith(`${path}/`)) {
          const nextDocPath = nextPath + view.path.slice(path.length)
          bridgeRef.current?.rebaseAssets?.(view.path, nextDocPath)
          setCurrentDoc((prev) =>
            prev && prev.meta.path === view.path ? { ...prev, meta: { ...prev.meta, path: nextDocPath } } : prev
          )
          setView({ name: 'doc', path: nextDocPath })
        }
      } catch (error) {
        toast(`重命名失败：${error instanceof Error ? error.message : String(error)}`, 'error')
      }
    },
    [prompt, refreshAll, toast, view]
  )

  const deleteFolder = useCallback(
    async (path: string, name: string) => {
      const ok = await confirm({
        title: '删除文件夹',
        message: `确定把文件夹「${name}」及其中的文档移到回收站吗？`,
        confirmText: '移到回收站',
        danger: true
      })
      if (!ok) return
      try {
        await api.folder.trash(path)
        if (view.name === 'doc' && view.path.startsWith(`${path}/`)) {
          setCurrentDoc(null)
          setView({ name: 'home' })
        }
        await refreshAll()
        toast('文件夹已移到回收站', 'success')
      } catch (error) {
        toast(`删除失败：${error instanceof Error ? error.message : String(error)}`, 'error')
      }
    },
    [confirm, refreshAll, toast, view]
  )

  const goHome = useCallback(async () => {
    await flush()
    setCurrentDoc(null)
    setView({ name: 'home' })
    await refreshAll()
  }, [flush, refreshAll])

  const goTrash = useCallback(async () => {
    await flush()
    setCurrentDoc(null)
    setView({ name: 'trash' })
  }, [flush])

  const goSearch = useCallback(
    async (query: string) => {
      await flush()
      setCurrentDoc(null)
      setView({ name: 'search', query })
    },
    [flush]
  )

  const updateSettings = useCallback(
    async (patch: Partial<AppSettings>) => {
      try {
        const next = await api.settings.update(patch)
        setSettings(next)
      } catch (error) {
        toast(`更新设置失败：${error instanceof Error ? error.message : String(error)}`, 'error')
      }
    },
    [toast]
  )

  const chooseVault = useCallback(async () => {
    await flush()
    try {
      const next = await api.settings.chooseVault()
      if (!next) return
      setSettings(next)
      setCurrentDoc(null)
      setView({ name: 'home' })
      await refreshAll()
      toast('文档库已切换', 'success')
    } catch (error) {
      toast(`切换文档库失败：${error instanceof Error ? error.message : String(error)}`, 'error')
    }
  }, [flush, refreshAll, toast])

  const noteDocSaved = useCallback((meta: DocMeta) => {
    setCurrentDoc((prev) => (prev && prev.meta.path === meta.path ? { ...prev, meta } : prev))
    setTree((prev) => updateTreeDoc(prev, meta))
    setRecent((prev) => {
      const existing = prev.find((item) => item.id === meta.id)
      if (!existing) return prev
      return prev.map((item) => (item.id === meta.id ? meta : item))
    })
  }, [])

  const reloadCurrentDoc = useCallback(async () => {
    if (view.name !== 'doc') return
    try {
      const doc = await api.doc.open(view.path)
      setCurrentDoc(doc)
      setDocVersion((value) => value + 1)
      setExternalChange(null)
      toast('已重新载入磁盘上的最新内容', 'success')
    } catch (error) {
      toast(`重新载入失败：${error instanceof Error ? error.message : String(error)}`, 'error')
    }
  }, [toast, view])

  const setBridge = useCallback((bridge: DocBridge | null) => {
    bridgeRef.current = bridge
  }, [])

  // 初���化
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const nextSettings = await api.settings.get()
        const [nextTree, nextRecent] = await Promise.all([api.vault.tree(), api.vault.recent(12)])
        if (cancelled) return
        setSettings(nextSettings)
        setTree(nextTree)
        setRecent(nextRecent)
        if (nextSettings.lastDocPath) {
          try {
            const doc = await api.doc.open(nextSettings.lastDocPath)
            if (!cancelled) {
              setCurrentDoc(doc)
              setView({ name: 'doc', path: nextSettings.lastDocPath })
            }
          } catch {
            // 上次的文档可能已被删除
          }
        }
      } catch (error) {
        if (!cancelled) {
          toast(`初始化失败：${error instanceof Error ? error.message : String(error)}`, 'error')
        }
      } finally {
        if (!cancelled) setReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 主题 / 排版变量
  useEffect(() => {
    document.documentElement.dataset.platform = api.platform
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (): void => {
      const resolved = settings.theme === 'system' ? (media.matches ? 'dark' : 'light') : settings.theme
      document.documentElement.dataset.theme = resolved
      if (isWindows) void api.app.setTitleBarTheme(resolved)
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [settings.theme])

  useEffect(() => {
    document.documentElement.style.setProperty('--doc-width', `${settings.lineWidth}px`)
    document.documentElement.style.setProperty('--doc-font-size', `${settings.fontSize}px`)
    document.documentElement.style.setProperty('--doc-line-height', '1.75')
  }, [settings.lineWidth, settings.fontSize])

  // 主进程事件
  useEffect(() => {
    const offTree = api.events.onTreeChanged(() => {
      void refreshAll()
    })
    const offExternal = api.events.onExternalChange(({ path }) => {
      setExternalChange({ path, tick: Date.now() })
    })
    const offMenu = api.events.onMenu((action: MenuAction) => {
      void handleMenuAction(action)
    })
    const offFormat = api.events.onFormat((command) => {
      bridgeRef.current?.format(command)
    })

    async function handleMenuAction(action: MenuAction): Promise<void> {
      switch (action) {
        case 'new-doc':
          await createDoc()
          break
        case 'new-folder':
          await createFolder(currentFolderOf(view))
          break
        case 'import-markdown':
          await importMarkdown()
          break
        case 'quick-open':
          setPaletteOpen(true)
          break
        case 'global-search':
          setSearchOpen(true)
          break
        case 'settings':
          setSettingsOpen(true)
          break
        case 'toggle-sidebar':
          setSidebarVisible((value) => !value)
          break
        case 'toggle-outline':
          bridgeRef.current?.toggleOutline()
          break
        case 'export-pdf':
          bridgeRef.current?.exportPdf()
          break
        case 'export-html':
          bridgeRef.current?.exportHtml()
          break
        case 'export-markdown':
          bridgeRef.current?.exportMarkdown()
          break
        case 'theme-light':
          await updateSettings({ theme: 'light' })
          break
        case 'theme-dark':
          await updateSettings({ theme: 'dark' })
          break
        case 'theme-system':
          await updateSettings({ theme: 'system' })
          break
        case 'open-vault':
          await api.settings.openVaultInFinder()
          break
        default:
          break
      }
    }

    return () => {
      offTree()
      offExternal()
      offMenu()
      offFormat()
    }
  }, [createDoc, createFolder, refreshAll, updateSettings, view])

  // 应用级快捷键（菜单中注册为 registerAccelerator:false，避免双重触发）
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!event.metaKey && !event.ctrlKey) return
      const key = event.key.toLowerCase()
      if (key === 'n') {
        event.preventDefault()
        if (event.shiftKey) void createFolder(currentFolderOf(view))
        else void createDoc()
        return
      }
      if (key === 'p') {
        event.preventDefault()
        setPaletteOpen(true)
        return
      }
      if (key === 'i' && event.shiftKey) {
        event.preventDefault()
        void importMarkdown()
        return
      }
      if (key === 'v' && event.altKey) {
        event.preventDefault()
        bridgeRef.current?.format('pasteMarkdown')
        return
      }
      if (key === 'f') {
        event.preventDefault()
        if (event.shiftKey) setSearchOpen(true)
        else bridgeRef.current?.format('find')
        return
      }
      if (key === 's') {
        event.preventDefault()
        void bridgeRef.current?.flush?.()
        return
      }
      if (key === ',') {
        event.preventDefault()
        setSettingsOpen(true)
        return
      }
      if (key === '\\') {
        event.preventDefault()
        setSidebarVisible((value) => !value)
        return
      }
      if (key === 'o' && event.shiftKey) {
        event.preventDefault()
        bridgeRef.current?.toggleOutline()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [createDoc, createFolder, importMarkdown, view])

  // 应用退出前保存
  useEffect(() => {
    const offClose = api.events.onBeforeClose(() => {
      void (async () => {
        try {
          await bridgeRef.current?.flush?.()
        } finally {
          await api.app.closeReady()
        }
      })()
    })
    const handler = (): void => {
      void bridgeRef.current?.flush?.()
    }
    window.addEventListener('beforeunload', handler)
    return () => {
      offClose()
      window.removeEventListener('beforeunload', handler)
    }
  }, [])

  const value = useMemo<AppContextValue>(
    () => ({
      ready,
      settings,
      tree,
      recent,
      view,
      currentDoc,
      loadingDoc,
      docVersion,
      sidebarVisible,
      outlineVisible,
      externalChange,
      paletteOpen,
      searchOpen,
      settingsOpen,
      promptState,
      confirmState,
      toasts,
      openDoc,
      createDoc,
      deleteDoc,
      renameDoc,
      renameDocTo,
      importMarkdown,
      importPaths,
      togglePinned,
      createFolder,
      renameFolder,
      deleteFolder,
      goHome,
      goTrash,
      goSearch,
      refreshAll,
      updateSettings,
      chooseVault,
      setSidebarVisible,
      toggleSidebar: () => setSidebarVisible((v) => !v),
      setOutlineVisible,
      setPaletteOpen,
      setSearchOpen,
      setSettingsOpen,
      prompt,
      confirm,
      answerPrompt,
      answerConfirm,
      toast,
      setBridge,
      bridgeRef,
      noteDocSaved,
      reloadCurrentDoc
    }),
    [
      ready,
      settings,
      tree,
      recent,
      view,
      currentDoc,
      loadingDoc,
      docVersion,
      sidebarVisible,
      outlineVisible,
      externalChange,
      paletteOpen,
      searchOpen,
      settingsOpen,
      promptState,
      confirmState,
      toasts,
      openDoc,
      createDoc,
      deleteDoc,
      renameDoc,
      renameDocTo,
      importMarkdown,
      importPaths,
      togglePinned,
      createFolder,
      renameFolder,
      deleteFolder,
      goHome,
      goTrash,
      goSearch,
      refreshAll,
      updateSettings,
      chooseVault,
      prompt,
      confirm,
      answerPrompt,
      answerConfirm,
      toast,
      setBridge,
      noteDocSaved,
      reloadCurrentDoc
    ]
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

function currentFolderOf(view: View): string | null {
  if (view.name === 'doc') {
    const index = view.path.lastIndexOf('/')
    return index === -1 ? null : view.path.slice(0, index)
  }
  return null
}

function updateTreeDoc(nodes: TreeNode[], meta: DocMeta): TreeNode[] {
  return nodes.map((node) => {
    if (node.type === 'doc') {
      return node.path === meta.path
        ? { ...node, title: meta.title, icon: meta.icon, pinned: meta.pinned, updatedAt: meta.updatedAt }
        : node
    }
    return { ...node, children: updateTreeDoc(node.children, meta) }
  })
}
