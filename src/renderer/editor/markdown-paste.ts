const RICH_HTML_RE = /<(p|h[1-6]|ul|ol|li|table|thead|tbody|tr|td|th|pre|code|blockquote|strong|em|img|a)\b/i

const BLOCK_PATTERNS = [
  /^#{1,6}\s+\S/m,
  /^\s*(?:[-*+]|\d+\.)\s+\S/m,
  /^>\s+\S/m,
  /^```/m,
  /^\|.+\|/m,
  /^<details\b/im
]

const INLINE_PATTERNS = [
  /\*\*[^*\n]+\*\*/,
  /__[^_\n]+__/,
  /`[^`\n]+`/,
  /~~[^~\n]+~~/,
  /==[^=\n]+==/,
  /!?\[[^\]]*\]\([^)\s]+\)/
]

/**
 * 判断剪贴板纯文本是否值得按 Markdown 富文本插入。
 * 存在真正的富文本 HTML 时交给 ProseMirror 默认粘贴，避免破坏网页复制。
 */
export function looksLikeMarkdown(text: string, html = ''): boolean {
  if (html && RICH_HTML_RE.test(html)) return false
  const trimmed = text.trim()
  if (!trimmed) return false
  if (/^---\r?\n[\s\S]*?\r?\n---/.test(trimmed)) return true

  const blockSignals = BLOCK_PATTERNS.reduce((count, pattern) => count + (pattern.test(trimmed) ? 1 : 0), 0)
  const inlineSignals = INLINE_PATTERNS.reduce((count, pattern) => count + (pattern.test(trimmed) ? 1 : 0), 0)
  const multiline = /\r?\n/.test(trimmed)

  if (multiline) return blockSignals > 0 || inlineSignals >= 2
  if (blockSignals > 0) return true
  if (inlineSignals >= 2) return true
  if (inlineSignals === 1) {
    // 单行粘贴时，只有整段都是 Markdown 时才自动转换，避免把普通句子里的 * 当成格式
    return INLINE_PATTERNS.some((pattern) => {
      const match = trimmed.match(pattern)
      return match !== null && match[0].length >= trimmed.length - 2
    })
  }
  return false
}

export function stripFrontmatter(text: string): string {
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
}
