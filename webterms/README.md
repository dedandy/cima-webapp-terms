# WebTerms

Frontend Angular + Bootstrap e API Node minimale per upload/lista documenti legali.

## Cosa include

- FE Angular (`webterms/frontend`) con componenti `html/ts/scss`.
- FE Angular organizzato in `pages/`, `components/`, `services/` (stile infrastruttura-nf).
- Bootstrap integrato nel build Angular.
- Upload multi-file con drag and drop.
- Lista documenti filtrabile (`search/platform/docType/lang/includeDeleted`).
- API minima (`webterms/api`) con:
  - deduplica su hash `sha256`
  - soft delete via `deletedAt`
  - persistenza JSON in `webterms/api/data/db.json`
  - file caricati in `webterms/api/storage/`

## Struttura

- `webterms/frontend`: applicazione Angular.
- `webterms/frontend/src/app/pages/login`: pagina login.
- `webterms/frontend/src/app/pages/documents`: pagina pubblica lista documenti.
- `webterms/frontend/src/app/pages/official`: pagina read-only dei documenti ufficiali (`latest.json`).
- `webterms/frontend/src/app/pages/upload`: pagina inserimento/upload (protetta da login).
- `webterms/frontend/src/app/components/documents-list`: tabella documenti riusabile.
- `webterms/frontend/src/app/services`: `api.service` + `auth.service`.
- `webterms/api`: backend HTTP.
- `webterms/api/data/db.json`: store dei metadati documenti.
- `webterms/api/storage`: archivio file.

## Endpoint API

- `GET /api/health`
- `POST /api/documents/upload`
- `GET /api/documents`
- `DELETE /api/documents/:id`
- `GET /api/documents/:id/download` (download PDF)
- `POST /api/publications/:documentId` (crea job pubblicazione verso repo pubblico)
- `GET /api/publications/jobs/:jobId` (stato job pubblicazione)
- `GET /api/public/latest.json` (manifest pubblico latest)
- `GET /api/public/:docType_:platform_:lang.pdf` (URL pubblico stabile latest)
- `POST /api/mockup/login`
- `GET /api/mockup/config`

Compatibile anche con prefisso path pubblicazione:

- `/webterms/api/...`

PDF pubblici (senza autenticazione):

- `/webterms/api/public/latest.json`
- `/webterms/api/public/{docType}_{platform}_{lang}.pdf`

## Login e configurazioni mockup/infrastruttura

- L'upload richiede autenticazione (`Authorization: Bearer <token>`).
- Il frontend usa:
  - `POST /api/mockup/login` per autenticarsi
  - `GET /api/mockup/config` per leggere linee/piattaforme/configurazioni
  - `GET /api/mockup/me` per validare token/sessione
- Le configurazioni utente e infrastruttura sono centralizzate: senza `MOCKUP_API_BASE_URL`
  gli endpoint auth/config rispondono con errore (`503`).

Variabili ambiente backend opzionali:

- `WEBTERMS_REQUIRE_LOGIN=true|false` (default `true`)
- `MOCKUP_API_BASE_URL` (es. `https://mockup.cimafoundation.org`)
- `MOCKUP_LOGIN_PATH` (default `/auth/login`)
- `MOCKUP_CONFIG_PATH` (default `/config`)
- `MOCKUP_ME_PATH` (default `/auth/me`)
- `MOCKUP_SERVICE_TOKEN` (token tecnico per fetch config)
- `WEBTERMS_CONVERTER_URL` (es. `http://127.0.0.1:3001`, converter Docker)

## Modello dati documento

Ogni record in `documents` contiene:

- `id`
- `originalFileName`
- `storedFileName`
- `mimeType`
- `sizeBytes`
- `sha256`
- `platform`
- `line`
- `docType` (`terms|privacy|cookie`)
- `lang`
- `effectiveDate` (`YYYY-MM-DD`)
- `version`
- `createdAt`
- `updatedAt`
- `deletedAt` (`null` se attivo)

## Sviluppo locale

Prerequisiti consigliati:

- Node.js LTS pari (es. `20.x` o `22.x`)
- npm `>=10`
- Converter PDF:
  - opzionale `soffice` locale, oppure
  - consigliato servizio Docker esterno (Gotenberg) via `WEBTERMS_CONVERTER_URL`

### Converter Docker (consigliato)

Avvio locale/produzione del convertitore:

```bash
cd webterms
docker compose -f docker-compose.converter.yml up -d
```

Configurazione backend:

```bash
cd webterms/api
export WEBTERMS_CONVERTER_URL="http://127.0.0.1:3001"
npm run dev
```

Con questa configurazione, il backend converte DOCX/RTF/ODT ecc. in PDF chiamando il servizio Docker.

Nota: con Node dispari (`v25.x`) la build Angular puo' fallire.

### 1) Installazione dipendenze

```bash
cd webterms/api
npm install

cd ../frontend
npm install
```

### 2) Avvio API

```bash
cd webterms/api
npm run dev
```

API su `http://localhost:8787`.

### 3) Avvio frontend Angular

```bash
cd webterms/frontend
npm start
```

FE su `http://localhost:4200`.

`npm start` usa `proxy.conf.json` quindi le chiamate `api/...` passano automaticamente a `http://localhost:8787`.

Routing FE:

- `/documents` pagina pubblica lista documenti
- `/official-documents` vista ufficiale dei file latest esposti
- `/upload` inserimento documenti (richiede login)
- `/login` autenticazione

## Build produzione frontend

Per pubblicazione sotto path `/webterms/`:

```bash
cd webterms/frontend
npm run build:mockup
```

Output statico:

- `webterms/frontend/dist/frontend/browser/`

## Pubblicazione su https://mockup.cimafoundation.org/webterms/

Assunzione: reverse proxy/web server pubblica contenuti statici su `/webterms/` e inoltra `/webterms/api/*` al processo Node API.

### 1) Deploy frontend

Caricare il contenuto di:

- `webterms/frontend/dist/frontend/browser/`

nella root pubblica del path `/webterms/`.

### 2) Deploy backend API

Eseguire su server:

```bash
cd /percorso/progetto/webterms/api
npm install --omit=dev
PORT=8787 npm start
```

### 3) Configurazione reverse proxy (esempio logico)

- Route statica: `/webterms/*` -> directory frontend build.
- Route API: `/webterms/api/*` -> `http://127.0.0.1:8787/api/*`.

### 4) Verifica post deploy

- `https://mockup.cimafoundation.org/webterms/` apre FE.
- `https://mockup.cimafoundation.org/webterms/api/health` risponde con `{"status":"ok"}`.
- Upload file da UI con drag and drop.
- Lista filtrabile e soft delete funzionanti.
