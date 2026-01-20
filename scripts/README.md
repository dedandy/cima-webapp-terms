# Document Processing Helper

`scripts/process-doc.mjs` orchestrates the full lifecycle for a legal document: it renames the editable source, exports/moves the PDF, writes `meta.yml` for each version, and validates the target app list against `webpages-manifest.json` from `CIMAFoundation/ngx-cima-landing-pages`.

## Interactive Usage (recommended)
```bash
node scripts/process-doc.mjs
```
Workflow:
1. **Select draft** – choose a file under `platforms/` or provide a custom path. To process shared files, place them under `incoming/` and run `node scripts/process-doc.mjs --incoming`.
2. **Pick metadata** – the script fetches the latest `slug` list from `meta/apps.json.remote_manifest_url` (fallbacks to the `apps` array) and asks for the app + type (`cookie|privacy|terms`) and language (`it_IT`, `en_GB`, `fr_FR`, ...).
3. **Versioning** – default date comes from the file’s last modified time; version suggestion is the next increment over the current manifest entry for that app/type/lang.
4. **PDF export** – attempts automatic conversion through Pages.app (via AppleScript) for `.pages`, `.doc`, `.docx`, `.rtf`, `.rtfd`. macOS will ask for permission the first time; grant it so the script can open/export the file and save the PDF directly inside `release-assets/<app>/<type>/<lang>/<date>/`. When conversion isn’t possible (e.g., Pages not installed or unsupported formats like `.gdoc`), you’re prompted for the PDF path—just export it to the suggested destination (or provide another path) and the script will wait until the file appears.
5. **Rename & copy** – the original draft is renamed in place using the canonical filename, and a copy is written to `platforms/<app>/<type>/<lang>/<date>/source/` (same base name, language always last).
6. **Metadata update** – a `meta.yml` file is created/updated under `platforms/<app>/<type>/<lang>/<date>/` to record the version, dates, and release tag/asset name.
7. **Latest index** – `latest.json` is updated so webapps can resolve the newest PDF per app/type/lang.

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
If you want the generated PDFs, sources, `apps.json`, and metadata to be staged automatically, run the wrapper script instead:
```bash
scripts/process-doc-with-git.sh
```
It forwards every argument to `process-doc.mjs` and, on success, executes `git add` on the relevant paths.

## Latest Index (JSON)
`latest.json` is the machine-friendly registry for webapps. If you need to rebuild it from disk:
```bash
node scripts/generate-latest.mjs
```

## Dedupe Incoming
When you drag multiple files into `incoming/`, you can remove duplicates before processing:
```bash
node scripts/dedupe-incoming.mjs
```
It removes duplicate filenames and duplicate file contents (SHA-256), keeping the first occurrence.

## Rebuild the Index Only
This workflow no longer uses `meta/manifest.json` or `index.md`; metadata is stored per document in `meta.yml`.

## Maintaining the App Catalog
- Add/update the `vendor/ngx-cima-landing-pages` submodule (sparse checkout works well) so `vendor/ngx-cima-landing-pages/webpages-manifest.json` exists locally.
- The script first parses that local manifest, extracts all `slug` values, and rewrites the `apps` array inside `meta/apps.json`—this keeps the cache current and lets the prompts work offline.
- If the local file is missing, the script falls back to `remote_manifest_url` inside `meta/apps.json` (defaulting to the same GitHub raw URL). When both sources fail, the cached `apps` array in `meta/apps.json` is used, so commit that file after successful syncs to share the latest list with teammates.

## DOCX Auto-PDF (CI)
On push to `dev`, the GitHub Action in `.github/workflows/convert-docx-pdf.yml` converts any `platforms/**/source/*.docx` into PDFs under `release-assets/<app>/<type>/<lang>/<date>/`. The action commits the PDFs back to the branch with a `[skip pdf]` marker to avoid infinite loops. `.pages` files are excluded and must be exported manually.

## GitHub Pages Index
The workflow `.github/workflows/jekyll-gh-pages.yml` generates `latest.json` and a static HTML index under `_site/`, then publishes them to GitHub Pages. The index links to each PDF using the release URL when available.
