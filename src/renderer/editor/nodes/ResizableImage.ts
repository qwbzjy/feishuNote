import Image from '@tiptap/extension-image'

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * 在飞书里图片可以拖拽缩放；Tiptap 的 Image 已内置 resize。
 * 这里补一条 Markdown 序列化规则：带宽度时用 HTML 保留尺寸。
 */
export const ResizableImage = Image.extend({
  renderMarkdown(node) {
    const src = (node.attrs?.src as string) ?? ''
    const alt = (node.attrs?.alt as string) ?? ''
    const title = (node.attrs?.title as string) ?? ''
    const width = node.attrs?.width as number | null
    const height = node.attrs?.height as number | null
    if (width || height) {
      const size = `${width ? ` width="${width}"` : ''}${height ? ` height="${height}"` : ''}`
      return `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}"${size} />`
    }
    return title ? `![${alt}](${src} "${title}")` : `![${alt}](${src})`
  }
}).configure({
  inline: false,
  allowBase64: false,
  HTMLAttributes: { class: 'fn-image-el' },
  resize: { enabled: true, directions: ['bottom-right', 'bottom-left'], minWidth: 80, alwaysPreserveAspectRatio: true }
})
