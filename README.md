# CIMA Legal Docs Repository

## IT
Repository per gestire sorgenti WYSIWYG, metadati e asset PDF dei documenti legali (terms/privacy/cookie) per piattaforma e lingua.

### Struttura
- `platforms/<platform>/<doctype>/<lang>/<dd-mm-yyyy>/source/`
  Contiene il file sorgente rinominato con lo standard.
- `platforms/<platform>/<doctype>/<lang>/<dd-mm-yyyy>/meta.yml`
  Metadati per audit, release e tracciabilita.
- `release-assets/<platform>/<doctype>/<lang>/<dd-mm-yyyy>/`
  Contiene i PDF generati (da CI o manualmente).

### Naming (sorgenti e PDF)
Formato:
`<platform>_<doctype>_<dd-mm-yyyy>_<lang>_v###.<ext>`

Esempi:
- `bricks-dev_terms_16-11-2025_it_IT_v001.docx`
- `bricks-dev_terms_16-11-2025_it_IT_v001.pdf`

### Workflow
1. Il team lavora sui file WYSIWYG (Word/Pages/Google Docs) in una cartella condivisa (es. SharePoint) o localmente.
2. I file vengono copiati in `incoming/` (cartella di ingest), senza vincoli di naming.
3. Esegui `node scripts/process-doc.mjs --incoming` per rinomina/versioning, copia nelle cartelle standard e generazione del PDF.
4. Commit del sorgente + `meta.yml` + PDF (se presente) e aggiornamento automatico di `latest.json`.
5. (Opzionale) Creazione Release GitHub con il PDF come asset.

### Automazione PDF (ibrida)
- DOCX: su push a `dev` la GitHub Action converte automaticamente in PDF e committa in `release-assets/`.
- PAGES: conversione manuale (Pages.app), poi salvataggio nel percorso suggerito dallo script.

### Latest per le webapp (JSON)
`latest.json` contiene l’ultima versione per app/type/lang. Le webapp possono leggerlo per risolvere sempre il PDF piu recente.
Se serve rigenerarlo: `node scripts/generate-latest.mjs`.

### Catalogo app (slugs)
Il file `meta/apps.json` viene aggiornato dallo script leggendo il manifest in `vendor/ngx-cima-landing-pages/webpages-manifest.json`
(submodule con sparse checkout). Se non disponibile, usa il fallback remoto o la cache locale.

----


## EN
Repository to manage WYSIWYG sources, metadata, and PDF assets for legal documents (terms/privacy/cookie) per platform and language.

### Structure
- `platforms/<platform>/<doctype>/<lang>/<dd-mm-yyyy>/source/`
  Stores the source file renamed with the standard pattern.
- `platforms/<platform>/<doctype>/<lang>/<dd-mm-yyyy>/meta.yml`
  Metadata for audit, release, and traceability.
- `release-assets/<platform>/<doctype>/<lang>/<dd-mm-yyyy>/`
  Stores generated PDFs (CI or manual).

### Naming (sources and PDFs)
Format:
`<platform>_<doctype>_<dd-mm-yyyy>_<lang>_v###.<ext>`

Examples:
- `bricks-dev_terms_16-11-2025_it_IT_v001.docx`
- `bricks-dev_terms_16-11-2025_it_IT_v001.pdf`

### Workflow
1. The team works on WYSIWYG files (Word/Pages/Google Docs) in a shared folder (e.g., SharePoint) or locally.
2. Copy files into `incoming/` (the ingest folder) with any filename.
3. Run `node scripts/process-doc.mjs --incoming` to rename/version, copy into standard folders, and generate the PDF.
4. Commit the source + `meta.yml` + PDF (if present) and the updated `latest.json`.
5. (Optional) Create a GitHub Release and attach the PDF asset.

### PDF Automation (hybrid)
- DOCX: on push to `dev`, the GitHub Action converts DOCX to PDF and commits under `release-assets/`.
- PAGES: manual export (Pages.app), then save to the path suggested by the script.

### Latest for webapps (JSON)
`latest.json` provides the newest version per app/type/lang so webapps always resolve the latest PDF.
To rebuild it: `node scripts/generate-latest.mjs`.

### App Catalog (slugs)
`meta/apps.json` is refreshed by the script using `vendor/ngx-cima-landing-pages/webpages-manifest.json`
(submodule with sparse checkout). If unavailable, it falls back to the remote URL or cached list.
