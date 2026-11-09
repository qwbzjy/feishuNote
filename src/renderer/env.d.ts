/// <reference types="vite/client" />

import type { FeishuNoteApi } from '@shared/types'

declare global {
  interface Window {
    feishuNote: FeishuNoteApi
  }
}

export {}
