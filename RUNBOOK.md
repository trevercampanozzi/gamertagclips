# GamerTagClips — Runbook (Do This Every Time)

## The only tools you use
- VS Code (edit files)
- Netlify (deploys + rollback)
- GitHub (only to see commits if needed)

Do NOT edit files directly on GitHub.com.

---

## Normal update (safe process)
1. Open VS Code → open the **GAMERTAGCLIPS** folder
2. Make your edits
3. Click **Source Control** (left sidebar)
4. Type a message
5. Click **Commit**
6. Click **Sync/Push**

Netlify will auto-deploy.

---

## If something breaks (fast rollback)
1. Go to Netlify → Site → **Deploys**
2. Find the last working deploy
3. Click it → **Publish deploy**

That instantly restores the site.

---

## Functions (what they are)
These live in: `netlify/functions/`

KEEP:
- `clips-get.js`
- `sync-submissions.js`
- `vote-post.js`

---

## Weekly clip sync (admin only)
This rebuilds the week’s clip list from Netlify Form submissions.

URL:
`/.netlify/functions/sync-submissions?key=YOUR_ADMIN_KEY`

---

## Common issues

### “about:blank” after submitting
Usually means the form action/redirect is wrong or the submit page is missing.
Fix by verifying:
- `submit.html` exists
- the form has `action="/submit"` or correct success redirect

### Thumbnails missing
If the clip was synced before thumbnail logic existed, it may stay blank.
Fix: run sync again AFTER ensuring the clip is newly submitted.

---

## Keys / Environment Variables (Netlify)
These are set in Netlify → Site settings → Environment variables

Required:
- `NETLIFY_SITE_ID`
- `NETLIFY_AUTH_TOKEN`
- `GTC_ADMIN_KEY`