# Google Apps Script Upload System

## How it works — no server to deploy

This system splits into two completely separate parts:

| What | Where it lives | How you deploy it |
|------|---------------|-------------------|
| `Code.gs` | **Google's servers** — never in your repo | One-time copy/paste into script.google.com |
| `upload.js` | **Your GitHub repo** | Normal GitHub push → GitHub Pages |
| `upload-example.html` | **Your GitHub repo** | Normal GitHub push → GitHub Pages |

Your GitHub repo contains **zero server code**. It is 100 % static HTML + JS.
The `Code.gs` file runs on Google's infrastructure for free. You paste it in once.

---

## Step 1 — One-time Google setup (not in GitHub)

### 1a. Create a Drive upload folder

1. Go to [drive.google.com](https://drive.google.com) and create a folder, e.g. `Website Uploads`.
2. Open the folder, look at the URL:
   `https://drive.google.com/drive/folders/XXXXXXXXXXXXXXX`
3. Copy that `XXXXXXXXXXXXXXX` — that is your `DRIVE_FOLDER_ID`.

### 1b. Deploy Apps Script

1. Open [script.google.com](https://script.google.com) → **New project**.
2. Delete the placeholder code and paste the entire contents of `Code.gs`.
3. Set the two constants at the top:
   ```js
   const DRIVE_FOLDER_ID = "PASTE_YOUR_FOLDER_ID_HERE";
   const SHARED_SECRET   = "some-long-random-string-only-you-know";
   ```
4. Click **Deploy → New deployment**:
   - Type: **Web App**
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Click **Deploy** — copy the **Web App URL** shown at the end.

---

## Step 2 — Configure your static frontend (goes in GitHub)

Open `upload-example.html` and set the two variables at the top of the `<script>` block:

```js
var WEB_APP_URL  = "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec";
var SHARED_TOKEN = "some-long-random-string-only-you-know"; // must match Code.gs
```

Push `upload.js` and `upload-example.html` to GitHub. Done.

---

## Step 3 — Embed on any page

Copy `upload.js` to your site and call:

```html
<script src="/upload.js"></script>
<script>
  GASUploader.uploadFile({
    webAppUrl: "https://script.google.com/macros/s/YOUR_ID/exec",
    token: "your-shared-secret",
    file: fileInputElement.files[0]
  }).then(function (result) {
    if (result.success) {
      alert("Uploaded: " + result.fileName);
    } else {
      alert("Error: " + result.message);
    }
  });
</script>
```

---

## Notes

### Code.gs is gitignored — never in your repo
`Code.gs` is listed in `.gitignore` in this folder. Even if you fill it in with real
values it will not be committed. It belongs only on Google's servers.

### Frontend token visibility
Because this is a static GitHub Pages site there is nowhere to hide secrets — the
`WEB_APP_URL` and `SHARED_TOKEN` values you put in `upload-example.html` **will be
visible to anyone who views your page source**. This is an accepted trade-off for
all static-site upload solutions. The token acts as a basic spam deterrent: it stops
random people from bulk-uploading to your Drive, but it is not a substitute for true
auth. For a portfolio contact/file form this level of protection is standard and fine.
If you are receiving sensitive files, consider restricting uploads by file type and
rotating the token periodically.

### File size
Max ~50 MB per upload (Google Apps Script base64 limit).
