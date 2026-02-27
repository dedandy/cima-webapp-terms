# WebTerms

Frontend Angular per gestione e pubblicazione documenti legali su repository pubblico GitHub.

## Struttura

- `webterms/frontend`: applicazione Angular.
- `webterms/frontend/src/app/pages/documents`: catalogo documenti dal manifest pubblico.
- `webterms/frontend/src/app/pages/official`: vista del `latest.json` pubblico.
- `webterms/frontend/src/app/pages/upload`: upload e publish diretto su GitHub API.

## Architettura attuale

- Nessun backend runtime locale in `webterms`.
- Login e configurazione piattaforme in locale (fallback statico nel FE).
- Documenti e manifest su repo pubblico `dedandy/cima-legal-public-docs`.
- Upload: il frontend crea commit direttamente sul repo usando GitHub token utente.

## Configurazione runtime nel FE

La pagina `Inserimento` salva in `localStorage`:

- URL manifest pubblico
- token GitHub
- owner/repo/branch
- path documenti e path manifest nel repo
- public base URL per download file

Default:

- Manifest URL: `https://raw.githubusercontent.com/dedandy/cima-legal-public-docs/main/legal-docs/manifests/latest.json`
- Repo: `dedandy/cima-legal-public-docs`
- Branch: `main`
- Documents root path: `legal-docs/files`
- Manifest path: `legal-docs/manifests/latest.json`

## Sviluppo locale

Prerequisiti consigliati:

- Node.js LTS pari (20.x o 22.x)
- npm >= 10

Installazione:

```bash
cd webterms/frontend
npm install
```

Avvio:

```bash
npm start
```

Build:

```bash
npm run build
```

Typecheck:

```bash
npx tsc -p tsconfig.app.json --noEmit
```

Nota: con Node dispari (`v25.x`) la build Angular puo' crashare.
