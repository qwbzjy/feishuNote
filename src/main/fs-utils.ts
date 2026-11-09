import { createHash } from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs'

export const MARKDOWN_EXT = '.md'
export const ASSET_DIR_SUFFIX = '.assets'

const IGNORED_DIRS = new Set(['.feishunote', '.trash', '.history', '.git', 'node_modules'])

export function isIgnoredDirName(name: string): boolean {
  return IGNORED_DIRS.has(name) || name.startsWith('.') || name.endsWith(ASSET_DIR_SUFFIX)
}

export function toPosix(p: string): string {
  return p.split(path.sep).join('/')
}

export function normalizeRel(input: string): string {
  const rel = toPosix(input).replace(/^\/+/, '').replace(/\/+$/, '')
  if (!rel) return ''
  const parts = rel.split('/').filter((p) => p && p !== '.')
  if (parts.some((p) => p === '..')) throw new Error('非法路径')
  return parts.join('/')
}

export function safeJoin(root: string, rel: string): string {
  const normalized = normalizeRel(rel)
  const abs = path.resolve(root, normalized)
  const rootAbs = path.resolve(root)
  const rootWithSep = rootAbs.endsWith(path.sep) ? rootAbs : rootAbs + path.sep
  const same = process.platform === 'win32' ? abs.toLowerCase() === rootAbs.toLowerCase() : abs === rootAbs
  const inside =
    process.platform === 'win32'
      ? abs.toLowerCase().startsWith(rootWithSep.toLowerCase())
      : abs.startsWith(rootWithSep)
  if (!same && !inside) throw new Error('路径越界')
  return abs
}

export function isInside(root: string, target: string): boolean {
  const rootAbs = path.resolve(root)
  const targetAbs = path.resolve(target)
  return targetAbs === rootAbs || targetAbs.startsWith(rootAbs + path.sep)
}

export function hashId(input: string): string {
  return createHash('sha1').update(input).digest('hex').slice(0, 12)
}

export function sanitizeName(input: string, fallback = '未命名'): string {
  const cleaned = input
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .replace(/[. ]+$/, '')
    .trim()
    .slice(0, 80)
  return cleaned || fallback
}

export function uniquePath(dir: string, base: string, ext = MARKDOWN_EXT): string {
  const safeBase = sanitizeName(base)
  let candidate = path.join(dir, `${safeBase}${ext}`)
  let i = 2
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${safeBase} ${i}${ext}`)
    i += 1
  }
  return candidate
}

export function atomicWrite(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`)
  fs.writeFileSync(tmp, content, 'utf8')
  fs.renameSync(tmp, file)
}

export function countWords(text: string): number {
  if (!text) return 0
  const plain = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_~\-|]/g, ' ')
  const cjk = (plain.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g) ?? []).length
  const words = (plain.replace(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g, ' ').match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) ?? []).length
  return cjk + words
}

export function makeExcerpt(text: string, limit = 160): string {
  const plain = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^---[\s\S]*?---/m, ' ')
    .replace(/[#>*_~`|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return plain.slice(0, limit)
}

export function assetDirForDoc(docAbsPath: string): string {
  const dir = path.dirname(docAbsPath)
  const base = path.basename(docAbsPath, MARKDOWN_EXT)
  return path.join(dir, `${base}${ASSET_DIR_SUFFIX}`)
}

export function assetRelativePrefix(docAbsPath: string): string {
  return `${path.basename(docAbsPath, MARKDOWN_EXT)}${ASSET_DIR_SUFFIX}`
}

export function toAssetUrl(absPath: string): string {
  return `fnasset://local/${encodeURIComponent(absPath)}`
}

export function fromAssetUrl(url: string): string | null {
  if (!url.startsWith('fnasset://local/')) return null
  try {
    return decodeURIComponent(url.slice('fnasset://local/'.length))
  } catch {
    return null
  }
}
