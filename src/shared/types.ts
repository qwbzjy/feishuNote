export type ThemeMode = 'light' | 'dark' | 'system'

export interface AppSettings {
  /** 本地文档库的绝对路径 */
  vaultPath: string
  theme: ThemeMode
  /** 正文字号，14 - 19 */
  fontSize: number
  /** 正文最大宽度，640 - 960 */
  lineWidth: number
  showWordCount: boolean
  /** 自动保存防抖，毫秒 */
  autoSaveDelay: number
  lastDocPath: string | null
}

export interface DocMeta {
  id: string
  /** 相对文档库根目录的路径，统一使用 / 分隔 */
  path: string
  title: string
  icon: string | null
  pinned: boolean
  createdAt: string
  updatedAt: string
  wordCount: number
  excerpt: string
}

export type TreeNode =
  | {
      type: 'folder'
      name: string
      path: string
      children: TreeNode[]
    }
  | {
      type: 'doc'
      name: string
      path: string
      id: string
      title: string
      icon: string | null
      pinned: boolean
      updatedAt: string
    }

export interface DocContent {
  meta: DocMeta
  markdown: string
}

export interface RecentDoc extends DocMeta {
  openedAt: string
}

export interface SearchHit {
  meta: DocMeta
  /** 命中片段，命中词用 \u0001 / \u0002 包裹 */
  snippet: string
}

export interface TrashedDoc {
  kind: 'doc' | 'folder'
  id: string
  title: string
  icon: string | null
  originalPath: string
  deletedAt: string
  wordCount: number
}

export interface VersionEntry {
  file: string
  savedAt: string
  size: number
}

export interface SaveDocInput {
  path: string
  id: string
  markdown: string
  title: string
  icon: string | null
  pinned: boolean
}

export interface CreateDocInput {
  folder: string | null
  title?: string
}

export interface ImportAssetInput {
  docPath: string
  name: string
  data: Uint8Array
}

export interface ImportResult {
  docs: DocMeta[]
  skipped: string[]
}

export interface ImportedAsset {
  /** 相对于文档所在目录的路径，可直接写进 Markdown */
  relative: string
  /** 渲染器可直接使用的自定义协议地址 */
  url: string
}

export interface ExportHtmlInput {
  title: string
  html: string
  docPath: string
}

export interface ExportMarkdownInput {
  title: string
  markdown: string
}

export type MenuAction =
  | 'new-doc'
  | 'new-folder'
  | 'quick-open'
  | 'global-search'
  | 'settings'
  | 'toggle-sidebar'
  | 'toggle-outline'
  | 'export-pdf'
  | 'export-html'
  | 'export-markdown'
  | 'theme-light'
  | 'theme-dark'
  | 'theme-system'
  | 'open-vault'
  | 'import-markdown'

export interface FeishuNoteApi {
  platform: 'darwin' | 'win32' | 'linux'
  settings: {
    get(): Promise<AppSettings>
    update(patch: Partial<AppSettings>): Promise<AppSettings>
    chooseVault(): Promise<AppSettings | null>
    openVaultInFinder(): Promise<void>
  }
  vault: {
    tree(): Promise<TreeNode[]>
    recent(limit?: number): Promise<DocMeta[]>
    refresh(): Promise<TreeNode[]>
  }
  doc: {
    create(input: CreateDocInput): Promise<DocContent>
    importDialog(folder: string | null): Promise<ImportResult>
    importPaths(folder: string | null, paths: string[]): Promise<ImportResult>
    open(path: string): Promise<DocContent>
    save(input: SaveDocInput): Promise<DocMeta>
    rename(path: string, title: string): Promise<DocMeta>
    setPinned(path: string, pinned: boolean): Promise<DocMeta>
    move(path: string, folder: string | null): Promise<DocMeta>
    trash(path: string): Promise<void>
    history(path: string): Promise<VersionEntry[]>
    restoreVersion(path: string, file: string): Promise<DocContent>
  }
  folder: {
    create(parent: string | null): Promise<string>
    rename(path: string, name: string): Promise<string>
    trash(path: string): Promise<void>
  }
  trash: {
    list(): Promise<TrashedDoc[]>
    restoreDoc(id: string): Promise<DocContent>
    restoreFolder(id: string): Promise<void>
    deleteDoc(id: string): Promise<void>
    deleteFolder(id: string): Promise<void>
  }
  search: {
    query(q: string): Promise<SearchHit[]>
    quick(q: string): Promise<DocMeta[]>
  }
  asset: {
    import(input: ImportAssetInput): Promise<ImportedAsset>
    url(absPath: string): Promise<string>
  }
  export: {
    pdf(suggestedName: string): Promise<string | null>
    html(input: ExportHtmlInput): Promise<string | null>
    markdown(input: ExportMarkdownInput): Promise<string | null>
  }
  shell: {
    openExternal(url: string): Promise<void>
    showItemInFolder(path: string): Promise<void>
  }
  clipboard: {
    readText(): Promise<string>
  }
  pathForFile(file: unknown): string
  app: {
    closeReady(): Promise<void>
    setTitleBarTheme(theme: 'light' | 'dark'): Promise<void>
  }
  events: {
    onTreeChanged(cb: () => void): () => void
    onMenu(cb: (action: MenuAction) => void): () => void
    onFormat(cb: (command: string) => void): () => void
    onExternalChange(cb: (payload: { path: string }) => void): () => void
    onBeforeClose(cb: () => void): () => void
  }
}
