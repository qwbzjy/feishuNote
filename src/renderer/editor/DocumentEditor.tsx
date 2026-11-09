import type { DocContent, DocMeta, AppSettings } from '@shared/types'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import { DragHandle } from '@tiptap/extension-drag-handle-react'
import { GripVertical, Plus } from 'lucide-react'
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from 'react'
import {
  internalToPortable,
  portableToInternal
} from '@shared/portable-markdown'
import { createExtensions } from './extensions'
import { api } from '../lib/api'
import { countWords } from '../lib/format'
import { extractOutline, rebaseAssetUrl, relativizeMarkdown, resolveJsonAssets } from '../lib/assets'
import { BubbleToolbar } from './BubbleToolbar'
import { TableToolbar } from './TableToolbar'
import { FindBar } from './FindBar'
import { applyFind, selectFindMatch } from './search'
import { looksLikeMarkdown, stripFrontmatter } from './markdown-paste'
import { BlockMenu } from './block/BlockMenu'
import { buildBlockItems, type BlockItem } from './block/blockItems'
import type { Node as PMNode } from '@tiptap/pm/model'

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

export interface OutlineItem {
  level: number
  text: string
  pos: number
}

export interface DocumentEditorHandle {
  flush: () => Promise<void>
  saveNow: (force?: boolean) => Promise<void>
  getMarkdown: () => string
  getHTML: () => string
  format: (command: string) => void
  openFind: () => void
  insertImage: () => void
  scrollToPos: (pos: number) => void
  rebaseAssets: (oldPath: string, newPath: string) => void
}

interface Props {
  doc: DocContent
  settings: AppSettings
  meta: DocMeta
  reloadToken: number
  onMetaChange: (meta: DocMeta) => void
  onSaveState: (state: SaveState) => void
  onRequestLink: () => Promise<string | null>
  onOutline: (items: OutlineItem[]) => void
  onWordCount: (count: number) => void
  onError: (message: string) => void
  onDirty: () => void
}

const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] }

function emptyDoc(): typeof EMPTY_DOC {
  return { type: 'doc', content: [{ type: 'paragraph' }] }
}

export const DocumentEditor = forwardRef<DocumentEditorHandle, Props>(function DocumentEditor(props, ref) {
  const { doc, settings, meta, reloadToken } = props
  const [editor, setEditor] = useState<Editor | null>(null)
  const [findOpen, setFindOpen] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [blockMenu, setBlockMenu] = useState<{ pos: number; node: PMNode; x: number; y: number } | null>(null)
  const hoveredBlockRef = useRef<{ pos: number; node: PMNode } | null>(null)
  const handleVisibleRef = useRef(false)
  const activePlusRef = useRef<HTMLButtonElement>(null)
  const activePlusDataRef = useRef<{ pos: number; node: PMNode } | null>(null)
  const blockItems = useMemo(() => buildBlockItems(), [])

  const settingsRef = useRef(settings)
  const metaRef = useRef(meta)
  const onMetaChangeRef = useRef(props.onMetaChange)
  const onSaveStateRef = useRef(props.onSaveState)
  const onRequestLinkRef = useRef(props.onRequestLink)
  const onOutlineRef = useRef(props.onOutline)
  const onWordCountRef = useRef(props.onWordCount)
  const onErrorRef = useRef(props.onError)
  const onDirtyRef = useRef(props.onDirty)

  settingsRef.current = settings
  onMetaChangeRef.current = props.onMetaChange
  onSaveStateRef.current = props.onSaveState
  onRequestLinkRef.current = props.onRequestLink
  onOutlineRef.current = props.onOutline
  onWordCountRef.current = props.onWordCount
  onErrorRef.current = props.onError
  onDirtyRef.current = props.onDirty

  const loadedRef = useRef(false)
  const loadFailedRef = useRef(false)
  const savingRef = useRef(false)
  const pendingRef = useRef(false)
  const suppressUpdateRef = useRef(false)
  const timerRef = useRef<number | null>(null)
  const lastSavedRef = useRef('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pickImageRef = useRef<() => void>(() => undefined)
  const uploadRef = useRef<(files: File[], pos?: number) => void>(() => undefined)
  const markdownPasteRef = useRef<(text: string) => boolean>(() => false)

  const extensions = useMemo(() => createExtensions({ onPickImage: () => pickImageRef.current() }), [])

  const serializeNow = useCallback((): string => {
    if (!editor) return ''
    let markdown = editor.getMarkdown()
    markdown = internalToPortable(markdown)
    markdown = relativizeMarkdown(markdown, settingsRef.current.vaultPath, metaRef.current.path)
    return markdown
  }, [editor])

  const updateAux = useCallback((): void => {
    if (!editor) return
    onWordCountRef.current(countWords(editor.getText()))
    onOutlineRef.current(extractOutline(editor.state.doc))
  }, [editor])

  const saveNow = useCallback(
    async (force = false): Promise<void> => {
      if (!editor || loadFailedRef.current) return
      if (timerRef.current) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
      if (savingRef.current) {
        pendingRef.current = true
        return
      }
      let markdown: string
      try {
        markdown = serializeNow()
      } catch (error) {
        onSaveStateRef.current('error')
        onErrorRef.current(`序列化失败：${error instanceof Error ? error.message : String(error)}`)
        return
      }
      if (!force && markdown === lastSavedRef.current) {
        onSaveStateRef.current('saved')
        return
      }
      savingRef.current = true
      onSaveStateRef.current('saving')
      try {
        const current = metaRef.current
        const saved = await api.doc.save({
          path: current.path,
          id: current.id,
          markdown,
          title: current.title,
          icon: current.icon,
          pinned: current.pinned
        })
        lastSavedRef.current = markdown
        metaRef.current = { ...current, ...saved }
        onMetaChangeRef.current(saved)
        onSaveStateRef.current('saved')
      } catch (error) {
        onSaveStateRef.current('error')
        onErrorRef.current(`保存失败：${error instanceof Error ? error.message : String(error)}`)
      } finally {
        savingRef.current = false
        if (pendingRef.current) {
          pendingRef.current = false
          void saveNow(true)
        }
      }
    },
    [editor, serializeNow]
  )

  const scheduleSave = useCallback(
    (delay?: number): void => {
      if (!editor || loadFailedRef.current) return
      onSaveStateRef.current('dirty')
      if (timerRef.current) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null
        void saveNow()
      }, delay ?? settingsRef.current.autoSaveDelay)
    },
    [editor, saveNow]
  )

  const uploadFiles = useCallback(
    async (files: File[], pos?: number): Promise<void> => {
      if (!editor) return
      for (const file of files) {
        if (file.size > 60 * 1024 * 1024) {
          onErrorRef.current('单个附件不能超过 60MB')
          continue
        }
        try {
          const data = new Uint8Array(await file.arrayBuffer())
          const asset = await api.asset.import({
            docPath: metaRef.current.path,
            name: file.name || (file.type.startsWith('image/') ? 'image.png' : 'attachment'),
            data
          })
          if (file.type.startsWith('image/')) {
            editor
              .chain()
              .focus()
              .insertContentAt(pos ?? editor.state.selection.from, {
                type: 'image',
                attrs: { src: asset.url, alt: file.name }
              })
              .run()
          } else {
            editor
              .chain()
              .focus()
              .insertContentAt(pos ?? editor.state.selection.from, {
                type: 'text',
                text: file.name || '附件',
                marks: [{ type: 'link', attrs: { href: asset.url } }]
              })
              .run()
          }
          pos = undefined
        } catch (error) {
          onErrorRef.current(`插入附件失败：${error instanceof Error ? error.message : String(error)}`)
        }
      }
    },
    [editor]
  )

  uploadRef.current = (files, pos) => {
    void uploadFiles(files, pos)
  }
  pickImageRef.current = () => fileInputRef.current?.click()


  const instance = useEditor({
    extensions,
    content: emptyDoc(),
    editorProps: {
      attributes: {
        class: 'fn-editor',
        spellcheck: 'true'
      },
      handlePaste: (view, event) => {
        const files = Array.from(event.clipboardData?.files ?? [])
        if (files.length) {
          event.preventDefault()
          uploadRef.current(files)
          return true
        }
        const $from = view.state.selection.$from
        if ($from.parent.type.name === 'codeBlock' || $from.marks().some((mark) => mark.type.name === 'code')) {
          return false
        }
        const text = event.clipboardData?.getData('text/plain') ?? ''
        const html = event.clipboardData?.getData('text/html') ?? ''
        if (looksLikeMarkdown(text, html)) {
          const inserted = markdownPasteRef.current(text)
          if (inserted) {
            event.preventDefault()
            return true
          }
        }
        return false
      },
      handleDrop: (view, event) => {
        const files = Array.from((event as DragEvent).dataTransfer?.files ?? [])
        if (!files.length) return false
        event.preventDefault()
        const coords = view.posAtCoords({ left: (event as DragEvent).clientX, top: (event as DragEvent).clientY })
        uploadRef.current(files, coords?.pos)
        return true
      },
      handleClick: (_view, _pos, event) => {
        const target = event.target as HTMLElement | null
        const anchor = target?.closest('a')
        if (!anchor) return false
        const href = anchor.getAttribute('href') ?? ''
        if (/^https?:|^mailto:/i.test(href)) {
          event.preventDefault()
          void api.shell.openExternal(href)
          return true
        }
        if (href.startsWith('fnasset://local/')) {
          event.preventDefault()
          try {
            const abs = decodeURIComponent(href.slice('fnasset://local/'.length))
            void api.shell.showItemInFolder(abs)
          } catch {
            // ignore
          }
          return true
        }
        return false
      }
    },
    onCreate: ({ editor: created }) => setEditor(created),
    onDestroy: () => setEditor(null)
  })

  const activeEditor = editor ?? instance

  const updateActivePlus = useCallback(() => {
    const button = activePlusRef.current
    const ed = activeEditor
    if (!button || !ed) return
    const hide = (): void => {
      button.style.display = 'none'
      activePlusDataRef.current = null
    }
    if (!ed.isFocused || !ed.state.selection.empty || handleVisibleRef.current) {
      hide()
      return
    }
    try {
      const $from = ed.state.selection.$from
      if ($from.depth < 1) {
        hide()
        return
      }
      const pos = $from.before(1)
      const dom = ed.view.nodeDOM(pos)
      const element = dom instanceof HTMLElement ? dom : (dom?.parentElement ?? null)
      if (!element) {
        hide()
        return
      }
      const rect = element.getBoundingClientRect()
      if (rect.bottom < 56 || rect.top > window.innerHeight - 24) {
        hide()
        return
      }
      activePlusDataRef.current = { pos, node: $from.node(1) }
      button.style.display = 'flex'
      button.style.left = `${Math.max(6, rect.left - 44)}px`
      button.style.top = `${rect.top + 2}px`
    } catch {
      hide()
    }
  }, [activeEditor])

  useEffect(() => {
    if (!activeEditor) return
    let frame = 0
    const schedule = (): void => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        updateActivePlus()
      })
    }
    activeEditor.on('selectionUpdate', schedule)
    activeEditor.on('focus', schedule)
    activeEditor.on('blur', schedule)
    activeEditor.on('update', schedule)
    const onMouseMove = (event: MouseEvent): void => {
      const target = event.target as Element | null
      const overEditor = Boolean(
        target?.closest('.fn-editor, .fn-drag-handle, .fn-block-menu, .fn-active-plus')
      )
      if (!overEditor && handleVisibleRef.current) {
        handleVisibleRef.current = false
        schedule()
      }
    }
    const scroller = document.querySelector('.doc-scroll')
    scroller?.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    window.addEventListener('mousemove', onMouseMove, { passive: true })
    schedule()
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      activeEditor.off('selectionUpdate', schedule)
      activeEditor.off('focus', schedule)
      activeEditor.off('blur', schedule)
      activeEditor.off('update', schedule)
      scroller?.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('mousemove', onMouseMove)
    }
  }, [activeEditor, updateActivePlus])

  useEffect(() => {
    if (!activeEditor) return
    setEditor(activeEditor)
  }, [activeEditor])

  const insertMarkdownText = useCallback(
    (text: string): boolean => {
      if (!activeEditor) return false
      let body = stripFrontmatter(text.replace(/\r\n/g, '\n'))
      if (!body.trim()) return false
      try {
        const parsed = activeEditor.markdown?.parse(portableToInternal(body))
        if (!parsed) return false
        const resolved = resolveJsonAssets(parsed, settingsRef.current.vaultPath, metaRef.current.path)
        const content = resolved.content ?? []
        if (!content.length) return false
        const inlineOnly =
          content.length === 1 && content[0].type === 'paragraph' && !body.includes('\n')
        if (inlineOnly) {
          activeEditor.chain().focus().insertContent(content[0].content ?? []).run()
        } else {
          activeEditor.chain().focus().insertContent(content).run()
        }
        return true
      } catch (error) {
        onErrorRef.current(`粘贴 Markdown 失败：${error instanceof Error ? error.message : String(error)}`)
        return false
      }
    },
    [activeEditor]
  )

  markdownPasteRef.current = insertMarkdownText

  useEffect(() => {
    metaRef.current = meta
  }, [meta])

  // 首次载入 Markdown
  useEffect(() => {
    if (!activeEditor) return
    loadedRef.current = false
    loadFailedRef.current = false
    setLoadError(null)
    try {
      const internal = portableToInternal(doc.markdown)
      const parsed = activeEditor.markdown?.parse(internal) ?? emptyDoc()
      const json = parsed && parsed.content && parsed.content.length ? parsed : emptyDoc()
      const resolved = resolveJsonAssets(json, settingsRef.current.vaultPath, metaRef.current.path)
      activeEditor.commands.setContent(resolved, { emitUpdate: false })
      lastSavedRef.current = serializeNow()
      loadedRef.current = true
      updateAux()
      onSaveStateRef.current('saved')
    } catch (error) {
      loadFailedRef.current = true
      const message = error instanceof Error ? error.message : String(error)
      setLoadError(message)
      onErrorRef.current(`文档解析失败，已暂停自动保存以保护原文件：${message}`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEditor, doc.meta.id, reloadToken])

  // 监听编辑更新
  useEffect(() => {
    if (!activeEditor) return
    let auxTimer: number | null = null
    const onUpdate = (): void => {
      if (!loadedRef.current) return
      if (suppressUpdateRef.current) {
        suppressUpdateRef.current = false
        return
      }
      onDirtyRef.current()
      scheduleSave()
      if (auxTimer) window.clearTimeout(auxTimer)
      auxTimer = window.setTimeout(() => updateAux(), 220)
    }
    activeEditor.on('update', onUpdate)
    return () => {
      activeEditor.off('update', onUpdate)
      if (auxTimer) window.clearTimeout(auxTimer)
    }
  }, [activeEditor, scheduleSave, updateAux])

  // 标题 / 图标 / 置顶变化时保存
  const prevMetaRef = useRef(meta)
  useEffect(() => {
    const prev = prevMetaRef.current
    prevMetaRef.current = meta
    if (!loadedRef.current) return
    if (prev.title !== meta.title || prev.icon !== meta.icon || prev.pinned !== meta.pinned) {
      scheduleSave(280)
    }
  }, [meta, scheduleSave])

  // 退出前兜底保存
  const flushOnUnmountRef = useRef<() => void>(() => undefined)
  flushOnUnmountRef.current = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    if (!loadedRef.current || loadFailedRef.current) return
    try {
      const markdown = serializeNow()
      if (!markdown || markdown === lastSavedRef.current) return
      const current = metaRef.current
      void api.doc.save({
        path: current.path,
        id: current.id,
        markdown,
        title: current.title,
        icon: current.icon,
        pinned: current.pinned
      })
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    return () => flushOnUnmountRef.current()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 文件选择
  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length) void uploadFiles(files)
  }

  const format = useCallback(
    (command: string): void => {
      if (!activeEditor) return
      const chain = activeEditor.chain().focus()
      switch (command) {
        case 'undo':
          chain.undo().run()
          break
        case 'redo':
          chain.redo().run()
          break
        case 'bold':
          chain.toggleBold().run()
          break
        case 'italic':
          chain.toggleItalic().run()
          break
        case 'underline':
          chain.toggleUnderline().run()
          break
        case 'strike':
          chain.toggleStrike().run()
          break
        case 'highlight':
          chain.toggleHighlight({ color: '#FFF1B8' }).run()
          break
        case 'code':
          chain.toggleCode().run()
          break
        case 'h1':
          chain.setHeading({ level: 1 }).run()
          break
        case 'h2':
          chain.setHeading({ level: 2 }).run()
          break
        case 'h3':
          chain.setHeading({ level: 3 }).run()
          break
        case 'h4':
          chain.setHeading({ level: 4 }).run()
          break
        case 'paragraph':
          chain.setParagraph().run()
          break
        case 'orderedList':
          chain.toggleOrderedList().run()
          break
        case 'bulletList':
          chain.toggleBulletList().run()
          break
        case 'taskList':
          chain.toggleTaskList().run()
          break
        case 'blockquote':
          chain.toggleBlockquote().run()
          break
        case 'codeBlock':
          chain.setCodeBlock().run()
          break
        case 'horizontalRule':
          chain.setHorizontalRule().run()
          break
        case 'callout':
          chain
            .insertContent({
              type: 'callout',
              attrs: { variant: 'note', title: '' },
              content: [{ type: 'paragraph' }]
            })
            .run()
          break
        case 'details':
        case 'toggle':
          chain
            .insertContent({
              type: 'toggle',
              attrs: { title: '折叠块' },
              content: [{ type: 'paragraph' }]
            })
            .run()
          break
        case 'link':
          void (async () => {
            const href = await onRequestLinkRef.current?.()
            if (!href) return
            const current = activeEditor
            if (current.state.selection.empty) {
              current
                .chain()
                .focus()
                .insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] })
                .run()
            } else {
              current.chain().focus().extendMarkRange('link').setLink({ href }).run()
            }
          })()
          break
        case 'pasteMarkdown':
          void (async () => {
            try {
              const text = await api.clipboard.readText()
              if (text.trim()) insertMarkdownText(text)
            } catch (error) {
              onErrorRef.current(
                `读取剪贴板失败：${error instanceof Error ? error.message : String(error)}`
              )
            }
          })()
          break
        case 'find':
          setFindOpen(true)
          break
        case 'save':
          void saveNow(true)
          break
        default:
          break
      }
    },
    [activeEditor, insertMarkdownText]
  )

  useImperativeHandle(
    ref,
    () => ({
      flush: () => saveNow(),
      saveNow: (force?: boolean) => saveNow(force),
      getMarkdown: () => {
        try {
          return serializeNow()
        } catch {
          return ''
        }
      },
      getHTML: () => {
        try {
          return activeEditor?.getHTML() ?? ''
        } catch {
          return ''
        }
      },
      format,
      openFind: () => setFindOpen(true),
      insertImage: () => fileInputRef.current?.click(),
      scrollToPos: (pos: number) => {
        if (!activeEditor) return
        try {
          const dom = activeEditor.view.domAtPos(pos).node
          const element = dom.nodeType === Node.TEXT_NODE ? dom.parentElement : (dom as HTMLElement)
          element?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        } catch {
          // ignore
        }
      },
      rebaseAssets: (oldPath: string, newPath: string) => {
        if (!activeEditor) return
        const updates: Array<{ pos: number; attrs: Record<string, unknown> }> = []
        activeEditor.state.doc.descendants((node, pos) => {
          if (node.type.name !== 'image') return
          const src = (node.attrs.src as string) ?? ''
          const next = rebaseAssetUrl(src, settingsRef.current.vaultPath, oldPath, newPath)
          if (next !== src) updates.push({ pos, attrs: { ...node.attrs, src: next } })
        })
        if (!updates.length) return
        let tr = activeEditor.state.tr
        for (const update of updates) tr = tr.setNodeMarkup(update.pos, undefined, update.attrs)
        suppressUpdateRef.current = true
        activeEditor.view.dispatch(tr)
      }
    }),
    [saveNow, serializeNow, format, activeEditor]
  )

  const closeFind = (): void => {
    setFindOpen(false)
    if (activeEditor) {
      applyFind(activeEditor, '')
      activeEditor.commands.focus()
    }
  }

  return (
    <div className="fn-editor-host">
      {loadError && (
        <div className="fn-load-error">
          文档解析失败，自动保存已暂停以保护原文件。请先备份后复制内容到新文档。
          <span className="fn-load-error-detail">{loadError}</span>
        </div>
      )}
      {activeEditor && (
        <BubbleMenu
          editor={activeEditor}
          className="fn-bubble-menu-root"
          shouldShow={({ editor: current, from, to }) =>
            from !== to && !current.isActive('image') && !current.isActive('codeBlock') && !current.isActive('table')
          }
        >
          <BubbleToolbar editor={activeEditor} />
        </BubbleMenu>
      )}
      {findOpen && activeEditor && <FindBar editor={activeEditor} onClose={closeFind} />}
      <EditorContent editor={activeEditor} />
      {activeEditor && (
        <DragHandle
          editor={activeEditor}
          className="fn-drag-handle"
          onNodeChange={({ node, pos }) => {
            if (node) hoveredBlockRef.current = { node, pos }
            handleVisibleRef.current = Boolean(node)
            updateActivePlus()
          }}
        >
          <span className="fn-block-handle">
            <button
              type="button"
              className="fn-plus"
              title="插入内容"
              aria-label="插入内容"
              draggable={false}
              onMouseDown={(event) => {
                event.preventDefault()
                event.stopPropagation()
              }}
              onDragStart={(event) => event.preventDefault()}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                const target = hoveredBlockRef.current
                if (!target) return
                const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
                setBlockMenu({ ...target, x: rect.right + 8, y: rect.top - 2 })
              }}
            >
              <Plus size={14} />
            </button>
            <GripVertical size={15} />
          </span>
        </DragHandle>
      )}
      {activeEditor && <TableToolbar editor={activeEditor} />}
      {activeEditor && (
        <button
          ref={activePlusRef}
          type="button"
          className="fn-plus fn-active-plus"
          title="插入内容"
          aria-label="插入内容"
          style={{ display: 'none' }}
          onMouseDown={(event) => {
            event.preventDefault()
            event.stopPropagation()
          }}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            const target = activePlusDataRef.current
            if (!target) return
            const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
            setBlockMenu({ ...target, x: rect.right + 8, y: rect.top - 2 })
          }}
        >
          <Plus size={14} />
        </button>
      )}
      {activeEditor && blockMenu && (
        <BlockMenu
          x={blockMenu.x}
          y={blockMenu.y}
          items={blockItems}
          onClose={() => setBlockMenu(null)}
          onSelect={(item: BlockItem) => {
            const target = blockMenu
            setBlockMenu(null)
            item.apply({
              editor: activeEditor,
              pos: target.pos,
              node: target.node,
              onPickImage: () => fileInputRef.current?.click()
            })
          }}
        />
      )}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.zip,.csv"
        onChange={onFileChange}
      />
    </div>
  )
})
