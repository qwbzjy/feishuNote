import { describe, expect, it } from 'vitest'
import { looksLikeMarkdown, stripFrontmatter } from '../src/renderer/editor/markdown-paste'

describe('markdown paste detection', () => {
  it('识别块级 Markdown', () => {
    expect(looksLikeMarkdown('# 标题\n\n正文')).toBe(true)
    expect(looksLikeMarkdown('- 第一项\n- 第二项')).toBe(true)
    expect(looksLikeMarkdown('> 引用内容')).toBe(true)
    expect(looksLikeMarkdown('| 名称 | 值 |\n| --- | --- |')).toBe(true)
    expect(looksLikeMarkdown('```js\nconsole.log(1)\n```')).toBe(true)
    expect(looksLikeMarkdown('<details><summary>展开</summary>\n内容\n</details>')).toBe(true)
  })

  it('识别单行行内 Markdown', () => {
    expect(looksLikeMarkdown('**重点**')).toBe(true)
    expect(looksLikeMarkdown('[链接](https://example.com)')).toBe(true)
    expect(looksLikeMarkdown('`code`')).toBe(true)
    expect(looksLikeMarkdown('**重点** 和 `代码`')).toBe(true)
  })

  it('普通文本不自动转换', () => {
    expect(looksLikeMarkdown('今天开会讨论了三件事')).toBe(false)
    expect(looksLikeMarkdown('这是一个普通句子，里面有 * 星号。')).toBe(false)
    expect(looksLikeMarkdown('请查看 https://example.com')).toBe(false)
  })

  it('存在富文本 HTML 时不自动转换', () => {
    expect(looksLikeMarkdown('# 标题', '<p># 标题</p>')).toBe(false)
    expect(looksLikeMarkdown('- 列表', '<ul><li>列表</li></ul>')).toBe(false)
  })

  it('去除 frontmatter', () => {
    expect(stripFrontmatter('---\ntitle: 测试\n---\n正文')).toBe('正文')
    expect(stripFrontmatter('正文')).toBe('正文')
  })
})
