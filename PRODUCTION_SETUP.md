# Production Setup: Local Backend + GitHub Pages

This is the complete setup for production deployment combining GitHub Pages (frontend) with a local backend (comments storage).

## Quick Start (5 minutes)

### 1. Start Backend Server
```bash
cd backend
npm install
node server.js
```
Server runs on `http://localhost:3000/api/comments`

### 2. Configure Frontend API URL
Update `.env.local`:
```env
VITE_COMMENTS_API_URL=http://localhost:3000/api/comments
```

### 3. Build and Deploy to GitHub Pages
```bash
npm run build
npm run deploy
```

### 4. Test
- Open your GitHub Pages URL or local dev server
- Load a 3D model
- Add a comment
- Refresh → comment persists ✓

## Files Added/Modified

| File | Purpose |
|------|---------|
| `backend/server.js` | Express backend (handles GET/PUT/DELETE) |
| `backend/routes/comments.js` | API endpoints |
| `.env.local` | Environment config (points to backend) |
| `DEPLOYMENT.md` | Full deployment guide with troubleshooting |

## How It Works

**Development:**
```
npm run dev → Backend API → projects/*/comments.xml
```

**Production:**
```
GitHub Pages → Backend API → projects/*/comments.xml (stored on backend server)
```

Same XML format, same code, backend stores files!

## Key Features

✅ **Simple setup** — No third-party services required  
✅ **Full control** — Comments stored on your own server  
✅ **One API** — Same endpoints work locally and production  
✅ **Persistent storage** — XML files saved in projects folder  
✅ **Fallback** — Uses localStorage if API unavailable  

## Environment Variables

| Name | Where | Default | Notes |
|------|-------|---------|-------|
| `VITE_COMMENTS_API_URL` | `.env.local` | (empty = use local) | Set to backend URL |

## Verify Setup

```bash
# Test API directly
curl "http://localhost:3000/api/comments?modelPath=projects/Campervan-bed/glb/model.glb&project=Campervan-bed"

# Should return: 404 (empty) or XML (existing comments)
```

## Support

See `DEPLOYMENT.md` for:
- Detailed step-by-step guide
- Troubleshooting (comments not saving, backend issues)
- API reference with examples

## What's Running Where

| Component | Location | Storage |
|-----------|----------|---------|
| Frontend (viewer.html, viewer.js) | GitHub Pages static | CDN |
| 3D models (*.glb) | GitHub Pages static | CDN |
| Comments (*.xml) | Backend file system | Local storage |
| API logic | Backend Express server | backend/routes/comments.js |

Comments are stored on your backend server with full control and persistence!

