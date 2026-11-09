import type { JSONContent } from '@tiptap/core'

const EXTERNAL_RE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function toPosixPath(input: string): string {
  return input.replace(/\\/g, '/').replace(/\/+$/, '')
}

function dirname(relPath: string): string {
  const index = relPath.lastIndexOf('/')
  return index === -1 ? '' : relPath.slice(0, index)
}

function normalizeSegments(input: string): string {
  const out: string[] = []
  for (const segment of input.split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      out.pop()
      continue
    }
    out.push(segment)
  }
  return out.join('/')
}

export function resolveAssetSrc(vaultPath: string, docPath: string, src: string): string {
  if (!src || EXTERNAL_RE.test(src) || src.startsWith('data:')) return src
  const docDir = dirname(docPath)
  const relative = safeDecode(src)
  const fromRoot = relative.startsWith('/') ? relative.slice(1) : `${docDir}/${relative}`
  const normalized = normalizeSegments(fromRoot)
  if (!normalized) return src
  const abs = `${toPosixPath(vaultPath)}/${normalized}`
  return `fnasset://local/${encodeURIComponent(abs)}`
}

export function resolveJsonAssets(json: JSONContent, vaultPath: string, docPath: string): JSONContent {
  const clone = (node: JSONContent): JSONContent => {
    const next: JSONContent = { ...node }
    if (next.type === 'image' && typeof next.attrs?.src === 'string') {
      next.attrs = { ...next.attrs, src: resolveAssetSrc(vaultPath, docPath, next.attrs.src) }
    }
    if (Array.isArray(next.content)) next.content = next.content.map(clone)
    return next
  }
  return clone(json)
}

function relativeFrom(rootDir: string, target: string): string {
  const from = rootDir ? rootDir.split('/') : []
  const to = target.split('/')
  let common = 0
  while (common < from.length && common < to.length && from[common] === to[common]) common += 1
  const up = new Array(from.length - common).fill('..')
  return [...up, ...to.slice(common)].join('/')
}

export function relativizeMarkdown(markdown: string, vaultPath: string, docPath: string): string {
  const vault = toPosixPath(vaultPath)
  const prefix = `${vault}/`
  const docDir = dirname(docPath)
  return markdown.replace(/fnasset:\/\/local\/([^)\s"'<>\]]+)/g, (whole, encoded: string) => {
    let abs: string
    try {
      abs = decodeURIComponent(encoded).replace(/\\/g, '/')
    } catch {
      return whole
    }
    if (!abs.toLowerCase().startsWith(prefix.toLowerCase())) return whole
    const relative = relativeFrom(docDir, abs.slice(prefix.length))
    return encodeURI(relative)
  })
}

export function extractOutline(doc: { descendants: (fn: (node: { type: { name: string }; attrs: Record<string, unknown>; textContent: string }, pos: number) => void) => void }): Array<{
  level: number
  text: string
  pos: number
}> {
  const items: Array<{ level: number; text: string; pos: number }> = []
  doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      items.push({ level: Number(node.attrs.level) || 1, text: node.textContent.trim(), pos })
    }
  })
  return items
}

/** 文档重命名 / 移动后，把编辑器里已解析的资源地址同步到新位置。 */
export function rebaseAssetUrl(src: string, vaultPath: string, oldDocPath: string, newDocPath: string): string {
  if (!src.startsWith('fnasset://local/')) return src
  let abs: string
  try {
    abs = decodeURIComponent(src.slice('fnasset://local/'.length)).replace(/\\/g, '/')
  } catch {
    return src
  }
  const vault = toPosixPath(vaultPath)
  const oldAssets = assetsDirAbs(vault, oldDocPath)
  const newAssets = assetsDirAbs(vault, newDocPath)
  if (!oldAssets || !newAssets) return src
  if (abs.toLowerCase() === oldAssets.toLowerCase() || abs.toLowerCase().startsWith(`${oldAssets.toLowerCase()}/`)) {
    return `fnasset://local/${encodeURIComponent(newAssets + abs.slice(oldAssets.length))}`
  }
  return src
}

function assetsDirAbs(vault: string, docPath: string): string | null {
  const normalized = docPath.replace(/\\/g, '/')
  const base = normalized.split('/').pop() ?? ''
  const stem = base.replace(/\.md$/i, '')
  if (!stem) return null
  const dir = normalized.includes('/') ? normalized.slice(0, normalized.lastIndexOf('/')) : ''
  return `${vault}/${dir ? `${dir}/` : ''}${stem}.assets`
}
