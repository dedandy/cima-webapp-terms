# CIMA Legal Docs Repository

## IT
Repository per gestire sorgenti WYSIWYG, metadati e asset PDF dei documenti legali (terms/privacy/cookie) per piattaforma e lingua.

### Quick Start
1. Copia i file grezzi in `incoming/`.
2. Esegui `node scripts/process-doc.mjs --incoming`.
3. Verifica `platforms/`, `release-assets/`, `latest.json`, poi fai commit.

### Struttura
- `platforms/<platform>/<doctype>/<lang>/<dd-mm-yyyy>/source/` contiene il file sorgente rinominato con lo standard.
- `platforms/<platform>/<doctype>/<lang>/<dd-mm-yyyy>/meta.yml` contiene metadati per audit, release e tracciabilita'.
- `release-assets/<platform>/<doctype>/<lang>/<dd-mm-yyyy>/` contiene i PDF generati (da CI o manualmente).

### Naming (sorgenti e PDF)
Formato: `<platform>_<doctype>_<dd-mm-yyyy>_<lang>_v###.<ext>`

Esempi:
- `bricks-dev_terms_16-11-2025_it_IT_v001.docx`
- `bricks-dev_terms_16-11-2025_it_IT_v001.pdf`

### Workflow
1. Il team lavora sui file WYSIWYG (Word/Pages/Google Docs) in una cartella condivisa (es. SharePoint) o localmente.
2. I file vengono copiati in `incoming/` (cartella di ingest), senza vincoli di naming.
3. (Opzionale) Esegui `node scripts/dedupe-incoming.mjs` per rimuovere duplicati per nome o contenuto.
4. Esegui `node scripts/process-doc.mjs --incoming` per rinomina/versioning, copia nelle cartelle standard e generazione del PDF.
5. Commit del sorgente + `meta.yml` + PDF (se presente) e aggiornamento automatico di `latest.json`.
6. (Opzionale) Creazione Release GitHub con il PDF come asset.

### Workflow Operativo (Ingest) - Punto per Punto
1. Metti tutti i file grezzi in `incoming/` (DOCX, PAGES, PDF, ecc.).
2. (Opzionale) Deduplica: `node scripts/dedupe-incoming.mjs`.
3. Avvia l’ingest: `node scripts/process-doc.mjs --incoming`.
4. Seleziona il file da processare dalla lista (uno alla volta).
5. Scegli app, tipo documento, lingua.
6. Conferma data e versione suggerite.
7. Se il file è DOCX/PAGES/RTF, lo script prova a generare il PDF automaticamente.
8. Se il file è PDF, lo script lo rinomina e lo sposta senza conversione.
9. Al termine, il file processato viene rimosso dalla lista e puoi proseguire col successivo.
10. Verifica gli output in `platforms/` e `release-assets/`, poi committa (incluso `latest.json`).

### Automazione PDF (ibrida)
- DOCX: su push a `dev` la GitHub Action converte automaticamente in PDF e committa in `release-assets/`.
- PAGES: conversione manuale (Pages.app), poi salvataggio nel percorso suggerito dallo script.

### Latest per le webapp (JSON)
`latest.json` contiene l'ultima versione per app/type/lang. Le webapp possono leggerlo per risolvere sempre il PDF piu' recente.  
Per rigenerarlo: `node scripts/generate-latest.mjs`.

### GitHub Pages (indice PDF + latest.json)
La workflow in `.github/workflows/jekyll-gh-pages.yml` genera un indice HTML e pubblica `latest.json` su GitHub Pages.  
L'indice punta ai PDF via Release asset, quindi i link restano stabili e immutabili.

### Catalogo app (slugs)
Il file `meta/apps.json` viene aggiornato dallo script leggendo il manifest in `vendor/ngx-cima-landing-pages/webpages-manifest.json`
(submodule con sparse checkout). Se non disponibile, usa il fallback remoto o la cache locale.

## EN
Repository to manage WYSIWYG sources, metadata, and PDF assets for legal documents (terms/privacy/cookie) per platform and language.

### Quick Start
1. Drop raw files into `incoming/`.
2. Run `node scripts/process-doc.mjs --incoming`.
3. Verify `platforms/`, `release-assets/`, `latest.json`, then commit.

### Structure
- `platforms/<platform>/<doctype>/<lang>/<dd-mm-yyyy>/source/` stores the source file renamed with the standard pattern.
- `platforms/<platform>/<doctype>/<lang>/<dd-mm-yyyy>/meta.yml` stores metadata for audit, release, and traceability.
- `release-assets/<platform>/<doctype>/<lang>/<dd-mm-yyyy>/` stores generated PDFs (CI or manual).

### Naming (sources and PDFs)
Format: `<platform>_<doctype>_<dd-mm-yyyy>_<lang>_v###.<ext>`

Examples:
- `bricks-dev_terms_16-11-2025_it_IT_v001.docx`
- `bricks-dev_terms_16-11-2025_it_IT_v001.pdf`

### Workflow
1. The team works on WYSIWYG files (Word/Pages/Google Docs) in a shared folder (e.g., SharePoint) or locally.
2. Copy files into `incoming/` (the ingest folder) with any filename.
3. (Optional) Run `node scripts/dedupe-incoming.mjs` to remove duplicate filenames or duplicate content.
4. Run `node scripts/process-doc.mjs --incoming` to rename/version, copy into standard folders, and generate the PDF.
5. Commit the source + `meta.yml` + PDF (if present) and the updated `latest.json`.
6. (Optional) Create a GitHub Release and attach the PDF asset.

### PDF Automation (hybrid)
- DOCX: on push to `dev`, the GitHub Action converts DOCX to PDF and commits under `release-assets/`.
- PAGES: manual export (Pages.app), then save to the path suggested by the script.

### Latest for webapps (JSON)
`latest.json` provides the newest version per app/type/lang so webapps always resolve the latest PDF.  
To rebuild it: `node scripts/generate-latest.mjs`.

### GitHub Pages (PDF index + latest.json)
The workflow in `.github/workflows/jekyll-gh-pages.yml` generates an HTML index and publishes `latest.json` to GitHub Pages.  
The index links to PDFs via Release assets, so URLs stay stable and immutable.

### App Catalog (slugs)
`meta/apps.json` is refreshed by the script using `vendor/ngx-cima-landing-pages/webpages-manifest.json`
(submodule with sparse checkout). If unavailable, it falls back to the remote URL or cached list.
