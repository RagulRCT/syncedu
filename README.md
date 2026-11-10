# eduSync — browser-only demo (GitHub Pages build)

Static folder: upload the **contents** of this folder to a GitHub repo and serve it with Pages.
No server, no build step, no npm.

## Deploy
1. Create a repo, upload everything in this folder (keep `.nojekyll`; it must sit in the repo root).
2. Settings → Pages → Source: **Deploy from a branch** → `main` / `(root)` → Save.
3. Open `https://<user>.github.io/<repo>/` after ~1 minute.
4. Open `…/selftest.html` on the deployed site: it runs 24 checks of the whole loop and prints PASS/FAIL.

Local test: `python3 -m http.server 8000` in this folder, then http://localhost:8000
(opening index.html via `file://` does not work: Web Workers are blocked).

## Demo logins (shown on the login page too)
| Role | Email | Password |
|---|---|---|
| Learner | learner@demo.edusync.test | demo-pass-123 |
| Employer | hiring@demo.edusync.test | demo-pass-123 |
| Admin | admin@edusync.local | admin-demo-123 |

Tip: open an employer tab and a learner tab side by side; status changes show up live (BroadcastChannel).

## How it works
GitHub Pages is static, so the Node backend is re-implemented in the browser (`engine.js`) behind a `fetch`/`EventSource` shim for the same `/api/*` routes.
SQL runs in SQLite compiled to WebAssembly (`vendor/`, sql.js, MIT) inside a Web Worker that is killed after 2.5 s.
Grading, per-learner datasets, BM25 tutor, Ed25519 credentials (ECDSA P-256 fallback) and the hiring pipeline are ports of the Node app.

## Honest limits
- **Data is per browser** (localStorage). Nothing is shared between visitors; clearing site data wipes it. "Reset demo data" in the footer does this.
- **Credentials verify only in the browser that issued them**: the signing key lives in that browser. Treat this as a demo of the mechanism, not a trust anchor.
- **No security boundary**: everything runs on the client, so a visitor can read or edit their own state. Real deployment needs the Node app (`../edusync-app`).
- Tutor is retrieval-only (no LLM). Retention window is 0 days so the full loop completes in one sitting.
- Google Fonts are loaded from the CDN; without network the system font is used.
- Still true of the product itself: no real learner, employer, hire or revenue exists yet.
