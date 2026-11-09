import { api } from './api'

export const isMac = api.platform === 'darwin'
export const isWindows = api.platform === 'win32'

/** 用于界面提示的修饰键符号 */
export const modKey = isMac ? '⌘' : 'Ctrl'
export const shiftKey = isMac ? '⇧' : 'Shift'
export const altKey = isMac ? '⌥' : 'Alt'

export function shortcut(mac: string, windows: string): string {
  return isMac ? mac : windows
}

export function keyCombo(key: string): string {
  return isMac ? `⌘${key}` : `Ctrl+${key}`
}
