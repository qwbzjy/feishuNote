import { useApp } from './state/AppProvider'
import { AppProvider } from './state/AppProvider'
import { Sidebar } from './components/Sidebar'
import { HomePage } from './pages/HomePage'
import { DocPage } from './pages/DocPage'
import { TrashPage } from './pages/TrashPage'
import { SearchPage } from './pages/SearchPage'
import { CommandPalette } from './components/CommandPalette'
import { SearchDialog } from './components/SearchDialog'
import { SettingsDialog } from './components/SettingsDialog'
import { PromptDialog } from './components/PromptDialog'
import { ConfirmDialog } from './components/ConfirmDialog'
import { Toasts } from './components/Toasts'
import { ErrorBoundary } from './components/ErrorBoundary'

function Shell() {
  const app = useApp()
  return (
    <>
      <div className="app-shell">
        <Sidebar />
        <main className={`main-pane${app.sidebarVisible ? '' : ' no-sidebar'}`}>
          {app.view.name === 'home' && <HomePage />}
          {app.view.name === 'doc' && <DocPage />}
          {app.view.name === 'trash' && <TrashPage />}
          {app.view.name === 'search' && <SearchPage key={app.view.query} />}
        </main>
      </div>
      <CommandPalette />
      <SearchDialog />
      <SettingsDialog />
      <PromptDialog />
      <ConfirmDialog />
      <Toasts />
    </>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <Shell />
      </AppProvider>
    </ErrorBoundary>
  )
}
