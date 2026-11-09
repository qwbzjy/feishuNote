import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import { ArrowDownToLine, ArrowRightToLine, Grid2x2, TableProperties, Trash2 } from 'lucide-react'

export function TableToolbar({ editor }: { editor: Editor }) {
  const inTable = useEditorState({
    editor,
    selector: ({ editor: current }) => current.isActive('table')
  })

  if (!inTable) return null

  return (
    <div className="fn-table-toolbar" onMouseDown={(event) => event.preventDefault()}>
      <button type="button" onClick={() => editor.chain().focus().addRowAfter().run()} title="在下方插入行">
        <ArrowDownToLine size={13} /> 插入行
      </button>
      <button type="button" onClick={() => editor.chain().focus().addColumnAfter().run()} title="在右侧插入列">
        <ArrowRightToLine size={13} /> 插入列
      </button>
      <span className="tool-sep" />
      <button type="button" onClick={() => editor.chain().focus().deleteRow().run()} title="删除当前行">
        删除行
      </button>
      <button type="button" onClick={() => editor.chain().focus().deleteColumn().run()} title="删除当前列">
        删除列
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHeaderRow().run()}
        title="切换表头"
      >
        <TableProperties size={13} /> 表头
      </button>
      <span className="tool-sep" />
      <button
        type="button"
        onClick={() => editor.chain().focus().mergeOrSplit().run()}
        title="合并或拆分单元格"
      >
        <Grid2x2 size={13} /> 合并
      </button>
      <button type="button" className="danger" onClick={() => editor.chain().focus().deleteTable().run()} title="删除表格">
        <Trash2 size={13} /> 删除表格
      </button>
    </div>
  )
}
