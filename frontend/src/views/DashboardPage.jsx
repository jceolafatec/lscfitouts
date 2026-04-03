import { HeaderBar } from '../components/HeaderBar'

export function DashboardPage() {
  return (
    <div className="app-shell">
      <HeaderBar />
      <main className="dashboard-main-shell" role="main" aria-label="Dashboard content area">
        <section className="dashboard-placeholder">
          <h1>Dashboard</h1>
          <p>All project folders under ./projects</p>
        </section>
      </main>
    </div>
  )
}
