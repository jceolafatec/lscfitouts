import { ProjectDashboard } from './views/ProjectDashboard'
import { ClientPage } from './views/ClientPage'

export default function App() {
  const isClientPage = typeof window !== 'undefined' && /\/client\.html$/.test(window.location.pathname)
  if (isClientPage) {
    return <ClientPage />
  }
  return <ProjectDashboard />
}
