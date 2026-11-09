export function countWords(text: string): number {
  if (!text) return 0
  const cjk = (text.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g) ?? []).length
  const words = (
    text
      .replace(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g, ' ')
      .match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) ?? []
  ).length
  return cjk + words
}

export function formatRelativeTime(iso: string): string {
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return ''
  const diff = Date.now() - time
  const minute = 60 * 1000
  const hour = 60 * minute
  if (diff < minute) return '刚刚'
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`
  if (diff < 24 * hour) return `${Math.floor(diff / hour)} 小时前`
  const date = new Date(time)
  const now = new Date()
  const sameYear = date.getFullYear() === now.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  if (diff < 48 * hour) return `昨天 ${pad(date.getHours())}:${pad(date.getMinutes())}`
  return sameYear ? `${month} 月 ${day} 日` : `${date.getFullYear()} 年 ${month} 月 ${day} 日`
}

export function formatFullTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日 ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function formatShortDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日 ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}
