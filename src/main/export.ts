import { app, BrowserWindow, dialog } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { ExportHtmlInput, ExportMarkdownInput } from '@shared/types'
import { getVaultRoot, isInsideVault } from './vault'
import { fromAssetUrl } from './fs-utils'

export async function exportPdf(win: BrowserWindow, suggestedName: string): Promise<string | null> {
  const filePath = await chooseSavePath(win, '导出 PDF', suggestedName, 'pdf', 'PDF 文档')
  if (!filePath) return null
  const data = await win.webContents.printToPDF({
    printBackground: true,
    pageSize: 'A4',
    margins: { top: 0.55, bottom: 0.55, left: 0.5, right: 0.5 }
  })
  fs.writeFileSync(filePath, data)
  return filePath
}

export async function exportHtml(win: BrowserWindow, input: ExportHtmlInput): Promise<string | null> {
  const filePath = await chooseSavePath(win, '导出 HTML', input.title, 'html', 'HTML 网页')
  if (!filePath) return null
  const base = path.basename(filePath, '.html')
  const assetsRel = `${base}.assets`
  const assetsAbs = path.join(path.dirname(filePath), assetsRel)
  const used = new Map<string, string>()

  const html = input.html.replace(/(<img\b[^>]*\bsrc=")([^"]+)(")/g, (match, pre: string, src: string, post: string) => {
    const abs = fromAssetUrl(src)
    if (!abs || !isInsideVault(abs) || !fs.existsSync(abs)) return match
    let rel = used.get(abs)
    if (!rel) {
      fs.mkdirSync(assetsAbs, { recursive: true })
      const name = uniqueFileName(assetsAbs, path.basename(abs))
      fs.copyFileSync(abs, path.join(assetsAbs, name))
      rel = `${assetsRel}/${name}`
      used.set(abs, rel)
    }
    return `${pre}${rel}${post}`
  })

  const doc = template(input.title, html)
  fs.writeFileSync(filePath, doc, 'utf8')
  return filePath
}

export async function exportMarkdown(win: BrowserWindow, input: ExportMarkdownInput): Promise<string | null> {
  const filePath = await chooseSavePath(win, '导出 Markdown', input.title, 'md', 'Markdown')
  if (!filePath) return null
  const body = input.markdown.replace(/^\n+/, '')
  const content = body.startsWith('# ') ? body : `# ${input.title}\n\n${body}`
  fs.writeFileSync(filePath, content, 'utf8')
  return filePath
}


async function chooseSavePath(
  win: BrowserWindow,
  title: string,
  suggestedName: string,
  extension: string,
  filterName: string
): Promise<string | null> {
  const testDir = process.env.FEISHUNOTE_EXPORT_DIR
  if (testDir) {
    fs.mkdirSync(testDir, { recursive: true })
    return path.join(testDir, `${safeFile(suggestedName)}.${extension}`)
  }
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title,
    defaultPath: path.join(app.getPath('documents'), `${safeFile(suggestedName)}.${extension}`),
    filters: [{ name: filterName, extensions: [extension] }]
  })
  if (canceled || !filePath) return null
  return filePath
}

function safeFile(name: string): string {
  return (
    name
      .replace(/[\\/:*?"<>|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || '未命名文档'
  )
}

function uniqueFileName(dir: string, name: string): string {
  const ext = path.extname(name)
  const stem = path.basename(name, ext)
  let candidate = name
  let i = 2
  while (fs.existsSync(path.join(dir, candidate))) {
    candidate = `${stem} ${i}${ext}`
    i += 1
  }
  return candidate
}

function template(title: string, html: string): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 56px 24px 96px;
    font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 15px; line-height: 1.75; color: #1F2329; background: #fff;
    -webkit-font-smoothing: antialiased;
  }
  .doc { max-width: 780px; margin: 0 auto; }
  .doc-title { font-size: 32px; font-weight: 600; line-height: 1.4; margin: 0 0 24px; letter-spacing: .01em; }
  .doc-content > *:first-child { margin-top: 0; }
  h1 { font-size: 28px; font-weight: 600; line-height: 1.4; margin: 32px 0 12px; }
  h2 { font-size: 23px; font-weight: 600; line-height: 1.45; margin: 28px 0 10px; }
  h3 { font-size: 19px; font-weight: 600; line-height: 1.5; margin: 24px 0 8px; }
  h4 { font-size: 17px; font-weight: 600; line-height: 1.5; margin: 20px 0 8px; }
  p { margin: 7px 0; }
  a { color: #3370FF; text-decoration: none; }
  a:hover { text-decoration: underline; }
  ul, ol { padding-left: 26px; margin: 7px 0; }
  li { margin: 3px 0; }
  blockquote { margin: 10px 0; padding: 2px 0 2px 14px; border-left: 3px solid #DEE0E3; color: #646A73; }
  hr { border: 0; border-top: 1px solid #DEE0E3; margin: 26px 0; }
  code { font-family: "SF Mono", Menlo, Consolas, monospace; font-size: .88em; background: #F5F6F7; border-radius: 4px; padding: 2px 5px; }
  pre { background: #F5F6F7; border-radius: 8px; padding: 16px 18px; overflow: auto; margin: 12px 0; line-height: 1.6; }
  pre code { background: none; padding: 0; font-size: 13px; }
  img { max-width: 100%; height: auto; border-radius: 6px; }
  mark { background: #FFEB99; color: inherit; border-radius: 2px; padding: 0 2px; }
  table { border-collapse: collapse; width: 100%; margin: 14px 0; font-size: 14px; }
  th, td { border: 1px solid #DEE0E3; padding: 7px 10px; text-align: left; vertical-align: top; }
  th { background: #F5F6F7; font-weight: 500; }
  ul[data-type="taskList"] { list-style: none; padding-left: 4px; }
  ul[data-type="taskList"] > li { display: flex; gap: 8px; align-items: flex-start; }
  ul[data-type="taskList"] > li > label { margin-top: 5px; }
  ul[data-type="taskList"] > li > div { flex: 1; min-width: 0; }
  ul[data-type="taskList"] > li[data-checked="true"] > div { color: #8F959E; text-decoration: line-through; }
  .fn-callout-head { display: flex; align-items: center; gap: 7px; margin-bottom: 4px; font-weight: 600; }
  .fn-callout-icon { font-size: 15px; }
  .fn-callout-content > :first-child { margin-top: 0; }
  .fn-callout-content > :last-child { margin-bottom: 0; }
  div[data-type="callout"] { border-radius: 8px; padding: 12px 16px; margin: 12px 0; border-left: 3px solid transparent; }
  div[data-type="callout"][data-variant="note"] { background: #F0F5FF; border-color: #3370FF; }
  div[data-type="callout"][data-variant="tip"] { background: #F0FAF1; border-color: #34C724; }
  div[data-type="callout"][data-variant="warning"] { background: #FFF8EB; border-color: #FF8800; }
  div[data-type="callout"][data-variant="caution"] { background: #FFF2F0; border-color: #F54A45; }
  div[data-type="callout"][data-variant="important"] { background: #F6F1FF; border-color: #7B61FF; }
  .callout-title { font-weight: 600; margin-bottom: 4px; }
  div[data-type="columns"] { display: flex; gap: 24px; margin: 14px 0; }
  div[data-type="column"] { flex: 1; min-width: 0; }
  details { margin: 10px 0; border: 1px solid #EFF0F1; border-radius: 8px; padding: 8px 12px; }
  summary { cursor: pointer; font-weight: 500; }
  .fn-code-block { background: #F5F6F7; border-radius: 8px; margin: 12px 0; overflow: hidden; }
  .fn-code-lang { font-size: 12px; color: #8F959E; padding: 6px 12px 0; }
  .fn-code-block pre { margin: 0; background: none; }
  .hljs-keyword, .hljs-built_in { color: #C678DD; }
  .hljs-string { color: #50A14F; }
  .hljs-number, .hljs-literal { color: #986801; }
  .hljs-comment { color: #A0A1A7; font-style: italic; }
  .hljs-function, .hljs-title { color: #4078F2; }
  .hljs-attr, .hljs-attribute { color: #986801; }
  @media print {
    body { padding: 0; }
    .doc { max-width: none; }
  }
</style>
</head>
<body>
<main class="doc">
  <h1 class="doc-title">${escapeHtml(title)}</h1>
  <div class="doc-content">${html}</div>
</main>
</body>
</html>`
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
