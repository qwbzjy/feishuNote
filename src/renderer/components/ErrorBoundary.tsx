import { Component, type ErrorInfo, type ReactNode } from 'react'

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div className="crash-screen">
        <div className="crash-card">
          <h1>界面遇到了问题</h1>
          <p>你的文档仍然安全地保存在本地 Markdown 文件中。可以尝试重新加载界面。</p>
          <pre>{this.state.error.message}</pre>
          <div className="crash-actions">
            <button type="button" className="btn primary" onClick={() => window.location.reload()}>
              重新加载
            </button>
            <button type="button" className="btn ghost" onClick={() => this.setState({ error: null })}>
              返回
            </button>
          </div>
        </div>
      </div>
    )
  }
}
