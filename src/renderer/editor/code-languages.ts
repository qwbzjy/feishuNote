import { createLowlight, common } from 'lowlight'

export const lowlight = createLowlight(common)

const LANGUAGE_LABELS: Record<string, string> = {
  plaintext: '纯文本',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  jsx: 'JSX',
  tsx: 'TSX',
  json: 'JSON',
  html: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  python: 'Python',
  java: 'Java',
  go: 'Go',
  rust: 'Rust',
  c: 'C',
  cpp: 'C++',
  csharp: 'C#',
  objectivec: 'Objective-C',
  swift: 'Swift',
  kotlin: 'Kotlin',
  php: 'PHP',
  ruby: 'Ruby',
  bash: 'Shell',
  shell: 'Shell',
  sql: 'SQL',
  yaml: 'YAML',
  markdown: 'Markdown',
  xml: 'XML',
  diff: 'Diff',
  dockerfile: 'Dockerfile',
  makefile: 'Makefile',
  nginx: 'Nginx',
  ini: 'INI',
  toml: 'TOML',
  graphql: 'GraphQL',
  dart: 'Dart',
  scala: 'Scala',
  r: 'R',
  lua: 'Lua',
  perl: 'Perl',
  powershell: 'PowerShell'
}

export function languageLabel(language: string): string {
  return LANGUAGE_LABELS[language] ?? language
}

export const CODE_LANGUAGES = Array.from(new Set(['plaintext', ...lowlight.listLanguages()])).sort((a, b) => {
  if (a === 'plaintext') return -1
  if (b === 'plaintext') return 1
  return languageLabel(a).localeCompare(languageLabel(b), 'en')
})
