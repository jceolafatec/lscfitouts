export function HeaderBar() {
  const logoSrc = `${import.meta.env.BASE_URL}assets/logo.png`

  return (
    <header className="dashboard-header-shell">
      <div className="header-brand">
        <img
          src={logoSrc}
          alt="LSC Fitouts"
          className="header-logo"
          onError={(event) => {
            event.currentTarget.onerror = null
            event.currentTarget.src = 'assets/logo.png'
          }}
        />
        <div className="header-copy">
          <strong>LSC Fitouts Client Viewer</strong>
          <span>3D + PDF Dashboard</span>
        </div>
      </div>
      <div className="header-tagline" aria-label="App type">
        Static Dashboard
      </div>
    </header>
  )
}
