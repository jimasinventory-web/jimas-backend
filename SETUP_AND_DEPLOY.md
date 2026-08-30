# JIMAS — What to Edit & How to Deploy

This guide covers three things:
1. **What you must edit** (database URL, backend link, secrets)
2. **How to push the changes to your GitHub repositories**
3. **How to make Render pick up the changes**

Take it slowly and do it in order. You only do most of this once.

---

## PART 0 — IMPORTANT SECURITY NOTE (please read)

Your old code had your **live database password written inside `index.js`**, and that
file was shared. Anyone who has that old file can read/modify your database. You should
**change (rotate) your database password**:

1. Go to your Render dashboard → your **PostgreSQL** database.
2. Look for the option to **reset / rotate the password** (Render lets you regenerate
   credentials, or you can create a new database and re-run `schema.sql`).
3. Render will give you a **new "External Database URL"**. You'll use that new URL in
   Part 1 below.

If rotating isn't possible right now, at minimum finish the steps below so the password
is no longer stored in your code.

---

## PART 1 — WHAT TO EDIT

### A) The BACKEND: database URL and secrets (now set as environment variables)

You no longer edit these inside `index.js`. Instead you set them on Render.

1. Render dashboard → your **backend Web Service** → **Environment** tab.
2. Add these environment variables:

   | Key               | Value                                                                 |
   |-------------------|-----------------------------------------------------------------------|
   | `DATABASE_URL`    | Your PostgreSQL **External Database URL** from Render.                 |
   | `JWT_SECRET`      | A long random string (see below to generate one).                     |
   | `ALLOWED_ORIGINS` | Your frontend URL, e.g. `https://jimas-frontend.onrender.com`         |

   To generate a strong `JWT_SECRET`, run this on your computer and copy the output:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```

3. Also confirm your backend service settings are:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`  ← (this now works; it was missing before)
   - **Health Check Path:** `/health`

> Local testing only: copy `.env.example` to `.env` and fill in the same values.
> The real `.env` is never committed (it's in `.gitignore`).

### B) The FRONTEND: the backend link

The backend URL is no longer hardcoded. It reads `REACT_APP_API_BASE`.

- **If your backend URL is the same as before**, you don't have to change anything — the
  fallback in the code still points there.
- **If your backend URL is different**, set it in ONE of these ways:
  - On Render (Static Site) → **Environment** → add
    `REACT_APP_API_BASE = https://your-backend-url.onrender.com`, **or**
  - Create a `.env` file in the frontend folder containing:
    ```
    REACT_APP_API_BASE=https://your-backend-url.onrender.com
    ```

> Note: Create React App only reads env variables **at build time**. After changing it,
> you must rebuild/redeploy for it to take effect.

---

## PART 2 — PUSH THE CHANGES TO GITHUB

You already have two repositories on GitHub (one for the backend, one for the frontend).
The cleanest, safest way is to **replace the files in your existing local copy** with the
new files, then commit and push. Do the backend and the frontend **separately**.

### One-time check: is Git installed?
```bash
git --version
```
If that prints a version, you're good. If not, install Git from https://git-scm.com/downloads.

### Step-by-step (do this once for the BACKEND, then repeat for the FRONTEND)

1. **Unzip** the new folder I sent (e.g. `jimas-backend`) somewhere you can find it.

2. **Open a terminal** and go to your **existing local repo** for that project. For example:
   ```bash
   cd path/to/your/jimas-backend
   ```
   (This is the folder that already has a hidden `.git` folder and is connected to GitHub.)
   If you're not sure it's connected, run `git remote -v` — it should show your GitHub URL.

   > Don't have a local clone anymore? Clone it fresh:
   > ```bash
   > git clone https://github.com/YOUR-USERNAME/YOUR-BACKEND-REPO.git
   > cd YOUR-BACKEND-REPO
   > ```

3. **Copy the new files over the old ones.** Copy everything from my `jimas-backend`
   folder into your repo folder, overwriting when asked. (You can just drag-and-drop in
   your file explorer and choose "replace".) Do **not** copy a `node_modules` folder —
   there isn't one in my zip, and there shouldn't be one in Git.

4. **See what changed:**
   ```bash
   git status
   ```
   You'll see the modified files (like `index.js`, `package.json`) and new files
   (`schema.sql`, `.env.example`, etc.).

5. **Stage, commit, and push:**
   ```bash
   git add .
   git commit -m "Harden config, add start script, low-stock endpoint, schema and docs"
   git push
   ```
   If it asks you to log in, use your GitHub username and a **Personal Access Token** as
   the password (GitHub no longer accepts your account password here). You can create a
   token at GitHub → Settings → Developer settings → Personal access tokens.

6. **Repeat steps 1–5 for the FRONTEND** using the `jimas-frontend` folder and its repo.
   A good commit message: `Configurable API URL, low-stock card, responsive polish, PWA branding`.

> **Safety net:** if anything goes wrong before you push, you can undo local changes with
> `git checkout -- .` (discards edits) — nothing is final until you `git push`.

---

## PART 3 — RENDER PICKS UP THE CHANGES

If your Render services are connected to these GitHub repos (the normal setup), then the
moment you `git push`, Render will **automatically start a new deploy**. Watch the
**Logs** tab.

- Backend success looks like: `✅ JIMAS Computers API running on port ...`
- Then open `https://your-backend-url.onrender.com/health` — you should see
  `"database": "Connected"`.
- If the backend log says **`DATABASE_URL is not set`**, go back to Part 1A and add the
  environment variables, then trigger a redeploy (Manual Deploy → Deploy latest commit).

For the frontend Static Site, after the deploy finishes, open your frontend URL, hard-refresh
(Ctrl/Cmd + Shift + R), and log in.

---

## QUICK CHECKLIST

- [ ] Rotated the database password on Render (Part 0)
- [ ] Set `DATABASE_URL`, `JWT_SECRET`, `ALLOWED_ORIGINS` on the backend service (Part 1A)
- [ ] Backend Start Command is `npm start`, health check `/health` (Part 1A)
- [ ] Set `REACT_APP_API_BASE` for the frontend if the backend URL changed (Part 1B)
- [ ] Ran `schema.sql` on the database (only needed for a new/empty database)
- [ ] Pushed backend repo to GitHub (Part 2)
- [ ] Pushed frontend repo to GitHub (Part 2)
- [ ] Confirmed `/health` shows "Connected" and you can log in (Part 3)
