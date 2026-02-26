# Public Repository Publication Blueprint

## Goal
Enable `webterms` to create/update legal files from the web UI and publish final canonical outputs to a public Git repository in a controlled, auditable way.

## Recommended Topology
- `cima-webapp-terms` (this repo): frontend + internal API + legacy processing scripts.
- `cima-legal-publisher-be` (new private repo): publication service responsible for validation, canonicalization, git commits, and PR creation.
- `cima-legal-public-docs` (new public repo): immutable outputs consumed by external apps.

This separates authoring from distribution, avoids exposing write tokens to frontend, and provides release governance.

## End-to-End Flow
1. User uploads/edits a document from `webterms`.
2. Internal API stores file + metadata and creates a `publication_job`.
3. API calls publisher BE (`POST /publish/jobs/:id/run`).
4. Publisher BE:
- loads source file and metadata
- validates schema + naming/version rules
- builds canonical output (`manifest + pdf + metadata`)
- commits changes to a branch (`publish/<job-id>`)
- opens PR against `main` in public repo
5. Public repo CI validates and publishes artifacts.
6. On merge, downstream apps consume from `main` (or tagged release).

## Canonical Output in Public Repo
Recommended tree:

```text
legal-docs/
  manifests/latest.json
  manifests/history/<platform>/<docType>/<lang>.json
  documents/<platform>/<docType>/<lang>/<yyyy-mm-dd>/
    <platform>_<docType>_<yyyy-mm-dd>_<lang>_v###.pdf
    meta.yml
```

Notes:
- Keep `latest.json` machine-first and stable.
- Keep per-document `meta.yml` for audit/reconstruction.
- Avoid storing temporary source drafts in the public repo.

## Minimal Data Model (Publisher BE)

### `documents`
- `id` (uuid, pk)
- `platform` (text, indexed)
- `doc_type` (enum: `terms|privacy|cookie`)
- `lang` (text)
- `effective_date` (date)
- `version` (int)
- `source_storage_key` (text)
- `pdf_storage_key` (text, nullable)
- `sha256` (text)
- `status` (enum: `draft|ready|published|failed`)
- `created_at` / `updated_at`

### `publication_jobs`
- `id` (uuid, pk)
- `document_id` (fk -> documents)
- `target_repo` (text)
- `target_branch` (text)
- `pr_number` (int, nullable)
- `commit_sha` (text, nullable)
- `status` (enum: `queued|running|pr_open|merged|failed`)
- `error_message` (text, nullable)
- `created_by` (text)
- `created_at` / `updated_at`

## Internal API Contract

### Trigger publication
`POST /api/publications/:documentId`

Request:
```json
{
  "target": "public-repo",
  "strategy": "pull-request"
}
```

Response:
```json
{
  "jobId": "uuid",
  "status": "queued"
}
```

### Check publication status
`GET /api/publications/jobs/:jobId`

Response:
```json
{
  "jobId": "uuid",
  "status": "pr_open",
  "prUrl": "https://github.com/<org>/<repo>/pull/123",
  "commitSha": "abc123..."
}
```

## GitHub Actions in Public Repo

### 1) PR validation (`.github/workflows/validate-publication.yml`)
Run on PR for changed legal docs:
- schema validation of `latest.json`
- filename/path convention checks
- checksum uniqueness checks
- optional PDF sanity checks

Example skeleton:

```yaml
name: Validate Publication
on:
  pull_request:
    paths:
      - 'legal-docs/**'

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run validate:legal-docs
```

### 2) Main publish (`.github/workflows/publish-manifest.yml`)
Run on merge to `main`:
- rebuild deterministic `latest.json` (if needed)
- publish static files/pages
- create release/tag (optional)

```yaml
name: Publish Manifest
on:
  push:
    branches: ['main']
    paths:
      - 'legal-docs/**'

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run build:manifest
      - run: npm run publish:pages
```

## Security Model
- Frontend never receives GitHub write credentials.
- Publisher BE uses GitHub App or fine-grained PAT with repo-scoped permissions.
- Branch protection on public repo `main`:
  - required checks: validation workflow
  - at least one reviewer
  - signed commits recommended
- Full traceability via `publication_jobs` table and PR links.

## Merge Policy
- Default: PR-based publication only.
- Direct push disabled to `main`.
- Emergency direct push allowed only for maintainer role + incident ticket.
- Version conflict policy: if same `platform/docType/lang/date/version` exists, fail job with actionable error.

## Consumption by Other Apps
Preferred order:
1. Read `legal-docs/manifests/latest.json` from `main` (or GitHub Pages mirror).
2. Resolve final PDF URL from manifest.
3. Cache by `sha256` and `effective_date`.

If stronger immutability is needed, consume release assets by tag instead of branch raw files.

## Incremental Rollout Plan
1. Keep current local flow as fallback.
2. Introduce `publication_jobs` in current API and add manual trigger endpoint.
3. Build publisher BE in private repo with dry-run mode.
4. Create public repo and CI validations.
5. Enable real PR creation for a pilot platform (`bricks-dev`).
6. Expand to all platforms and disable manual publication.

## Definition of Done
- A document uploaded from webterms can produce a PR in public repo automatically.
- PR validation fails on naming/schema/version errors.
- On merge, downstream app resolves updated file via `latest.json` without manual intervention.
- Every publication has a persisted audit trail (`job`, `commit`, `pr`, `actor`, timestamp).
