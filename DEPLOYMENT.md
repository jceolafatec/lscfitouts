# Deployment Guide: Vercel Blob Storage for Comments API

This guide shows how to deploy the 3D viewer with the Vercel Blob Storage backend for persistent comment storage.

## Architecture

```
Development (npm run dev):
Browser → Vite Middleware (/api/comments) → Local filesystem (projects/*/comments.xml)

Production (GitHub Pages + Vercel):
Browser → Vercel API (/api/comments) → Vercel Blob Storage
```

## Step 1: Deploy to Vercel

### Prerequisites
- Vercel account (free): https://vercel.com
- GitHub repository with this code pushed

### Deploy Steps

1. **Connect to Vercel:**
   ```
   npm install -g vercel
   vercel login
   ```

2. **Deploy from repo root:**
   ```
   vercel
   ```
   - Select "GitHub" as your project source
   - Import your `lscfitouts` repository
   - Accept defaults (Vercel auto-detects Vite + /api functions)
   - Deployment URL will be: `https://lscfitouts.vercel.app`

3. **Enable Blob Storage:**
   - Go to Vercel dashboard → Project Settings
   - Click "Storage" tab
   - Click "Create Database" → "Blob" → "Create Blob Store"
   - This auto-generates `BLOB_READ_WRITE_TOKEN` environment variable

## Step 2: Configure Production API URL

Add your Vercel deployment URL to `.env.production` or `.env.local`:

```env
# .env.local (for local testing of production endpoint)
VITE_COMMENTS_API_URL=https://your-deployment.vercel.app/api/comments
```

Or for GitHub Pages deployment, create `.env.production`:

```env
VITE_COMMENTS_API_URL=https://your-deployment.vercel.app/api/comments
```

**Build with production env:**
```bash
npm run build
```

## Step 3: Deploy to GitHub Pages

1. **Build:**
   ```bash
   npm run build
   ```

2. **Deploy:**
   ```bash
   npm run deploy
   ```

   Or manually push to `gh-pages` branch:
   ```bash
   git add dist -f
   git commit -m "deploy"
   git push origin `git subtree split --prefix dist master`:gh-pages --force
   ```

3. **Verify:**
   - Visit: `https://jceolafatec.github.io/lscfitouts/`
   - Open a 3D model
   - Add a comment → should save to Vercel Blob Storage
   - Refresh page → comment should persist

## Step 4: Verify API Endpoints

Test the API directly:

```bash
# Get comments for a project
curl "https://your-deployment.vercel.app/api/comments?modelPath=projects/Campervan-bed/glb/model.glb&project=Campervan-bed"

# Response: 404 (no comments yet) or XML content

# Save a comment
curl -X PUT "https://your-deployment.vercel.app/api/comments?modelPath=projects/Campervan-bed/glb/model.glb&project=Campervan-bed" \
  -H "Content-Type: application/json" \
  -d '{"xml":"<comments>...</comments>"}'

# Delete comments
curl -X DELETE "https://your-deployment.vercel.app/api/comments?modelPath=projects/Campervan-bed/glb/model.glb&project=Campervan-bed"
```

## Troubleshooting

### Comments not saving in production

1. **Check Vercel Blob token:**
   - Dashboard → Project Settings → Storage
   - Verify `BLOB_READ_WRITE_TOKEN` exists

2. **Check browser console for errors:**
   - F12 → Console tab
   - Look for 403/500 errors from `/api/comments`

3. **Verify env variable:**
   ```bash
   # In vercel dashboard, go to Project Settings > Environment Variables
   # Should see: BLOB_READ_WRITE_TOKEN = [hidden]
   ```

4. **Redeploy if env changed:**
   ```bash
   vercel deploy --prod
   ```

### Development (npm run dev) still works locally

Yes! Local dev uses Vite middleware:
```bash
npm run dev
# Creates comments.xml in projects/<project>/ folder
# Does NOT use Vercel API
```

To test production API locally, set `.env.local`:
```env
VITE_COMMENTS_API_URL=https://your-deployment.vercel.app/api/comments
```

Then rebuild and run preview:
```bash
npm run build
npm run preview
```

## API Reference

All endpoints require `modelPath` and `project` query parameters.

### GET /api/comments
Returns XML content or 404 if no comments exist.

```bash
curl "https://api.example.com/api/comments?modelPath=projects/Campervan-bed/glb/model.glb&project=Campervan-bed"
```

### PUT /api/comments
Save or update comments. Body must be JSON with `xml` field.

```bash
curl -X PUT "https://api.example.com/api/comments?modelPath=...&project=..." \
  -H "Content-Type: application/json" \
  -d '{"xml":"<comments><comment>...</comment></comments>"}'
```

### DELETE /api/comments
Remove comments for a project.

```bash
curl -X DELETE "https://api.example.com/api/comments?modelPath=...&project=..."
```

## Storage Pricing

**Vercel Blob Storage (free tier):**
- 1 GB storage
- Pay as you grow: $0.50 per GB after 1 GB

For your use case (small XML files per project), you'll likely never exceed the free tier.

## Running Locally

Comments save to `projects/<project>/comments.xml`:

```bash
npm run dev
# Add comments in viewer
# Check: projects/Campervan-bed/comments.xml exists
```

## Environment Variables Summary

| Variable | Location | Value | Purpose |
|----------|----------|-------|---------|
| `BLOB_READ_WRITE_TOKEN` | Vercel auto-generated | Secret | Auth for Vercel Blob Storage |
| `VITE_COMMENTS_API_URL` | `.env.local` / `.env.production` | `https://your-deployment.vercel.app/api/comments` | Production API endpoint |

## Next Steps

- Add backup/export comments to JSON
- Implement comment search/filter
- Add team collaboration (comment authors, timestamps)
- Set up monitoring for API errors

