import fs from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import type { DocContent, DocMeta, SaveDocInput, TreeNode, TrashedDoc, VersionEntry, CreateDocInput, ImportAssetInput, ImportedAsset, ImportResult } from '@shared/types'
import { IndexDb } from './db'
import { getSettings } from './settings'
import { splitFrontmatter, buildFile, type DocFrontmatter } from './frontmatter'
import { welcomeMarkdownFor } from './welcome'
import {
  ASSET_DIR_SUFFIX,
  MARKDOWN_EXT,
  assetDirForDoc,
  atomicWrite,
  countWords,
  hashId,
  isIgnoredDirName,
  makeExcerpt,
  normalizeRel,
  safeJoin,
  sanitizeName,
  toAssetUrl,
  toPosix,
  uniquePath
} from './fs-utils'
import { emitToRenderer } from './events'

let root = ''
let index: IndexDb | null = null
let watcher: fs.FSWatcher | null = null
let foldersCache: string[] = []
let openDocPath: string | null = null
let scanning = false
let scanQueued = false
let refreshTimer: NodeJS.Timeout | null = null
const selfWrites = new Map<string, number>()

export const TRASH_DIR = '.trash'
export const HISTORY_DIR = '.history'

function db(): IndexDb {
  if (!index) throw new Error('文档库尚未初始化')
  return index
}

export function getVaultRoot(): string {
  if (!root) throw new Error('文档库尚未初始化')
  return root
}

export function setOpenDocPath(rel: string | null): void {
  openDocPath = rel
}

export async function initVault(vaultPath: string): Promise<void> {
  root = path.resolve(vaultPath)
  fs.mkdirSync(root, { recursive: true })
  fs.mkdirSync(path.join(root, '.feishunote'), { recursive: true })
  fs.mkdirSync(path.join(root, TRASH_DIR), { recursive: true })
  fs.mkdirSync(path.join(root, HISTORY_DIR), { recursive: true })

  watcher?.close()
  watcher = null
  index?.close()
  index = new IndexDb(path.join(root, '.feishunote', 'index.db'))
  foldersCache = []
  await scanAndSync()
  await ensureWelcomeDoc()
  startWatcher()
}

async function ensureWelcomeDoc(): Promise<void> {
  const marker = path.join(root, '.feishunote', 'welcome-v1')
  if (fs.existsSync(marker)) return
  try {
    fs.writeFileSync(marker, new Date().toISOString(), 'utf8')
    if (db().listActive().length > 0) return
    const title = '欢迎使用 FeishuNote'
    const body = welcomeMarkdownFor(process.platform)
    const fileAbs = uniquePath(root, title)
    const rel = toPosix(path.relative(root, fileAbs))
    const now = new Date().toISOString()
    const id = newDocId()
    const meta: DocMeta = {
      id,
      path: rel,
      title,
      icon: '👋',
      pinned: false,
      createdAt: now,
      updatedAt: now,
      wordCount: countWords(body),
      excerpt: makeExcerpt(body)
    }
    atomicWrite(fileAbs, buildFile({ id, title, icon: '👋', created: now, updated: now }, body))
    markSelfWrite(fileAbs)
    db().upsert(meta, body)
    db().touchRecent(id)
  } catch {
    // 首次欢迎文档失败不影响使用
  }
}

export async function closeVault(): Promise<void> {
  watcher?.close()
  watcher = null
  index?.close()
  index = null
}

function markSelfWrite(abs: string): void {
  selfWrites.set(path.resolve(abs), Date.now())
  if (selfWrites.size > 500) {
    const cutoff = Date.now() - 5000
    for (const [key, value] of selfWrites) if (value < cutoff) selfWrites.delete(key)
  }
}

function isSelfWrite(abs: string): boolean {
  const t = selfWrites.get(path.resolve(abs))
  return Boolean(t && Date.now() - t < 3000)
}

function startWatcher(): void {
  try {
    watcher = fs.watch(root, { recursive: true }, (_event, filename) => {
      if (!filename) return
      const rel = toPosix(String(filename))
      if (!rel) return
      if (rel.startsWith('.feishunote') || rel.startsWith(TRASH_DIR) || rel.startsWith(HISTORY_DIR)) return
      if (rel.includes(`${ASSET_DIR_SUFFIX}/`) || rel.endsWith('.tmp')) return
      const abs = path.join(root, rel)
      if (isSelfWrite(abs)) return
      if (rel.endsWith(MARKDOWN_EXT)) {
        if (openDocPath && rel === openDocPath) {
          emitToRenderer('vault:external-change', { path: rel })
        }
      }
      scheduleRefresh()
    })
    watcher.on('error', () => undefined)
  } catch {
    // 文件监听失败不影响显式刷新
  }
}

function scheduleRefresh(): void {
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = setTimeout(async () => {
    refreshTimer = null
    try {
      await scanAndSync()
      emitToRenderer('vault:tree-changed')
    } catch {
      // 忽略瞬时错误（文件正在写入等）
    }
  }, 500)
}

interface ScannedDoc {
  meta: DocMeta
  body: string
}

async function scanAndSync(): Promise<DocMeta[]> {
  if (scanning) {
    scanQueued = true
    return db().listActive()
  }
  scanning = true
  const docs: ScannedDoc[] = []
  const folders: string[] = []
  try {
    await walk(root, '', 0, docs, folders)
  } finally {
    scanning = false
  }
  const tx = db()
  for (const doc of docs) tx.upsert(doc.meta, doc.body)
  tx.reconcile(new Set(docs.map((d) => d.meta.path)))
  foldersCache = folders.sort()
  if (scanQueued) {
    scanQueued = false
    setTimeout(() => void scanAndSync().catch(() => undefined), 0)
  }
  return docs.map((d) => d.meta)
}

async function walk(absDir: string, relDir: string, depth: number, docs: ScannedDoc[], folders: string[]): Promise<void> {
  if (depth > 12) return
  let entries: fs.Dirent[]
  try {
    entries = await fs.promises.readdir(absDir, { withFileTypes: true })
  } catch {
    return
  }
  entries.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    if (entry.isSymbolicLink()) continue
    const abs = path.join(absDir, entry.name)
    const rel = relDir ? `${relDir}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      if (isIgnoredDirName(entry.name)) continue
      folders.push(rel)
      await walk(abs, rel, depth + 1, docs, folders)
      continue
    }
    if (!entry.isFile() || !entry.name.endsWith(MARKDOWN_EXT)) continue
    try {
      const [raw, stat] = await Promise.all([fs.promises.readFile(abs, 'utf8'), fs.promises.stat(abs)])
      const parsed = parseDocFile(rel, raw, stat)
      docs.push(parsed)
    } catch {
      // 跳过无法读取的文件
    }
  }
}

function parseDocFile(rel: string, raw: string, stat: fs.Stats): ScannedDoc {
  const { data, body } = splitFrontmatter(raw)
  const base = path.basename(rel, MARKDOWN_EXT)
  const fallbackId = `p_${hashId(rel)}`
  const meta: DocMeta = {
    id: typeof data.id === 'string' && data.id.trim() ? data.id : fallbackId,
    path: rel,
    title: (data.title?.trim() || base || '未命名文档').slice(0, 200),
    icon: data.icon ?? null,
    pinned: data.pinned === true,
    createdAt: data.created ?? stat.birthtime.toISOString(),
    updatedAt: stat.mtime.toISOString(),
    wordCount: countWords(body),
    excerpt: makeExcerpt(body)
  }
  return { meta, body }
}

function newDocId(): string {
  return `d${randomBytes(7).toString('base64url')}`
}

function buildTreeFrom(docs: DocMeta[], folders: string[]): TreeNode[] {
  type FolderAcc = Extract<TreeNode, { type: 'folder' }>
  const rootAcc: FolderAcc = { type: 'folder', name: '', path: '', children: [] }
  const map = new Map<string, FolderAcc>([['', rootAcc]])

  const ensureFolder = (rel: string): FolderAcc => {
    const existing = map.get(rel)
    if (existing) return existing
    const parentRel = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : ''
    const parent = ensureFolder(parentRel)
    const node: FolderAcc = { type: 'folder', name: rel.split('/').pop() ?? rel, path: rel, children: [] }
    parent.children.push(node)
    map.set(rel, node)
    return node
  }

  for (const folder of folders) ensureFolder(folder)
  for (const doc of docs) {
    const parentRel = doc.path.includes('/') ? doc.path.slice(0, doc.path.lastIndexOf('/')) : ''
    const parent = ensureFolder(parentRel)
    parent.children.push({
      type: 'doc',
      name: doc.title,
      path: doc.path,
      id: doc.id,
      title: doc.title,
      icon: doc.icon,
      pinned: doc.pinned,
      updatedAt: doc.updatedAt
    })
  }

  const sortNode = (node: FolderAcc): void => {
    node.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
      if (a.type === 'doc' && b.type === 'doc') {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        return a.updatedAt < b.updatedAt ? 1 : -1
      }
      return a.name.localeCompare(b.name, 'zh-Hans-CN')
    })
    for (const child of node.children) if (child.type === 'folder') sortNode(child)
  }
  sortNode(rootAcc)
  return rootAcc.children
}

export function getTree(): TreeNode[] {
  return buildTreeFrom(db().listActive(), foldersCache)
}

export async function refreshTree(): Promise<TreeNode[]> {
  await scanAndSync()
  return getTree()
}

export function recentDocs(limit = 12): DocMeta[] {
  return db().recent(limit)
}

export async function openDoc(relPath: string): Promise<DocContent> {
  const rel = normalizeRel(relPath)
  const abs = safeJoin(getVaultRoot(), rel)
  const raw = await fs.promises.readFile(abs, 'utf8')
  const stat = await fs.promises.stat(abs)
  const { meta, body } = parseDocFile(rel, raw, stat)
  db().upsert(meta, body)
  db().touchRecent(meta.id)
  openDocPath = rel
  return { meta, markdown: body }
}

export async function createDoc(input: CreateDocInput): Promise<DocContent> {
  const folderRel = input.folder ? normalizeRel(input.folder) : ''
  const dirAbs = folderRel ? safeJoin(getVaultRoot(), folderRel) : getVaultRoot()
  fs.mkdirSync(dirAbs, { recursive: true })
  const title = (input.title?.trim() || '未命名文档').slice(0, 120)
  const fileAbs = uniquePath(dirAbs, title)
  const rel = toPosix(path.relative(getVaultRoot(), fileAbs))
  const now = new Date().toISOString()
  const id = newDocId()
  const meta: DocMeta = {
    id,
    path: rel,
    title,
    icon: null,
    pinned: false,
    createdAt: now,
    updatedAt: now,
    wordCount: 0,
    excerpt: ''
  }
  atomicWrite(fileAbs, buildFile({ id, title, created: now, updated: now }, ''))
  markSelfWrite(fileAbs)
  db().upsert(meta, '')
  db().touchRecent(id)
  openDocPath = rel
  return { meta, markdown: '' }
}

export async function importMarkdownFiles(folder: string | null, sourcePaths: string[]): Promise<ImportResult> {
  const targetRel = folder ? normalizeRel(folder) : ''
  const targetDir = targetRel ? safeJoin(getVaultRoot(), targetRel) : getVaultRoot()
  fs.mkdirSync(targetDir, { recursive: true })

  const files: string[] = []
  const skipped: string[] = []

  const collect = async (input: string, depth: number): Promise<void> => {
    if (depth > 12 || files.length >= 500) return
    let stat: fs.Stats
    try {
      stat = await fs.promises.lstat(input)
    } catch {
      skipped.push(`${path.basename(input)}（无法读取）`)
      return
    }
    if (stat.isSymbolicLink()) return
    if (stat.isDirectory()) {
      if (isIgnoredDirName(path.basename(input))) return
      const entries = await fs.promises.readdir(input)
      for (const entry of entries.sort()) {
        if (entry.startsWith('.')) continue
        await collect(path.join(input, entry), depth + 1)
      }
      return
    }
    if (!stat.isFile()) return
    if (!/\.(md|markdown|mdown)$/i.test(input)) return
    files.push(input)
  }

  for (const source of sourcePaths) await collect(source, 0)

  const imported: string[] = []
  for (const source of files.slice(0, 500)) {
    const name = path.basename(source)
    try {
      const stat = await fs.promises.stat(source)
      if (stat.size > 20 * 1024 * 1024) {
        skipped.push(`${name}（超过 20MB）`)
        continue
      }
      if (isInsideVault(source)) {
        skipped.push(`${name}（已在文档库中）`)
        continue
      }
      const raw = await fs.promises.readFile(source, 'utf8')
      const { data, body } = splitFrontmatter(raw)
      const title = (data.title?.trim() || path.basename(source, path.extname(source))).slice(0, 200)
      const destAbs = uniquePath(targetDir, sanitizeName(title, '导入文档'))
      const destBase = path.basename(destAbs, MARKDOWN_EXT)
      const assetsPrefix = `${destBase}${ASSET_DIR_SUFFIX}`
      const assetsDir = path.join(targetDir, assetsPrefix)
      const nextBody = copyReferencedAssets(body, path.dirname(source), assetsDir, assetsPrefix)
      const now = new Date().toISOString()
      const id = newDocId()
      atomicWrite(
        destAbs,
        buildFile(
          {
            id,
            title,
            icon: data.icon ?? null,
            created: data.created ?? now,
            updated: now,
            pinned: false,
            tags: data.tags
          },
          nextBody
        )
      )
      markSelfWrite(destAbs)
      imported.push(toPosix(path.relative(getVaultRoot(), destAbs)))
    } catch (error) {
      skipped.push(`${name}：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  if (imported.length) await scanAndSync()
  const docs = imported
    .map((rel) => db().getByPath(rel))
    .filter((meta): meta is DocMeta => Boolean(meta))
  return { docs, skipped }
}

function copyReferencedAssets(
  body: string,
  sourceDir: string,
  assetsDir: string,
  assetsPrefix: string
): string {
  const copied = new Map<string, string>()

  const copyOne = (rawSrc: string): string | null => {
    let src = rawSrc.trim().replace(/^<|>$/g, '')
    if (!src || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(src)) return null
    try {
      src = decodeURI(src)
    } catch {
      // 保留原始路径
    }
    if (path.isAbsolute(src)) return null
    const abs = path.resolve(sourceDir, src)
    if (!isInsideVault(abs) && !fs.existsSync(abs)) return null
    let stat: fs.Stats
    try {
      stat = fs.statSync(abs)
    } catch {
      return null
    }
    if (!stat.isFile() || stat.size > 60 * 1024 * 1024) return null
    const existing = copied.get(abs)
    if (existing) return existing
    fs.mkdirSync(assetsDir, { recursive: true })
    const ext = path.extname(abs)
    const stem = sanitizeName(path.basename(abs, ext), 'file')
    let filename = `${stem}${ext}`
    let index = 2
    while (fs.existsSync(path.join(assetsDir, filename))) {
      filename = `${stem} ${index}${ext}`
      index += 1
    }
    const dest = path.join(assetsDir, filename)
    try {
      fs.copyFileSync(abs, dest)
      markSelfWrite(dest)
    } catch {
      return null
    }
    const relative = encodeURI(`${assetsPrefix}/${filename}`)
    copied.set(abs, relative)
    return relative
  }

  let next = body.replace(
    /(!\[[^\]]*\]\()([^)\s]+)((?:\s+"[^"]*")?\))/g,
    (match, prefix: string, src: string, suffix: string) => {
      const copiedRel = copyOne(src)
      return copiedRel ? `${prefix}${copiedRel}${suffix}` : match
    }
  )
  next = next.replace(
    /(<img\b[^>]*\bsrc=")([^"]+)(")/gi,
    (match, prefix: string, src: string, suffix: string) => {
      const copiedRel = copyOne(src)
      return copiedRel ? `${prefix}${copiedRel}${suffix}` : match
    }
  )
  next = next.replace(
    /(<img\b[^>]*\bsrc=')([^']+)(')/gi,
    (match, prefix: string, src: string, suffix: string) => {
      const copiedRel = copyOne(src)
      return copiedRel ? `${prefix}${copiedRel}${suffix}` : match
    }
  )
  return next
}

export async function saveDoc(input: SaveDocInput): Promise<DocMeta> {
  const rel = normalizeRel(input.path)
  const abs = safeJoin(getVaultRoot(), rel)
  const before = await fs.promises.readFile(abs, 'utf8')
  const stat = await fs.promises.stat(abs)
  const parsed = parseDocFile(rel, before, stat)
  const now = new Date().toISOString()
  const title = (input.title.trim() || '未命名文档').slice(0, 200)
  const body = input.markdown.replace(/\r\n/g, '\n')
  const fm: DocFrontmatter = {
    id: input.id,
    title,
    icon: input.icon,
    created: parsed.meta.createdAt,
    updated: now,
    pinned: input.pinned
  }
  const next = buildFile(fm, body)
  if (next !== before) {
    snapshotBeforeWrite(abs, input.id, before)
    atomicWrite(abs, next)
    markSelfWrite(abs)
  }
  const meta: DocMeta = {
    ...parsed.meta,
    id: input.id,
    title,
    icon: input.icon,
    pinned: input.pinned,
    updatedAt: now,
    wordCount: countWords(body),
    excerpt: makeExcerpt(body)
  }
  db().upsert(meta, body)
  return meta
}

export async function renameDoc(relPath: string, titleInput: string): Promise<DocMeta> {
  const rel = normalizeRel(relPath)
  const abs = safeJoin(getVaultRoot(), rel)
  const raw = await fs.promises.readFile(abs, 'utf8')
  const stat = await fs.promises.stat(abs)
  const parsed = parseDocFile(rel, raw, stat)
  const title = (titleInput.trim() || '未命名文档').slice(0, 200)
  const oldBase = path.basename(rel, MARKDOWN_EXT)
  const newBase = sanitizeName(title)
  const now = new Date().toISOString()

  let targetAbs = abs
  let targetRel = rel
  let body = parsed.body

  const sameBase = oldBase.toLowerCase() === newBase.toLowerCase()
  if (!sameBase) {
    targetAbs = uniquePath(path.dirname(abs), newBase)
    targetRel = toPosix(path.relative(getVaultRoot(), targetAbs))
    const nextBase = path.basename(targetAbs, MARKDOWN_EXT)
    const oldAssets = assetDirForDoc(abs)
    const newAssets = assetDirForDoc(targetAbs)
    if (fs.existsSync(oldAssets) && oldAssets !== newAssets) {
      try {
        fs.renameSync(oldAssets, newAssets)
      } catch {
        // 资源目录移动失败时保留原目录
      }
    }
    body = body.split(`${oldBase}${ASSET_DIR_SUFFIX}/`).join(`${nextBase}${ASSET_DIR_SUFFIX}/`)
  }

  const fm: DocFrontmatter = {
    id: parsed.meta.id,
    title,
    icon: parsed.meta.icon,
    created: parsed.meta.createdAt,
    updated: now,
    pinned: parsed.meta.pinned
  }
  atomicWrite(targetAbs, buildFile(fm, body))
  markSelfWrite(targetAbs)
  if (targetAbs !== abs) {
    try {
      fs.unlinkSync(abs)
      markSelfWrite(abs)
    } catch {
      // ignore
    }
  }
  const meta: DocMeta = {
    ...parsed.meta,
    path: targetRel,
    title,
    updatedAt: now,
    wordCount: countWords(body),
    excerpt: makeExcerpt(body)
  }
  db().upsert(meta, body)
  if (openDocPath === rel) openDocPath = targetRel
  return meta
}

export async function setPinned(relPath: string, pinned: boolean): Promise<DocMeta> {
  const rel = normalizeRel(relPath)
  const abs = safeJoin(getVaultRoot(), rel)
  const raw = await fs.promises.readFile(abs, 'utf8')
  const stat = await fs.promises.stat(abs)
  const parsed = parseDocFile(rel, raw, stat)
  const fm: DocFrontmatter = {
    id: parsed.meta.id,
    title: parsed.meta.title,
    icon: parsed.meta.icon,
    created: parsed.meta.createdAt,
    updated: parsed.meta.updatedAt,
    pinned
  }
  atomicWrite(abs, buildFile(fm, parsed.body))
  markSelfWrite(abs)
  const meta = { ...parsed.meta, pinned }
  db().upsert(meta, parsed.body)
  return meta
}

export async function moveDoc(relPath: string, folder: string | null): Promise<DocMeta> {
  const rel = normalizeRel(relPath)
  const abs = safeJoin(getVaultRoot(), rel)
  const folderRel = folder ? normalizeRel(folder) : ''
  const targetDir = folderRel ? safeJoin(getVaultRoot(), folderRel) : getVaultRoot()
  fs.mkdirSync(targetDir, { recursive: true })
  const base = path.basename(rel, MARKDOWN_EXT)
  const targetAbs = uniquePath(targetDir, base)
  if (targetAbs === abs) return db().getByPath(rel) as DocMeta

  const oldAssets = assetDirForDoc(abs)
  const newAssets = assetDirForDoc(targetAbs)
  fs.renameSync(abs, targetAbs)
  if (fs.existsSync(oldAssets)) {
    try {
      fs.renameSync(oldAssets, newAssets)
    } catch {
      // ignore
    }
  }
  markSelfWrite(abs)
  markSelfWrite(targetAbs)
  const oldBase = path.basename(rel, MARKDOWN_EXT)
  const newBase = path.basename(targetAbs, MARKDOWN_EXT)
  if (oldBase !== newBase) {
    const raw = await fs.promises.readFile(targetAbs, 'utf8')
    const split = splitFrontmatter(raw)
    const nextBody = split.body
      .split(`${oldBase}${ASSET_DIR_SUFFIX}/`)
      .join(`${newBase}${ASSET_DIR_SUFFIX}/`)
    atomicWrite(
      targetAbs,
      buildFile({ ...split.data, updated: new Date().toISOString() }, nextBody)
    )
    markSelfWrite(targetAbs)
  }
  const stat = await fs.promises.stat(targetAbs)
  const raw = await fs.promises.readFile(targetAbs, 'utf8')
  const parsed = parseDocFile(toPosix(path.relative(getVaultRoot(), targetAbs)), raw, stat)
  db().upsert(parsed.meta, parsed.body)
  if (openDocPath === rel) openDocPath = parsed.meta.path
  return parsed.meta
}

export async function trashDoc(relPath: string): Promise<void> {
  const rel = normalizeRel(relPath)
  const abs = safeJoin(getVaultRoot(), rel)
  const meta = db().getByPath(rel)
  if (!meta) throw new Error('文档不存在')
  const base = sanitizeName(meta.title)
  const trashFileAbs = uniquePath(path.join(getVaultRoot(), TRASH_DIR), `${Date.now()}-${base}`, MARKDOWN_EXT)
  const trashRel = toPosix(path.relative(getVaultRoot(), trashFileAbs))
  const oldAssets = assetDirForDoc(abs)
  const trashAssets = assetDirForDoc(trashFileAbs)
  fs.renameSync(abs, trashFileAbs)
  if (fs.existsSync(oldAssets)) {
    try {
      fs.renameSync(oldAssets, trashAssets)
    } catch {
      // ignore
    }
  }
  markSelfWrite(abs)
  markSelfWrite(trashFileAbs)
  db().markDeleted(meta.id, trashRel)
  if (openDocPath === rel) openDocPath = null
}

export function trashList(): TrashedDoc[] {
  return [...db().trashedDocs(), ...db().trashedFolders()].sort((a, b) => (a.deletedAt < b.deletedAt ? 1 : -1))
}

export async function restoreDoc(id: string): Promise<DocContent> {
  const trashed = db().getTrashed(id)
  if (!trashed) throw new Error('回收站中找不到该文档')
  const trashAbs = safeJoin(getVaultRoot(), trashed.trashPath)
  const originalAbs = safeJoin(getVaultRoot(), trashed.originalPath)
  fs.mkdirSync(path.dirname(originalAbs), { recursive: true })
  let targetAbs = originalAbs
  if (fs.existsSync(targetAbs)) {
    targetAbs = uniquePath(path.dirname(originalAbs), path.basename(originalAbs, MARKDOWN_EXT))
  }
  const targetRel = toPosix(path.relative(getVaultRoot(), targetAbs))
  const trashAssets = assetDirForDoc(trashAbs)
  const targetAssets = assetDirForDoc(targetAbs)
  fs.renameSync(trashAbs, targetAbs)
  if (fs.existsSync(trashAssets)) {
    try {
      fs.renameSync(trashAssets, targetAssets)
    } catch {
      // ignore
    }
  }
  markSelfWrite(targetAbs)
  const stat = await fs.promises.stat(targetAbs)
  const raw = await fs.promises.readFile(targetAbs, 'utf8')
  const parsed = parseDocFile(targetRel, raw, stat)
  db().upsert(parsed.meta, parsed.body)
  db().clearDeleted(id, targetRel)
  openDocPath = targetRel
  return { meta: parsed.meta, markdown: parsed.body }
}

export async function deleteDocForever(id: string): Promise<void> {
  const trashed = db().getTrashed(id)
  if (!trashed) return
  const trashAbs = safeJoin(getVaultRoot(), trashed.trashPath)
  removeFile(trashAbs)
  removeDir(assetDirForDoc(trashAbs))
  removeDir(path.join(getVaultRoot(), HISTORY_DIR, id))
  db().deleteRow(id)
}

export function listVersions(relPath: string): VersionEntry[] {
  const rel = normalizeRel(relPath)
  const meta = db().getByPath(rel)
  if (!meta) return []
  const dir = path.join(getVaultRoot(), HISTORY_DIR, meta.id)
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(MARKDOWN_EXT))
    .map((name) => {
      const stat = fs.statSync(path.join(dir, name))
      return { file: name, savedAt: stat.mtime.toISOString(), size: stat.size }
    })
    .sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1))
}

function snapshotBeforeWrite(abs: string, id: string, previousRaw: string): void {
  try {
    const dir = path.join(getVaultRoot(), HISTORY_DIR, id)
    fs.mkdirSync(dir, { recursive: true })
    const files = fs
      .readdirSync(dir)
      .filter((name) => name.endsWith(MARKDOWN_EXT))
      .map((name) => ({ name, time: fs.statSync(path.join(dir, name)).mtimeMs }))
      .sort((a, b) => b.time - a.time)
    const newest = files[0]
    if (newest && Date.now() - newest.time < 5 * 60 * 1000) return
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    fs.writeFileSync(path.join(dir, `${stamp}${MARKDOWN_EXT}`), previousRaw, 'utf8')
    for (const old of files.slice(19)) removeFile(path.join(dir, old.name))
  } catch {
    // 历史快照失败不影响保存
  }
}

export async function restoreVersion(relPath: string, file: string): Promise<DocContent> {
  const rel = normalizeRel(relPath)
  const meta = db().getByPath(rel)
  if (!meta) throw new Error('文档不存在')
  const name = path.basename(file)
  const abs = safeJoin(path.join(getVaultRoot(), HISTORY_DIR, meta.id), name)
  const raw = await fs.promises.readFile(abs, 'utf8')
  const parsed = splitFrontmatter(raw)
  const currentAbs = safeJoin(getVaultRoot(), rel)
  const currentRaw = await fs.promises.readFile(currentAbs, 'utf8')
  snapshotBeforeWrite(currentAbs, meta.id, currentRaw)
  const now = new Date().toISOString()
  const next = buildFile(
    {
      id: meta.id,
      title: meta.title,
      icon: meta.icon,
      created: meta.createdAt,
      updated: now,
      pinned: meta.pinned
    },
    parsed.body
  )
  atomicWrite(currentAbs, next)
  markSelfWrite(currentAbs)
  const stat = await fs.promises.stat(currentAbs)
  const current = parseDocFile(rel, next, stat)
  db().upsert(current.meta, current.body)
  return { meta: current.meta, markdown: current.body }
}

export async function createFolder(parent: string | null): Promise<string> {
  const parentRel = parent ? normalizeRel(parent) : ''
  const parentAbs = parentRel ? safeJoin(getVaultRoot(), parentRel) : getVaultRoot()
  let i = 1
  let name = '新建文件夹'
  while (fs.existsSync(path.join(parentAbs, name))) {
    i += 1
    name = `新建文件夹 ${i}`
  }
  fs.mkdirSync(path.join(parentAbs, name), { recursive: true })
  await scanAndSync()
  return parentRel ? `${parentRel}/${name}` : name
}

export async function renameFolder(relPath: string, nameInput: string): Promise<string> {
  const rel = normalizeRel(relPath)
  const abs = safeJoin(getVaultRoot(), rel)
  const parentAbs = path.dirname(abs)
  const name = sanitizeName(nameInput, '新建文件夹')
  const targetAbs = uniqueDir(parentAbs, name)
  fs.renameSync(abs, targetAbs)
  const targetRel = toPosix(path.relative(getVaultRoot(), targetAbs))
  db().updatePathPrefix(rel, targetRel)
  await scanAndSync()
  if (openDocPath?.startsWith(rel + '/')) openDocPath = targetRel + openDocPath.slice(rel.length)
  return targetRel
}

export async function trashFolder(relPath: string): Promise<void> {
  const rel = normalizeRel(relPath)
  const abs = safeJoin(getVaultRoot(), rel)
  if (!fs.existsSync(abs)) throw new Error('文件夹不存在')
  const name = sanitizeName(path.basename(rel), '文件夹')
  const destDir = path.join(getVaultRoot(), TRASH_DIR, 'folders')
  fs.mkdirSync(destDir, { recursive: true })
  const destAbs = uniqueDir(destDir, `${Date.now()}-${name}`)
  const docs = db().listByPathPrefix(rel)
  fs.renameSync(abs, destAbs)
  markSelfWrite(abs)
  const destRel = toPosix(path.relative(getVaultRoot(), destAbs))
  for (const doc of docs) {
    db().markDeleted(doc.id, `${destRel}/${doc.path.slice(rel.length + 1)}`)
  }
  db().addTrashFolder({ id: `tf_${hashId(destRel)}`, name: path.basename(rel), originalPath: rel, trashPath: destRel })
  await scanAndSync()
}

export async function restoreFolder(id: string): Promise<void> {
  const row = db().getTrashFolder(id)
  if (!row) throw new Error('回收站中找不到该文件夹')
  const trashAbs = safeJoin(getVaultRoot(), row.trash_path)
  const originalAbs = safeJoin(getVaultRoot(), row.original_path)
  fs.mkdirSync(path.dirname(originalAbs), { recursive: true })
  let targetAbs = originalAbs
  if (fs.existsSync(targetAbs)) {
    targetAbs = uniqueDir(path.dirname(originalAbs), path.basename(originalAbs))
  }
  const targetRel = toPosix(path.relative(getVaultRoot(), targetAbs))
  fs.renameSync(trashAbs, targetAbs)
  markSelfWrite(targetAbs)
  const docs = db().listDeletedByPrefix(row.original_path)
  for (const doc of docs) {
    const suffix = doc.path.slice(row.original_path.length)
    db().clearDeleted(doc.id, targetRel + suffix)
  }
  db().removeTrashFolder(id)
  await scanAndSync()
}

export async function deleteFolderForever(id: string): Promise<void> {
  const row = db().getTrashFolder(id)
  if (!row) return
  const trashAbs = safeJoin(getVaultRoot(), row.trash_path)
  removeDir(trashAbs)
  for (const doc of db().listDeletedByPrefix(row.original_path)) db().deleteRow(doc.id)
  db().removeTrashFolder(id)
}

export async function importAsset(input: ImportAssetInput): Promise<ImportedAsset> {
  const rel = normalizeRel(input.docPath)
  const docAbs = safeJoin(getVaultRoot(), rel)
  const assetsDir = assetDirForDoc(docAbs)
  fs.mkdirSync(assetsDir, { recursive: true })
  const bytes = Buffer.from(input.data)
  if (bytes.byteLength > 60 * 1024 * 1024) throw new Error('单个文件不能超过 60MB')
  const rawName = sanitizeName(path.basename(input.name || 'image'), 'image')
  const extFromName = path.extname(rawName).replace('.', '').toLowerCase()
  const ext = /^[a-z0-9]{1,8}$/.test(extFromName) ? extFromName : sniffExt(bytes)
  const stem = rawName.replace(/\.[^.]+$/, '').slice(0, 40) || 'image'
  const filename = `${Date.now().toString(36)}-${stem}.${ext}`
  const abs = path.join(assetsDir, filename)
  fs.writeFileSync(abs, bytes)
  markSelfWrite(abs)
  const relative = `${path.basename(docAbs, MARKDOWN_EXT)}${ASSET_DIR_SUFFIX}/${filename}`
  return { relative, url: toAssetUrl(abs) }
}

export function assetUrl(absPath: string): string {
  if (!isInsideVault(absPath)) throw new Error('资源不在文档库内')
  return toAssetUrl(absPath)
}

export function isInsideVault(absPath: string): boolean {
  const abs = path.resolve(absPath)
  return abs === root || abs.startsWith(root + path.sep)
}

function sniffExt(bytes: Buffer): string {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg'
  if (bytes.length >= 6 && bytes.subarray(0, 6).toString('ascii').startsWith('GIF8')) return 'gif'
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp'
  if (bytes.length >= 5 && bytes.subarray(0, 5).toString('ascii').startsWith('<svg')) return 'svg'
  return 'bin'
}

function uniqueDir(parent: string, base: string): string {
  const safe = sanitizeName(base, '新建文件夹')
  let candidate = path.join(parent, safe)
  let i = 2
  while (fs.existsSync(candidate)) {
    candidate = path.join(parent, `${safe} ${i}`)
    i += 1
  }
  return candidate
}

function removeFile(file: string): void {
  try {
    fs.unlinkSync(file)
  } catch {
    // ignore
  }
}

function removeDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch {
    // ignore
  }
}

export function searchDocs(query: string) {
  return db().search(query)
}

export function quickSearchDocs(query: string) {
  return db().quickSearch(query)
}

export function vaultStats() {
  return db().stats()
}

export function getIndex(): IndexDb {
  return db()
}

export function getAbsolutePath(rel: string): string {
  return safeJoin(getVaultRoot(), normalizeRel(rel))
}

export function getVaultPathFromSettings(): string {
  return getSettings().vaultPath
}
