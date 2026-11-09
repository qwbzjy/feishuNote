export type CalloutVariant = 'note' | 'tip' | 'warning' | 'caution' | 'important'

export const CALLOUT_VARIANTS: CalloutVariant[] = ['note', 'tip', 'warning', 'caution', 'important']

const MARKER_TO_VARIANT: Record<string, CalloutVariant> = {
  NOTE: 'note',
  TIP: 'tip',
  WARNING: 'warning',
  CAUTION: 'caution',
  IMPORTANT: 'important'
}

const VARIANT_TO_MARKER: Record<CalloutVariant, string> = {
  note: 'NOTE',
  tip: 'TIP',
  warning: 'WARNING',
  caution: 'CAUTION',
  important: 'IMPORTANT'
}

/**
 * 自定义块的属性序列化：使用 URI 编码，避免标题中的引号 / 花括号破坏 `:::block {key="value"}` 语法。
 */
export function encodeAttributes(attrs: Record<string, unknown>): string {
  return Object.entries(attrs)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}="${encodeURIComponent(String(value))}"`)
    .join(' ')
}

export function decodeAttributes(input: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const match of input.matchAll(/([A-Za-z][\w-]*)="([^"]*)"/g)) {
    try {
      out[match[1]] = decodeURIComponent(match[2])
    } catch {
      out[match[1]] = match[2]
    }
  }
  return out
}

function isFence(line: string): boolean {
  return /^\s{0,3}(```+|~~~+)/.test(line)
}

function isBlockFence(line: string): { name: string; attrs: string } | null {
  const match = /^:::([\w-]+)(?:\s+\{([^}]*)\})?\s*$/.exec(line)
  if (!match) return null
  return { name: match[1], attrs: match[2] ?? '' }
}

/** 把便于阅读的 Markdown（Obsidian 高亮块 / HTML details）转换为编辑器内部语法。 */
export function portableToInternal(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let inCode = false
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    if (isFence(line)) {
      inCode = !inCode
      out.push(line)
      i += 1
      continue
    }
    if (inCode) {
      out.push(line)
      i += 1
      continue
    }

    const callout = /^\s{0,3}>\s*\[!(NOTE|TIP|WARNING|CAUTION|IMPORTANT)\]\s*(.*)$/i.exec(line)
    if (callout) {
      const variant = MARKER_TO_VARIANT[callout[1].toUpperCase()] ?? 'note'
      const title = callout[2].trim()
      const inner: string[] = []
      let j = i + 1
      let blankRun: string[] = []
      while (j < lines.length) {
        const next = lines[j]
        const quote = /^\s{0,3}>\s?(.*)$/.exec(next)
        if (quote) {
          if (blankRun.length) {
            inner.push(...blankRun)
            blankRun = []
          }
          inner.push(quote[1])
          j += 1
          continue
        }
        if (next.trim() === '') {
          blankRun.push('')
          j += 1
          continue
        }
        break
      }
      // 只把确实位于引用块内的空行算进去
      const attrs = encodeAttributes({ variant, title })
      out.push(`:::callout {${attrs}}`)
      out.push(...trimBlankEdges(inner))
      out.push(':::')
      out.push('')
      i = j
      continue
    }

    if (/^\s*<details\b/i.test(line)) {
      let j = i
      const block: string[] = []
      while (j < lines.length) {
        block.push(lines[j])
        if (/<\/details>\s*$/i.test(lines[j])) break
        j += 1
      }
      const joined = block.join('\n')
      const summary = /<summary[^>]*>([\s\S]*?)<\/summary>/i.exec(joined)
      const title = summary ? stripTags(summary[1]).trim() : ''
      let rest = joined
      if (summary) rest = joined.slice(summary.index + summary[0].length)
      rest = rest.replace(/<\/details>\s*$/i, '').trim()
      out.push(`:::toggle {${encodeAttributes({ title: title || '折叠块' })}}`)
      if (rest) out.push(rest)
      out.push(':::')
      out.push('')
      i = j + 1
      continue
    }

    out.push(line)
    i += 1
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n')
}

/** 把编辑器内部语法还原成可移植的 Markdown（Obsidian 高亮块 / HTML details / 分栏围栏）。 */
export function internalToPortable(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  return walk(lines, 0, lines.length).join('\n').replace(/\n{3,}/g, '\n\n')
}

function walk(lines: string[], start: number, end: number): string[] {
  const out: string[] = []
  let i = start
  while (i < end) {
    const fence = isBlockFence(lines[i])
    if (!fence) {
      out.push(lines[i])
      i += 1
      continue
    }
    const close = findClose(lines, i, end)
    if (close === -1) {
      out.push(lines[i])
      i += 1
      continue
    }
    const inner = walk(lines, i + 1, close)
    const attrs = decodeAttributes(fence.attrs)
    if (fence.name === 'callout') {
      out.push(...calloutToPortable(attrs, inner))
    } else if (fence.name === 'toggle') {
      out.push(...toggleToPortable(attrs, inner))
    } else {
      out.push(lines[i], ...inner, ':::')
    }
    i = close + 1
  }
  return out
}

function findClose(lines: string[], openIndex: number, end: number): number {
  let depth = 1
  let inCode = false
  for (let i = openIndex + 1; i < end; i += 1) {
    const line = lines[i]
    if (isFence(line)) {
      inCode = !inCode
      continue
    }
    if (inCode) continue
    if (/^:::\s*$/.test(line)) {
      depth -= 1
      if (depth === 0) return i
      continue
    }
    if (isBlockFence(line)) depth += 1
  }
  return -1
}

function calloutToPortable(attrs: Record<string, string>, inner: string[]): string[] {
  const variant = (attrs.variant as CalloutVariant) in VARIANT_TO_MARKER ? (attrs.variant as CalloutVariant) : 'note'
  const marker = VARIANT_TO_MARKER[variant]
  const title = attrs.title?.trim() ?? ''
  const out: string[] = []
  out.push(title ? `> [!${marker}] ${title}` : `> [!${marker}]`)
  for (const line of trimBlankEdges(inner)) {
    out.push(line.trim() === '' ? '>' : `> ${line}`)
  }
  out.push('')
  return out
}

function toggleToPortable(attrs: Record<string, string>, inner: string[]): string[] {
  const title = attrs.title?.trim() || '折叠块'
  const out = ['<details>', `<summary>${title}</summary>`, '']
  out.push(...trimBlankEdges(inner))
  out.push('', '</details>', '')
  return out
}

function trimBlankEdges(lines: string[]): string[] {
  let start = 0
  let end = lines.length
  while (start < end && lines[start].trim() === '') start += 1
  while (end > start && lines[end - 1].trim() === '') end -= 1
  return lines.slice(start, end)
}

function stripTags(input: string): string {
  return input
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
}

export interface PortableStats {
  callouts: number
  toggles: number
}

export function inspectPortable(markdown: string): PortableStats {
  let callouts = 0
  let toggles = 0
  for (const match of markdown.matchAll(/^:::(callout|toggle)\b/gm)) {
    if (match[1] === 'callout') callouts += 1
    else toggles += 1
  }
  return { callouts, toggles }
}
