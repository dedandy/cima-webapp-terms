# Document Processing Helper

`scripts/process-doc.mjs` orchestrates the full lifecycle for a legal document: it renames the editable source, exports/moves the PDF, keeps `meta/manifest.json` in sync, refreshes `index.md`, and validates the target app list against `webpages-manifest.json` from `CIMAFoundation/ngx-cima-landing-pages`.

## Interactive Usage (recommended)
```bash
node scripts/process-doc.mjs
```
Workflow:
1. **Select draft** – choose a file from `sources/` or provide a custom path.
2. **Pick metadata** – the script fetches the latest `slug` list from `meta/apps.json.remote_manifest_url` (fallbacks to the `apps` array) and asks for the app + type (`cookie|privacy|terms`) and language (`it_IT`, `en_GB`, `fr_FR`, ...).
3. **Versioning** – default date comes from the file’s last modified time; version suggestion is the next increment over the current manifest entry for that app/type/lang.
4. **PDF export** – attempts automatic conversion through Pages.app (via AppleScript) for `.pages`, `.doc`, `.docx`, `.rtf`, `.rtfd`. macOS will ask for permission the first time; grant it so the script can open/export the file and save the PDF directly inside `docs/<app>/<type>/`. When conversion isn’t possible (e.g., Pages not installed or unsupported formats like `.gdoc`), you’re prompted for the PDF path—just export it to the suggested destination (or provide another path) and the script will wait until the file appears.
5. **Rename & move** – the original draft is renamed in place using the canonical filename, while copies are written to `sources/<app>/<type>/` and `docs/<app>/<type>/` (same base name, language always last).
6. **Registry update** – `meta/manifest.json` is updated with checksum + metadata, and `index.md` is regenerated from the manifest so the README-style table always reflects the latest PDFs.

## Non-Interactive Mode
Supply every argument explicitly to skip prompts:
```bash
node scripts/process-doc.mjs \
  --app sample-app \
  --type cookie \
  --version v002 \
  --date 2024-07-01 \
  --lang it_IT \
  --src /path/to/draft.docx \
  --pdf /path/to/export.pdf
```

## Auto-stage Updated Files
If you want the generated PDFs, sources, `manifest.json`, `apps.json`, and `index.md` to be staged automatically, run the wrapper script instead:
```bash
scripts/process-doc-with-git.sh
```
It forwards every argument to `process-doc.mjs` and, on success, executes `git add` on the relevant paths.

## Rebuild the Index Only
If you edit `meta/manifest.json` manually, regenerate `index.md` without moving files:
```bash
node scripts/process-doc.mjs --reindex true
```

## Maintaining the App Catalog
- Add/update the `vendor/ngx-cima-landing-pages` submodule (sparse checkout works well) so `vendor/ngx-cima-landing-pages/webpages-manifest.json` exists locally.
- The script first parses that local manifest, extracts all `slug` values, and rewrites the `apps` array inside `meta/apps.json`—this keeps the cache current and lets the prompts work offline.
- If the local file is missing, the script falls back to `remote_manifest_url` inside `meta/apps.json` (defaulting to the same GitHub raw URL). When both sources fail, the cached `apps` array in `meta/apps.json` is used, so commit that file after successful syncs to share the latest list with teammates.
