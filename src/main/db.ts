import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import type { DocMeta, SearchHit, TrashedDoc } from '@shared/types'

interface DocRow {
  id: string
  path: string
  title: string
  icon: string | null
  pinned: number
  created_at: string
  updated_at: string
  word_count: number
  excerpt: string
  body: string
  deleted_at: string | null
  trash_path: string | null
  original_path: string | null
}

interface FolderRow {
  id: string
  name: string
  original_path: string
  trash_path: string
  deleted_at: string
}

function rowToMeta(row: DocRow): DocMeta {
  return {
    id: row.id,
    path: row.path,
    title: row.title,
    icon: row.icon,
    pinned: Boolean(row.pinned),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    wordCount: row.word_count,
    excerpt: row.excerpt
  }
}

export class IndexDb {
  private db: Database.Database
  private ftsReady = false

  constructor(file: string) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    this.db = new Database(file)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')
    this.db.pragma('busy_timeout = 4000')
    this.migrate()
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS docs (
        id TEXT PRIMARY KEY,
        path TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        icon TEXT,
        pinned INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        word_count INTEGER NOT NULL DEFAULT 0,
        excerpt TEXT NOT NULL DEFAULT '',
        body TEXT NOT NULL DEFAULT '',
        deleted_at TEXT,
        trash_path TEXT,
        original_path TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_docs_updated ON docs(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_docs_deleted ON docs(deleted_at);
      CREATE TABLE IF NOT EXISTS recent (
        id TEXT PRIMARY KEY,
        opened_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS trash_folders (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        original_path TEXT NOT NULL UNIQUE,
        trash_path TEXT NOT NULL,
        deleted_at TEXT NOT NULL
      );
    `)
    try {
      this.db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS docs_fts USING fts5(id UNINDEXED, title, body, tokenize='trigram');`)
      this.ftsReady = true
    } catch {
      this.ftsReady = false
    }
  }

  close(): void {
    this.db.close()
  }

  get hasFts(): boolean {
    return this.ftsReady
  }

  private ftsUpsert(row: DocRow): void {
    if (!this.ftsReady) return
    this.db.prepare(`DELETE FROM docs_fts WHERE id = ?`).run(row.id)
    this.db.prepare(`INSERT INTO docs_fts (id, title, body) VALUES (?, ?, ?)`).run(row.id, row.title, row.body)
  }

  private ftsDelete(id: string): void {
    if (!this.ftsReady) return
    this.db.prepare(`DELETE FROM docs_fts WHERE id = ?`).run(id)
  }

  upsert(meta: DocMeta, body: string, deletedAt: string | null = null, trashPath: string | null = null, originalPath: string | null = null): void {
    const tx = this.db.transaction(() => {
      const samePath = this.db.prepare(`SELECT id FROM docs WHERE path = ?`).get(meta.path) as { id: string } | undefined
      if (samePath && samePath.id !== meta.id) {
        this.ftsDelete(samePath.id)
        this.db.prepare(`DELETE FROM recent WHERE id = ?`).run(samePath.id)
        this.db.prepare(`DELETE FROM docs WHERE id = ?`).run(samePath.id)
      }
      this.db
        .prepare(
          `INSERT INTO docs (id, path, title, icon, pinned, created_at, updated_at, word_count, excerpt, body, deleted_at, trash_path, original_path)
           VALUES (@id, @path, @title, @icon, @pinned, @createdAt, @updatedAt, @wordCount, @excerpt, @body, @deletedAt, @trashPath, @originalPath)
           ON CONFLICT(id) DO UPDATE SET
             path = excluded.path,
             title = excluded.title,
             icon = excluded.icon,
             pinned = excluded.pinned,
             created_at = excluded.created_at,
             updated_at = excluded.updated_at,
             word_count = excluded.word_count,
             excerpt = excluded.excerpt,
             body = excluded.body,
             deleted_at = excluded.deleted_at,
             trash_path = excluded.trash_path,
             original_path = excluded.original_path`
        )
        .run({
          id: meta.id,
          path: meta.path,
          title: meta.title,
          icon: meta.icon,
          pinned: meta.pinned ? 1 : 0,
          createdAt: meta.createdAt,
          updatedAt: meta.updatedAt,
          wordCount: meta.wordCount,
          excerpt: meta.excerpt,
          body,
          deletedAt,
          trashPath,
          originalPath
        })
      this.ftsUpsert({
        id: meta.id,
        path: meta.path,
        title: meta.title,
        icon: meta.icon,
        pinned: meta.pinned ? 1 : 0,
        created_at: meta.createdAt,
        updated_at: meta.updatedAt,
        word_count: meta.wordCount,
        excerpt: meta.excerpt,
        body,
        deleted_at: deletedAt,
        trash_path: trashPath,
        original_path: originalPath
      })
    })
    tx()
  }

  touchRecent(id: string): void {
    this.db
      .prepare(`INSERT INTO recent (id, opened_at) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET opened_at = excluded.opened_at`)
      .run(id, new Date().toISOString())
  }

  recent(limit = 12): DocMeta[] {
    const rows = this.db
      .prepare(
        `SELECT d.* FROM recent r JOIN docs d ON d.id = r.id
         WHERE d.deleted_at IS NULL ORDER BY r.opened_at DESC LIMIT ?`
      )
      .all(limit) as DocRow[]
    if (rows.length) return rows.map(rowToMeta)
    return this.latest(limit)
  }

  latest(limit = 12): DocMeta[] {
    const rows = this.db
      .prepare(`SELECT * FROM docs WHERE deleted_at IS NULL ORDER BY pinned DESC, updated_at DESC LIMIT ?`)
      .all(limit) as DocRow[]
    return rows.map(rowToMeta)
  }

  getById(id: string): DocMeta | null {
    const row = this.db.prepare(`SELECT * FROM docs WHERE id = ?`).get(id) as DocRow | undefined
    return row ? rowToMeta(row) : null
  }

  getByPath(p: string): DocMeta | null {
    const row = this.db.prepare(`SELECT * FROM docs WHERE path = ? AND deleted_at IS NULL`).get(p) as DocRow | undefined
    return row ? rowToMeta(row) : null
  }

  getBody(id: string): string {
    const row = this.db.prepare(`SELECT body FROM docs WHERE id = ?`).get(id) as { body: string } | undefined
    return row?.body ?? ''
  }

  getTrashed(id: string): { meta: DocMeta; trashPath: string; originalPath: string } | null {
    const row = this.db.prepare(`SELECT * FROM docs WHERE id = ? AND deleted_at IS NOT NULL`).get(id) as DocRow | undefined
    if (!row || !row.trash_path || !row.original_path) return null
    return { meta: rowToMeta(row), trashPath: row.trash_path, originalPath: row.original_path }
  }

  listByPathPrefix(prefix: string): DocMeta[] {
    const rows = this.db
      .prepare(`SELECT * FROM docs WHERE deleted_at IS NULL AND (path = ? OR path LIKE ?)`)
      .all(prefix, `${prefix}/%`) as DocRow[]
    return rows.map(rowToMeta)
  }

  listDeletedByPrefix(prefix: string): DocMeta[] {
    const rows = this.db
      .prepare(`SELECT * FROM docs WHERE deleted_at IS NOT NULL AND original_path LIKE ?`)
      .all(`${prefix}/%`) as DocRow[]
    return rows.map(rowToMeta)
  }

  listActive(): DocMeta[] {
    const rows = this.db.prepare(`SELECT * FROM docs WHERE deleted_at IS NULL ORDER BY updated_at DESC`).all() as DocRow[]
    return rows.map(rowToMeta)
  }

  reconcile(activePaths: Set<string>): void {
    const rows = this.db.prepare(`SELECT id, path FROM docs WHERE deleted_at IS NULL`).all() as { id: string; path: string }[]
    const tx = this.db.transaction(() => {
      for (const row of rows) {
        if (!activePaths.has(row.path)) {
          this.ftsDelete(row.id)
          this.db.prepare(`DELETE FROM recent WHERE id = ?`).run(row.id)
          this.db.prepare(`DELETE FROM docs WHERE id = ?`).run(row.id)
        }
      }
    })
    tx()
  }

  markDeleted(id: string, trashPath: string): void {
    const row = this.db.prepare(`SELECT * FROM docs WHERE id = ?`).get(id) as DocRow | undefined
    if (!row) return
    const original = row.original_path ?? row.path
    this.db
      .prepare(`UPDATE docs SET path = ?, trash_path = ?, original_path = ?, deleted_at = ? WHERE id = ?`)
      .run(trashPath, trashPath, original, new Date().toISOString(), id)
    this.db.prepare(`DELETE FROM recent WHERE id = ?`).run(id)
    this.ftsDelete(id)
  }

  clearDeleted(id: string, newPath: string): void {
    this.db
      .prepare(`UPDATE docs SET path = ?, deleted_at = NULL, trash_path = NULL, original_path = NULL WHERE id = ?`)
      .run(newPath, id)
    const row = this.db.prepare(`SELECT * FROM docs WHERE id = ?`).get(id) as DocRow | undefined
    if (row) this.ftsUpsert(row)
  }

  deleteRow(id: string): void {
    this.ftsDelete(id)
    this.db.prepare(`DELETE FROM recent WHERE id = ?`).run(id)
    this.db.prepare(`DELETE FROM docs WHERE id = ?`).run(id)
  }

  trashedDocs(): TrashedDoc[] {
    const rows = this.db.prepare(`SELECT * FROM docs WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC`).all() as DocRow[]
    return rows.map((row) => ({
      kind: 'doc' as const,
      id: row.id,
      title: row.title,
      icon: row.icon,
      originalPath: row.original_path ?? row.path,
      deletedAt: row.deleted_at ?? '',
      wordCount: row.word_count
    }))
  }

  addTrashFolder(folder: { id: string; name: string; originalPath: string; trashPath: string }): void {
    this.db
      .prepare(`INSERT OR REPLACE INTO trash_folders (id, name, original_path, trash_path, deleted_at) VALUES (?, ?, ?, ?, ?)`)
      .run(folder.id, folder.name, folder.originalPath, folder.trashPath, new Date().toISOString())
  }

  trashedFolders(): TrashedDoc[] {
    const rows = this.db.prepare(`SELECT * FROM trash_folders ORDER BY deleted_at DESC`).all() as FolderRow[]
    return rows.map((row) => ({
      kind: 'folder' as const,
      id: row.id,
      title: row.name,
      icon: '📁',
      originalPath: row.original_path,
      deletedAt: row.deleted_at,
      wordCount: 0
    }))
  }

  getTrashFolder(id: string): FolderRow | null {
    return (this.db.prepare(`SELECT * FROM trash_folders WHERE id = ?`).get(id) as FolderRow | undefined) ?? null
  }

  removeTrashFolder(id: string): void {
    this.db.prepare(`DELETE FROM trash_folders WHERE id = ?`).run(id)
  }

  clearDeletedByPrefix(originalPrefix: string): void {    const rows = this.db.prepare(`SELECT * FROM docs WHERE deleted_at IS NOT NULL`).all() as DocRow[]
    const tx = this.db.transaction(() => {
      for (const row of rows) {
        const original = row.original_path ?? ''
        if (original === originalPrefix || original.startsWith(originalPrefix + '/')) {
          this.db
            .prepare(`UPDATE docs SET path = original_path, deleted_at = NULL, trash_path = NULL, original_path = NULL WHERE id = ?`)
            .run(row.id)
          this.ftsUpsert({ ...row, path: original, deleted_at: null, trash_path: null, original_path: null })
        }
      }
    })
    tx()
  }

  updatePathPrefix(oldPrefix: string, newPrefix: string): void {
    const rows = this.db.prepare(`SELECT id, path FROM docs WHERE deleted_at IS NULL`).all() as { id: string; path: string }[]
    const tx = this.db.transaction(() => {
      for (const row of rows) {
        if (row.path === oldPrefix || row.path.startsWith(oldPrefix + '/')) {
          const next = newPrefix + row.path.slice(oldPrefix.length)
          this.db.prepare(`UPDATE docs SET path = ? WHERE id = ?`).run(next, row.id)
        }
      }
    })
    tx()
  }

  setPinned(id: string, pinned: boolean): void {
    this.db.prepare(`UPDATE docs SET pinned = ? WHERE id = ?`).run(pinned ? 1 : 0, id)
  }

  search(query: string, limit = 40): SearchHit[] {
    const q = query.trim()
    if (q.length < 2) return []
    if (this.ftsReady && q.length >= 3 && !/["*()^:]/.test(q)) {
      try {
        const phrase = `"${q.replace(/"/g, '""')}"`
        const rows = this.db
          .prepare(
            `SELECT d.*, snippet(docs_fts, 2, char(1), char(2), '…', 14) AS snip
             FROM docs_fts JOIN docs d ON d.id = docs_fts.id
             WHERE docs_fts MATCH ? AND d.deleted_at IS NULL
             ORDER BY rank LIMIT ?`
          )
          .all(phrase, limit) as (DocRow & { snip: string })[]
        if (rows.length) {
          return rows.map((row) => ({ meta: rowToMeta(row), snippet: cleanSnippet(row.snip || row.excerpt) }))
        }
      } catch {
        // 落到 LIKE
      }
    }
    const like = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`
    const rows = this.db
      .prepare(
        `SELECT * FROM docs WHERE deleted_at IS NULL AND (title LIKE ? ESCAPE '\\' OR body LIKE ? ESCAPE '\\')
         ORDER BY pinned DESC, updated_at DESC LIMIT ?`
      )
      .all(like, like, limit) as DocRow[]
    return rows.map((row) => ({ meta: rowToMeta(row), snippet: cleanSnippet(makeSnippet(row.body, q)) }))
  }

  quickSearch(query: string, limit = 20): DocMeta[] {
    const q = query.trim()
    if (!q) return this.latest(limit)
    const like = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`
    const rows = this.db
      .prepare(
        `SELECT * FROM docs WHERE deleted_at IS NULL AND title LIKE ? ESCAPE '\\'
         ORDER BY pinned DESC, updated_at DESC LIMIT ?`
      )
      .all(like, limit) as DocRow[]
    return rows.map(rowToMeta)
  }

  stats(): { docs: number; words: number } {
    const row = this.db.prepare(`SELECT COUNT(*) AS c, COALESCE(SUM(word_count),0) AS w FROM docs WHERE deleted_at IS NULL`).get() as {
      c: number
      w: number
    }
    return { docs: row.c, words: row.w }
  }
}


function cleanSnippet(text: string): string {
  return text
    .replace(/```[\w-]*\n?/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/(^|\s)>\s?/g, '$1')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/\|/g, ' ')
    .replace(/[*_~`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function makeSnippet(body: string, query: string): string {
  const lower = body.toLowerCase()
  const idx = lower.indexOf(query.toLowerCase())
  if (idx < 0) return body.slice(0, 140)
  const start = Math.max(0, idx - 40)
  const end = Math.min(body.length, idx + query.length + 80)
  return `${start > 0 ? '…' : ''}${body.slice(start, idx)}\u0001${body.slice(idx, idx + query.length)}\u0002${body.slice(idx + query.length, end)}${end < body.length ? '…' : ''}`.replace(/\s+/g, ' ')
}
