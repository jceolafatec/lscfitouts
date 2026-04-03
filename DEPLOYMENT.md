# Deployment Guide: Local Backend with Comments API

This guide shows how to deploy the 3D viewer with a local backend for persistent comment storage.

## Architecture

```
Development & Production:
Browser → Local/Remote Backend (/api/comments) → Local filesystem (projects/*/comments.xml)
```

## Step 1: Start Backend Server

### Prerequisites
- Node.js installed
- Repository cloned locally

### Run Backend

```bash
cd backend
npm install
node server.js
```

Server runs on `http://localhost:3000/api/comments`

## Step 2: Configure API URL

Update `.env.local` with your backend URL:

```env
# .env.local
VITE_COMMENTS_API_URL=http://localhost:3000/api/comments
```

For production deployment to different server, update with that server's URL.

**Build:**
```bash
npm run build
```

## Step 3: Run Frontend (Development)

```bash
npm run dev
```

Visit `http://localhost:5173`

1. **Build:**
   ```bash
   npm run build
   ```

2. **Deploy to GitHub Pages (optional):**
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
   - Open your app (local or GitHub Pages)
   - Open a 3D model
   - Add a comment → should save to local backend
   - Refresh page → comment should persist

## Step 4: Verify API Endpoints

Test the API directly:

```bash
# Get comments for a project
curl "http://localhost:3000/api/comments?modelPath=projects/Campervan-bed/glb/model.glb&project=Campervan-bed"

# Response: 404 (no comments yet) or XML content

# Save a comment
curl -X PUT "http://localhost:3000/api/comments?modelPath=projects/Campervan-bed/glb/model.glb&project=Campervan-bed" \
  -H "Content-Type: application/json" \
  -d '{"xml":"<comments>...</comments>"}'

# Delete comments
curl -X DELETE "http://localhost:3000/api/comments?modelPath=projects/Campervan-bed/glb/model.glb&project=Campervan-bed"
```

## Troubleshooting

### Comments not saving

1. **Ensure backend is running:**
   ```bash
   cd backend && node server.js
   ```

2. **Check browser console for errors:**
   - F12 → Console tab
   - Look for network errors to `/api/comments`

3. **Verify API URL in .env.local:**
   ```env
   VITE_COMMENTS_API_URL=http://localhost:3000/api/comments
   ```

4. **Test API directly:**
   ```bash
   curl -v "http://localhost:3000/api/comments?modelPath=projects/Campervan-bed/glb/model.glb&project=Campervan-bed"
   ```

### Backend connection refused

1. **Check port 3000 is not in use:**
   ```bash
   lsof -i :3000
   ```

2. **Restart backend:**
   ```bash
   cd backend && node server.js
   ```

### Comments stored locally

Comments are saved to `projects/<project>/comments.xml` on the backend server filesystem.
Ensure the backend has write permissions to the projects directory.

## API Reference

All endpoints require `modelPath` and `project` query parameters.

### GET /api/comments
Returns XML content or 404 if no comments exist.

```bash
curl "http://localhost:3000/api/comments?modelPath=projects/Campervan-bed/glb/model.glb&project=Campervan-bed"
```

### PUT /api/comments
Save or update comments. Body must be JSON with `xml` field.

```bash
curl -X PUT "http://localhost:3000/api/comments?modelPath=...&project=..." \
  -H "Content-Type: application/json" \
  -d '{"xml":"<comments><comment>...</comment></comments>"}'
```

### DELETE /api/comments
Remove comments for a project.

```bash
curl -X DELETE "http://localhost:3000/api/comments?modelPath=...&project=..."
```

## Storage

Comments save to `projects/<project>/comments.xml` on the backend server:

```bash
npm run dev
# Add comments in viewer
# Check: projects/Campervan-bed/comments.xml exists with saved comments
```

Backups are handled on your backend server filesystem.

## Environment Variables Summary

| Variable | Location | Value | Purpose |
|----------|----------|-------|---------|
| `VITE_COMMENTS_API_URL` | `.env.local` | `http://localhost:3000/api/comments` | Backend API endpoint |

## Next Steps

- Deploy backend to production server
- Set up backup/export comments to JSON
- Implement comment search/filter
- Add team collaboration (comment authors, timestamps)

