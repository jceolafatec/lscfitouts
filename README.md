# LSC Fitouts Client Viewer - Static Dashboard

Static React + Vite dashboard for GitHub Pages.

## Run Commands

```bash
npm run dev
npm run build
npm run preview
npm run deploy
```

## GitHub Pages URL

Configured for deployment under:

- https://jceolafatec.github.io/lscfitouts/

## Share Links

The app reads project tokens from the URL query string:

- ?p=projectId

Example:

- https://jceolafatec.github.io/lscfitouts/?p=project123

## Static Data

All dashboard content is loaded from local files:

- public/data/projects.json
- public/models/*
- public/pdf/*
- public/assets/logo.png

For client-share projects, place files under:

- public/projects/<projectFolder>/glb/*
- public/projects/<projectFolder>/pdf/*

Then set relative paths in projects.json, for example:

- "url": "glb/model.glb"
- "url": "pdf/drawing.pdf"
