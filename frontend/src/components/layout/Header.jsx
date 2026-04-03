import { memo } from 'react'

const logoSrc = `${import.meta.env.BASE_URL}assets/logo.png`

export const Header = memo(function Header({ project, title, subtitle, statusLabel }) {
  return (
    <header className="dashboard-header" aria-label="Project header">
      <div className="header-left">
        <img
          src={logoSrc}
          alt="LSC Fitouts"
          className="header-logo"
          width="148"
          height="37"
          fetchpriority="high"
          decoding="async"
        />
      </div>

      <div className="header-center">
        <h1>{title || project?.name || 'lscfitouts'}</h1>
        <p>{subtitle || project?.client || 'All project folders'}</p>
      </div>

      <div className="header-right">
        <span className="status-badge">{statusLabel || project?.status || 'Dashboard'}</span>
      </div>
    </header>
  )
})
