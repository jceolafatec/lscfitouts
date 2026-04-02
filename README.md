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

## Git LFS for GLB Files

This repository tracks GLB files with Git LFS via `.gitattributes`:

- `*.glb filter=lfs diff=lfs merge=lfs -text`
- `*.GLB filter=lfs diff=lfs merge=lfs -text`

Run once per machine:

```bash
brew install git-lfs
git lfs install
```

For already-committed large GLB files, migrate history carefully in a dedicated branch:

```bash
git lfs migrate import --include="*.glb,*.GLB"
```

## External Model URLs (JSON and Metadata)

The app supports external URLs in:

- `public/data/projects.json` model/drawing `url` fields
- `project-meta.xml` drawing attributes (`modelUrl`, `pdfUrl`, `imageUrl`)

Example `projects.json` entry:

```json
{
	"project123": {
		"projectFolder": "byproxy/knobby-pacificfair",
		"models": [{ "name": "Main", "url": "https://cdn.example.com/models/J01.glb" }],
		"drawings": [{ "name": "Set", "url": "https://cdn.example.com/pdf/J01.pdf" }]
	}
}
```

Example `project-meta.xml` entry:

```xml
<projectMeta version="1" clientSlug="byproxy" jobSlug="knobby-pacificfair">
	<clientName>Byproxy</clientName>
	<jobName>Knobby Pacificfair</jobName>
	<drawings>
		<drawing slug="J01" name="J01 Island Gondolas" modelUrl="https://cdn.example.com/models/J01.glb" pdfUrl="https://cdn.example.com/pdf/J01.pdf" />
	</drawings>
</projectMeta>
```

Google Drive note:

- File links are normalized to direct-download format when possible.
- Folder-share links (`/drive/folders/...`) are not a file endpoint and cannot be used directly as a project folder index.
