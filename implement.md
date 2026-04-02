Prompt 1 – Project setup, branding, and structure
You are my senior frontend engineer.
Build the base of a fully static React + Vite project for a GitHub Pages dashboard called “LSC Fitouts Client Viewer – 3D + PDF Dashboard”.

Requirements:

Use Vite + React.

Output is static, deployable to GitHub Pages.

No backend, no server, no API calls.

All data will be loaded from local JSON files in /public/data/.

Folder structure to create:

/public

/assets

/models

/pdf

/data

/src

/components

/views

/lib

/styles

Branding (from lscfitouts.com.au):

Colors:

Dark navy/black: #0A0A0A

Gold accent: #C8A45D

White: #FFFFFF

Light grey: #F5F5F5

Typography: use a clean sans-serif (Inter, Montserrat, or Poppins).

Assume logo at /public/assets/logo.png.

Deliverables for this prompt:

vite.config.js configured for GitHub Pages (I will set the base later).

src/main.jsx, src/App.jsx.

A basic layout shell with a header and empty main area.

A theme file (colors + fonts) and basic global styles.

Prompt 2 – Share links and JSON data model
Continue from the existing project.

Implement a static share‑link system using URL tokens and JSON data.

Goal:

The app reads ?p=projectId from the URL.

It loads project data from /public/data/projects.json.

Example share link:

https://<username>.github.io/lscfitouts/?p=project123

Example /public/data/projects.json:

json
{
  "project123": {
    "name": "Shopfitting – JB Hi-Fi",
    "client": "JB Hi-Fi",
    "address": "Sydney NSW",
    "status": "In Progress",
    "models": [
      { "name": "Main Model", "url": "/models/jbhi-fi.glb" }
    ],
    "drawings": [
      { "name": "Plan Set", "url": "/pdf/jbhi-fi.pdf" }
    ]
  }
}
Implement:

A helper loadProjectFromUrl() → reads ?p=projectId.

A helper loadProjectData() → fetch('/data/projects.json').

A ProjectDashboard view that:

Resolves the project from the URL.

Shows a loading state.

If project not found, shows:

“This project link is invalid or expired. Please contact LSC Fitouts.”

Deliverables for this prompt:

public/data/projects.json example.

src/lib/projectData.js (or .ts) with the two helpers.

src/views/ProjectDashboard.jsx wired into App.jsx.

Prompt 3 – Layout, 3D viewer wrapper, and PDF viewer
Continue from the existing project.

Build the dashboard layout, the 3D viewer wrapper, and the PDF viewer.

Dashboard layout:

Header:

Left: LSC logo.

Center: project name + client name.

Right: status badge.

Sidebar:

Project info (address, status, etc.).

Navigation items: “3D Model”, “Shop Drawings” (and placeholders for “Files”, “Notes”).

Main viewer area:

Tab switcher: “3D Viewer” / “PDF Viewer”.

Shows either the 3D viewer or the PDF viewer based on selection.

3D viewer integration:

Create a React component:

<ThreeDViewer modelUrl="..." />

Assume I will copy my existing Three.js viewer logic from github.com/jceolafatec/lscfitouts.

Your job:

Provide a clean wrapper component with a container, toolbar area, and a placeholder where I can plug in my existing Three.js code.

Make it responsive inside the main viewer area.

PDF viewer integration:

Use react-pdf or PDF.js.

Create <PdfViewer fileUrl="..." />.

Features:

Zoom in/out.

Page navigation.

Optional thumbnails.

Show drawing name, revision, and last updated info above the viewer (props or data from project).

Deliverables for this prompt:

src/components/layout/Header.jsx

src/components/layout/Sidebar.jsx

src/components/ThreeDViewer.jsx (wrapper, ready for my Three.js code).

src/components/PdfViewer.jsx.

Updated ProjectDashboard to use these components and tabs.

Prompt 4 – GitHub Pages deployment and base paths
Continue from the existing project.

Configure the project for GitHub Pages deployment under this URL:

https://jceolafatec.github.io/lscfitouts/

Requirements:

Set the Vite base path to /lscfitouts/.

Ensure all static asset paths are compatible with that base.

Implement:

vite.config.js with:

js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/lscfitouts/'
})
Update any hardcoded asset URLs in the example to respect the base (e.g. /lscfitouts/models/... if needed).

Add gh-pages deployment script in package.json:

"build": "vite build"

"deploy": "gh-pages -d dist"

Also output:

A short README section with:

npm run dev

npm run build

npm run preview

npm run deploy

And a note that the app reads ?p=projectId from the URL.