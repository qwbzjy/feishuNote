export type View =
  | { name: 'home' }
  | { name: 'doc'; path: string }
  | { name: 'trash' }
  | { name: 'search'; query: string }

export interface DocBridge {
  flush: () => Promise<void>
  exportPdf: () => void
  exportHtml: () => void
  exportMarkdown: () => void
  toggleOutline: () => void
  format: (command: string) => void
  openFind: () => void
  rebaseAssets?: (oldPath: string, newPath: string) => void
  reload: () => void
}

export interface PromptRequest {
  title: string
  label?: string
  initial?: string
  placeholder?: string
  confirmText?: string
}

export interface ConfirmRequest {
  title: string
  message: string
  confirmText?: string
  danger?: boolean
}

export type ToastTone = 'info' | 'success' | 'error'

export interface ToastItem {
  id: number
  message: string
  tone: ToastTone
}
