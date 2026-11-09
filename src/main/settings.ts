import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { AppSettings } from '@shared/types'

const DEFAULTS: Omit<AppSettings, 'vaultPath'> = {
  theme: 'system',
  fontSize: 15,
  lineWidth: 780,
  showWordCount: true,
  autoSaveDelay: 600,
  lastDocPath: null
}

function settingsFile(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)))
}

function normalize(input: Partial<AppSettings>, fallbackVault: string): AppSettings {
  return {
    vaultPath:
      typeof input.vaultPath === 'string' && input.vaultPath.trim()
        ? path.resolve(input.vaultPath)
        : fallbackVault,
    theme: input.theme === 'light' || input.theme === 'dark' || input.theme === 'system' ? input.theme : DEFAULTS.theme,
    fontSize: clamp(Number(input.fontSize ?? DEFAULTS.fontSize), 13, 20),
    lineWidth: clamp(Number(input.lineWidth ?? DEFAULTS.lineWidth), 620, 1000),
    showWordCount: input.showWordCount !== false,
    autoSaveDelay: clamp(Number(input.autoSaveDelay ?? DEFAULTS.autoSaveDelay), 200, 3000),
    lastDocPath: typeof input.lastDocPath === 'string' ? input.lastDocPath : null
  }
}

export class SettingsStore {
  private data: AppSettings

  constructor() {
    const fallbackVault = process.env.FEISHUNOTE_VAULT
      ? path.resolve(process.env.FEISHUNOTE_VAULT)
      : path.join(app.getPath('documents'), 'FeishuNote')
    let parsed: Partial<AppSettings> = {}
    try {
      const raw = fs.readFileSync(settingsFile(), 'utf8')
      parsed = JSON.parse(raw) as Partial<AppSettings>
    } catch {
      parsed = {}
    }
    this.data = normalize(parsed, fallbackVault)
    this.persist()
  }

  get(): AppSettings {
    return { ...this.data }
  }

  update(patch: Partial<AppSettings>): AppSettings {
    const merged = normalize({ ...this.data, ...patch }, this.data.vaultPath)
    // 文档库路径切换必须由调用方显式处理
    if (patch.vaultPath !== undefined && merged.vaultPath !== this.data.vaultPath) {
      merged.vaultPath = path.resolve(patch.vaultPath)
    }
    this.data = merged
    this.persist()
    return this.get()
  }

  private persist(): void {
    const file = settingsFile()
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const tmp = `${file}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8')
    fs.renameSync(tmp, file)
  }
}

let store: SettingsStore | null = null

export function getSettingsStore(): SettingsStore {
  if (!store) store = new SettingsStore()
  return store
}

export function getSettings(): AppSettings {
  return getSettingsStore().get()
}
