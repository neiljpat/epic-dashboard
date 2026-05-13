# EPIC Investment Dashboard

Private portfolio dashboard for El Pen Investment Company LLC members.

## Access

Live URL (after Pages is enabled): `https://<your-github-username>.github.io/epic-dashboard/`

Passcode is shared via separate channel.

## Updating

1. Edit `index.html` directly, or replace it with a newer export from the source workspace.
2. Commit and push:
   ```
   git add index.html
   git commit -m "Update dashboard YYYY-MM-DD"
   git push
   ```
3. GitHub Pages rebuilds automatically within a minute or two.

## Rotating the passcode

The passcode hash is at the top of `index.html` in the `PASSCODE_HASH` constant. To change it:

1. Generate a new SHA-256 hash in your browser console:
   ```js
   crypto.subtle.digest("SHA-256", new TextEncoder().encode("yournewpasscode"))
     .then(h => console.log([...new Uint8Array(h)].map(b=>b.toString(16).padStart(2,'0')).join('')));
   ```
2. Replace `PASSCODE_HASH` in `index.html`.
3. Commit, push, and share the new passcode with members.

## Security note

The passcode gate is client-side only. The dashboard data is embedded in the HTML and could be viewed by anyone who finds the URL and reads the page source. This is fine for a "casual privacy" share with EPIC members, but not real security. For real auth, move to Netlify/Vercel with their password protection features.
