import { describe, expect, it } from 'vitest'
import { rebaseAssetUrl, relativizeMarkdown, resolveAssetSrc } from '@renderer/lib/assets'

const VAULT = '/Users/me/Documents/FeishuNote'

describe('asset urls', () => {
  it('相对图片路径解析为 fnasset 地址', () => {
    const url = resolveAssetSrc(VAULT, '工作/周报.md', '周报.assets/a.png')
    expect(url).toBe(`fnasset://local/${encodeURIComponent(`${VAULT}/工作/周报.assets/a.png`)}`)
  })

  it('已编码的相对路径可以正确解析', () => {
    const url = resolveAssetSrc(VAULT, '工作/周报.md', '%E5%91%A8%E6%8A%A5.assets/a%20b.png')
    expect(decodeURIComponent(url)).toContain(`${VAULT}/工作/周报.assets/a b.png`)
  })

  it('外链与 data URL 保持不变', () => {
    expect(resolveAssetSrc(VAULT, 'a.md', 'https://example.com/x.png')).toBe('https://example.com/x.png')
    expect(resolveAssetSrc(VAULT, 'a.md', 'data:image/png;base64,xx')).toBe('data:image/png;base64,xx')
  })

  it('保存时把 fnasset 地址还原成相对路径', () => {
    const abs = `${VAULT}/工作/周报.assets/a.png`
    const markdown = `![x](fnasset://local/${encodeURIComponent(abs)})`
    expect(relativizeMarkdown(markdown, VAULT, '工作/周报.md')).toBe('![x](%E5%91%A8%E6%8A%A5.assets/a.png)')
  })

  it('重命名文档后资源地址同步变化', () => {
    const oldUrl = `fnasset://local/${encodeURIComponent(`${VAULT}/工作/旧名.assets/a.png`)}`
    const next = rebaseAssetUrl(oldUrl, VAULT, '工作/旧名.md', '工作/新名.md')
    expect(decodeURIComponent(next)).toContain(`${VAULT}/工作/新名.assets/a.png`)
  })

  it('移动文件夹后资源地址同步变化', () => {
    const oldUrl = `fnasset://local/${encodeURIComponent(`${VAULT}/工作/周报.assets/a.png`)}`
    const next = rebaseAssetUrl(oldUrl, VAULT, '工作/周报.md', '项目/工作/周报.md')
    expect(decodeURIComponent(next)).toContain(`${VAULT}/项目/工作/周报.assets/a.png`)
  })
})

describe('windows asset paths', () => {
  const WIN_VAULT = 'C:\\Users\\me\\Documents\\FeishuNote'

  it('Windows 文档库路径也能生成 fnasset 地址', () => {
    const url = resolveAssetSrc(WIN_VAULT, '工作/周报.md', '周报.assets/a.png')
    expect(decodeURIComponent(url)).toBe('fnasset://local/C:/Users/me/Documents/FeishuNote/工作/周报.assets/a.png')
  })

  it('Windows 下保存时能还原相对路径', () => {
    const abs = 'C:\\Users\\me\\Documents\\FeishuNote\\工作\\周报.assets\\a.png'
    const markdown = `![x](fnasset://local/${encodeURIComponent(abs)})`
    expect(relativizeMarkdown(markdown, WIN_VAULT, '工作/周报.md')).toBe('![x](%E5%91%A8%E6%8A%A5.assets/a.png)')
  })

  it('Windows 下重命名文档后能同步资源地址', () => {
    const oldUrl = `fnasset://local/${encodeURIComponent('C:\\Users\\me\\Documents\\FeishuNote\\工作\\旧名.assets\\a.png')}`
    const next = rebaseAssetUrl(oldUrl, WIN_VAULT, '工作/旧名.md', '工作/新名.md')
    expect(decodeURIComponent(next)).toContain('C:/Users/me/Documents/FeishuNote/工作/新名.assets/a.png')
  })
})
