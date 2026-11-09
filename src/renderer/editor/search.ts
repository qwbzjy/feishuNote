import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'
import type { Editor } from '@tiptap/core'

export interface FindMatch {
  from: number
  to: number
}

export interface FindState {
  query: string
  active: number
  matches: FindMatch[]
}

export const findPluginKey = new PluginKey<FindState>('fn-find')

function findMatches(doc: PMNode, query: string): FindMatch[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const matches: FindMatch[] = []
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    const haystack = node.text.toLowerCase()
    let index = haystack.indexOf(q)
    while (index !== -1) {
      matches.push({ from: pos + index, to: pos + index + q.length })
      index = haystack.indexOf(q, index + q.length)
    }
  })
  return matches
}

export const FindHighlight = Extension.create({
  name: 'findHighlight',

  addProseMirrorPlugins() {
    return [
      new Plugin<FindState>({
        key: findPluginKey,
        state: {
          init: () => ({ query: '', active: 0, matches: [] }),
          apply: (tr, previous) => {
            const meta = tr.getMeta(findPluginKey) as { query?: string; active?: number } | undefined
            if (meta) {
              const query = meta.query ?? previous.query
              const active = meta.active ?? 0
              return { query, active, matches: findMatches(tr.doc, query) }
            }
            if (tr.docChanged && previous.query) {
              return { ...previous, matches: findMatches(tr.doc, previous.query) }
            }
            return previous
          }
        },
        props: {
          decorations(state) {
            const find = findPluginKey.getState(state)
            if (!find || !find.query || !find.matches.length) return null
            const decorations = find.matches.map((match, index) =>
              Decoration.inline(match.from, match.to, {
                class: index === find.active ? 'fn-search-match fn-search-current' : 'fn-search-match'
              })
            )
            return DecorationSet.create(state.doc, decorations)
          }
        }
      })
    ]
  }
})

export function applyFind(editor: Editor, query: string, active = 0): FindState {
  editor.view.dispatch(editor.state.tr.setMeta(findPluginKey, { query, active }))
  const state = findPluginKey.getState(editor.state)
  return state ?? { query, active, matches: [] }
}

export function selectFindMatch(editor: Editor, match: FindMatch): void {
  const selection = TextSelection.create(editor.state.doc, match.from, match.to)
  editor.view.dispatch(editor.state.tr.setSelection(selection).scrollIntoView())
}
