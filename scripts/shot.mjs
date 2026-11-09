import { chromium } from 'playwright-core'

const out = process.argv[2] ?? `${process.env.TMPDIR ?? '/tmp'}/feishunote-shot.png`
const browser = await chromium.connectOverCDP(process.env.CDP_URL ?? 'http://127.0.0.1:9222')
const pages = browser.contexts().flatMap((context) => context.pages())
const page = pages.find((item) => item.url().includes('localhost') || item.url().includes('index.html')) ?? pages[0]
if (!page) {
  console.error('no page found')
  process.exit(1)
}
await page.waitForTimeout(400)
await page.screenshot({ path: out })
console.log(JSON.stringify({ url: page.url(), title: await page.title(), out }))
process.exit(0)
