# Production Setup: Vercel Blob Storage + GitHub Pages

This is the complete setup for production deployment combining GitHub Pages (frontend) with Vercel Blob Storage (comments backend).

## Quick Start (5 minutes)

### 1. Deploy to Vercel
```bash
npm install -g vercel
vercel login
vercel
```
- Select your GitHub repo
- Note your deployment URL: `https://your-app.vercel.app`
- Wait for auto-build to complete

### 2. Enable Blob Storage
- Open Vercel Dashboard → Your Project → Storage
- Click "Create" → Blob
- Copy-paste deployment URL into `.env.local`:

```env
# .env.local
VITE_COMMENTS_API_URL=https://your-app.vercel.app/api/comments
```

### 3. Rebuild and Deploy to GitHub Pages
```bash
npm run build
npm run deploy
```

### 4. Test
- Open your GitHub Pages URL
- Load a 3D model
- Add a comment
- Refresh → comment persists ✓

## Files Added/Modified

| File | Purpose |
|------|---------|
| `api/comments.js` | Vercel serverless function (handles GET/PUT/DELETE) |
| `.env.local` | Environment config (points to Vercel API) |
| `vercel.json` | Vercel deployment config |
| `package.json` | Added `@vercel/blob` dependency |
| `assets/js/viewer.js` | Updated API functions to use env-based endpoint |
| `DEPLOYMENT.md` | Full deployment guide with troubleshooting |

## How It Works

**Development:**
```
npm run dev → Vite middleware → projects/*/comments.xml
```

**Production:**
```
GitHub Pages → Vercel API → Vercel Blob Storage
```

Same XML format, same code, different backend!

## Key Features

✅ **No database setup** — Uses Vercel Blob Storage (managed)  
✅ **Free tier** — 1 GB storage included  
✅ **One API** — Same endpoints work locally and production  
✅ **Instant deploy** — Push to GitHub → Vercel auto-deploys  
✅ **Fallback** — Uses localStorage if API unavailable  

## Environment Variables

| Name | Where | Default | Notes |
|------|-------|---------|-------|
| `VITE_COMMENTS_API_URL` | `.env.local` | (empty = use local) | Set to Vercel URL for production |
| `BLOB_READ_WRITE_TOKEN` | Vercel Project Settings | (auto-generated) | Do not commit this |

## Verify Setup

```bash
# Test API directly
curl "https://your-app.vercel.app/api/comments?modelPath=projects/Campervan-bed/glb/model.glb&project=Campervan-bed"

# Should return: 404 (empty) or XML (existing comments)
```

## Support

See `DEPLOYMENT.md` for:
- Detailed step-by-step guide
- Troubleshooting (comments not saving, env issues)
- API reference with examples
- Local testing of production endpoint

## Next: What's Running Where

| Component | Location | Storage |
|-----------|----------|---------|
| Frontend (viewer.html, viewer.js) | GitHub Pages static | CDN |
| 3D models (*.glb) | GitHub Pages static | CDN |
| Comments (*.xml) | Vercel Blob Storage | Blob API |
| API logic | Vercel Functions | /api/comments.js |

Comments are now **globally accessible** and **persist permanently** on Vercel's infrastructure! 🚀

