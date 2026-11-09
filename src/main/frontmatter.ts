import yaml from 'js-yaml'

export interface DocFrontmatter {
  id?: string
  title?: string
  icon?: string | null
  created?: string
  updated?: string
  pinned?: boolean
  tags?: string[]
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

export function splitFrontmatter(raw: string): { data: DocFrontmatter; body: string } {
  const match = FRONTMATTER_RE.exec(raw)
  if (!match) return { data: {}, body: raw }
  let data: DocFrontmatter = {}
  try {
    const parsed = yaml.load(match[1]) as Record<string, unknown> | null
    if (parsed && typeof parsed === 'object') {
      data = {
        id: typeof parsed.id === 'string' ? parsed.id : undefined,
        title: typeof parsed.title === 'string' ? parsed.title : undefined,
        icon: typeof parsed.icon === 'string' ? parsed.icon : parsed.icon === null ? null : undefined,
        created: toIso(parsed.created),
        updated: toIso(parsed.updated),
        pinned: typeof parsed.pinned === 'boolean' ? parsed.pinned : undefined,
        tags: Array.isArray(parsed.tags) ? parsed.tags.filter((t): t is string => typeof t === 'string') : undefined
      }
    }
  } catch {
    // frontmatter 损坏时按纯正文处理，避免丢内容
    return { data: {}, body: raw }
  }
  return { data, body: raw.slice(match[0].length) }
}

function toIso(value: unknown): string | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString()
  if (typeof value === 'string' && value.trim()) return value
  return undefined
}

export function buildFile(data: DocFrontmatter, body: string): string {
  const clean: Record<string, unknown> = {}
  if (data.id) clean.id = data.id
  if (data.title) clean.title = data.title
  if (data.icon) clean.icon = data.icon
  if (data.created) clean.created = data.created
  if (data.updated) clean.updated = data.updated
  if (data.pinned) clean.pinned = true
  if (data.tags?.length) clean.tags = data.tags

  const head = Object.keys(clean).length
    ? `---\n${yaml.dump(clean, { lineWidth: 0, noRefs: true, quotingType: '"' })}---\n`
    : ''
  const normalizedBody = body.replace(/\r\n/g, '\n').replace(/^\n+/, '')
  return `${head}${normalizedBody}${normalizedBody.endsWith('\n') ? '' : '\n'}`
}
