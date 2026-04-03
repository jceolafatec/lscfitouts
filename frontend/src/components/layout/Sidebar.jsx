export function Sidebar({ project, activeTab, onTabChange }) {
  return (
    <aside className="dashboard-sidebar" aria-label="Project sidebar">
      <h2>Project Info</h2>
      <dl className="project-details">
        <dt>Client</dt>
        <dd>{project?.client || 'N/A'}</dd>

        <dt>Address</dt>
        <dd>{project?.address || 'N/A'}</dd>

        <dt>Status</dt>
        <dd>{project?.status || 'N/A'}</dd>
      </dl>

      <nav className="sidebar-nav" aria-label="Viewer navigation">
        <button className={activeTab === '3d' ? 'active' : ''} onClick={() => onTabChange('3d')}>
          3D Model
        </button>
        <button className={activeTab === 'pdf' ? 'active' : ''} onClick={() => onTabChange('pdf')}>
          Shop Drawings
        </button>
        <button disabled>Files</button>
        <button disabled>Notes</button>
      </nav>
    </aside>
  )
}
