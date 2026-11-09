import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react'
import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { CODE_LANGUAGES, languageLabel, lowlight } from '../code-languages'

function CodeBlockView({ node, updateAttributes }: NodeViewProps) {
  const [copied, setCopied] = useState(false)
  const language = (node.attrs.language as string) || 'plaintext'
  const options = CODE_LANGUAGES.includes(language) ? CODE_LANGUAGES : [language, ...CODE_LANGUAGES]

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(node.textContent)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      // ignore
    }
  }

  return (
    <NodeViewWrapper className="fn-code-block">
      <div className="fn-code-head" contentEditable={false}>
        <select
          className="fn-code-lang"
          value={language}
          onChange={(event) => updateAttributes({ language: event.target.value })}
          onMouseDown={(event) => event.stopPropagation()}
        >
          {options.map((item) => (
            <option key={item} value={item}>
              {languageLabel(item)}
            </option>
          ))}
        </select>
        <button type="button" className="fn-code-copy" onClick={copy} title="复制代码">
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
      <pre spellCheck={false}>
        <NodeViewContent as={'code' as unknown as 'div'} />
      </pre>
    </NodeViewWrapper>
  )
}

export const CodeBlock = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView)
  }
}).configure({ lowlight, defaultLanguage: 'plaintext' })
