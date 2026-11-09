import { describe, expect, it } from 'vitest'
import {
  decodeAttributes,
  encodeAttributes,
  internalToPortable,
  portableToInternal
} from '@shared/portable-markdown'

describe('portable markdown', () => {
  it('把 Obsidian callout 转成内部高亮块语法', () => {
    const input = ['> [!NOTE] 标题', '> 第一段', '>', '> - 列表项', '> ```js', '> code()', '> ```'].join('\n')
    const internal = portableToInternal(input)
    expect(internal).toContain(':::callout {variant="note" title="')
    expect(internal).toContain('- 列表项')
    expect(internal).toContain('```js')
    expect(internal.trim().endsWith(':::')).toBe(true)
  })

  it('内部高亮块序列化回 Obsidian callout', () => {
    const internal = [':::callout {variant="warning" title="注意"}', '内容', '', '- 一', '- 二', ':::'].join('\n')
    const portable = internalToPortable(internal)
    expect(portable).toContain('> [!WARNING] 注意')
    expect(portable).toContain('> - 一')
    expect(portable).toContain('> - 二')
  })

  it('折叠块与 HTML details 双向转换', () => {
    const internal = [':::toggle {title="更多细节"}', '折叠内容', '', '- 列表', ':::'].join('\n')
    const portable = internalToPortable(internal)
    expect(portable).toContain('<details>')
    expect(portable).toContain('<summary>更多细节</summary>')
    expect(portable).toContain('折叠内容')

    const back = portableToInternal(portable)
    expect(back).toContain(':::toggle {title="')
    expect(decodeURIComponent(back)).toContain('更多细节')
    expect(back).toContain('- 列表')
  })

  it('分栏围栏与嵌套块不会被破坏', () => {
    const internal = [
      ':::columns {cols="2"}',
      ':::column',
      '左栏',
      ':::',
      ':::column',
      '右栏',
      ':::',
      ':::'
    ].join('\n')
    expect(internalToPortable(internal)).toContain(':::columns {cols="2"}')
    expect(internalToPortable(internal)).toContain('左栏')
  })

  it('标题中的引号与特殊字符可以安全往返', () => {
    const attrs = encodeAttributes({ title: '他说："你好" {x}', variant: 'note' })
    const decoded = decodeAttributes(attrs)
    expect(decoded.title).toBe('他说："你好" {x}')
    expect(decoded.variant).toBe('note')
  })

  it('代码块中的 callout 文本不会被误转换', () => {
    const input = ['```md', '> [!NOTE] 这是示例', '```'].join('\n')
    expect(portableToInternal(input)).toBe(input)
  })

  it('没有高亮块 / 折叠块时保持原文', () => {
    const input = '# 标题\n\n普通段落\n\n- 列表\n'
    expect(internalToPortable(input)).toBe(input)
    expect(portableToInternal(input)).toBe(input)
  })
})
