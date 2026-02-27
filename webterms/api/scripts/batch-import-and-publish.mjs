#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';

function parseArgs(argv) {
  const out = {
    apiBase: process.env.WEBTERMS_API_BASE_URL || 'http://127.0.0.1:8787',
    manifestPath: '',
    token: process.env.WEBTERMS_TOKEN || '',
    dryRun: false,
    onlyPublish: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--manifest') {
      out.manifestPath = argv[i + 1] || '';
      i += 1;
      continue;
    }
    if (arg === '--api-base') {
      out.apiBase = argv[i + 1] || out.apiBase;
      i += 1;
      continue;
    }
    if (arg === '--token') {
      out.token = argv[i + 1] || '';
      i += 1;
      continue;
    }
    if (arg === '--dry-run') {
      out.dryRun = true;
      continue;
    }
    if (arg === '--only-publish') {
      out.onlyPublish = true;
      continue;
    }
  }

  if (!out.manifestPath) {
    throw new Error('Missing --manifest <path-to-manifest.json>');
  }

  return out;
}

async function readJson(filePath) {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

function normalizeApiBase(input) {
  return String(input || '').replace(/\/$/, '');
}

async function httpJson(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reason = body?.error || `HTTP ${response.status}`;
    throw new Error(`${url} -> ${reason}`);
  }
  return body;
}

function validateEntry(entry, index) {
  const required = ['filePath', 'platform', 'docType', 'lang', 'effectiveDate'];
  for (const key of required) {
    if (!String(entry[key] || '').trim()) {
      throw new Error(`Entry ${index}: missing required field '${key}'`);
    }
  }
  if (!['terms', 'privacy', 'cookie'].includes(String(entry.docType).toLowerCase())) {
    throw new Error(`Entry ${index}: docType must be terms|privacy|cookie`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(entry.effectiveDate))) {
    throw new Error(`Entry ${index}: effectiveDate must be YYYY-MM-DD`);
  }
}

async function uploadDocument({ apiBase, token, entry, manifestDir }) {
  const absFilePath = path.isAbsolute(entry.filePath)
    ? entry.filePath
    : path.resolve(manifestDir, entry.filePath);

  const fileBuffer = await readFile(absFilePath);
  const fileName = path.basename(absFilePath);

  const payload = {
    fileName,
    mimeType: String(entry.mimeType || 'application/octet-stream'),
    contentBase64: fileBuffer.toString('base64'),
    platform: String(entry.platform).toLowerCase(),
    line: String(entry.line || '').toLowerCase(),
    docType: String(entry.docType).toLowerCase(),
    lang: String(entry.lang),
    effectiveDate: String(entry.effectiveDate)
  };

  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const body = await httpJson(`${apiBase}/api/documents/upload`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });
  return body.document;
}

async function findLatestDocumentId({ apiBase, entry }) {
  const query = new URLSearchParams({
    platform: String(entry.platform).toLowerCase(),
    docType: String(entry.docType).toLowerCase(),
    lang: String(entry.lang),
    includeDeleted: 'false'
  });
  const body = await httpJson(`${apiBase}/api/documents?${query.toString()}`);
  const candidates = Array.isArray(body.documents) ? body.documents : [];
  const scoped = candidates
    .filter((doc) => String(doc.effectiveDate) === String(entry.effectiveDate))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  if (!scoped.length) {
    throw new Error(`No uploaded document found for ${entry.filePath}`);
  }
  return scoped[0].id;
}

async function createPublication({ apiBase, token, documentId }) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const body = await httpJson(`${apiBase}/api/publications/${documentId}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ target: 'public-repo', strategy: 'pull-request' })
  });
  return body.job;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apiBase = normalizeApiBase(args.apiBase);
  const manifestPath = path.resolve(process.cwd(), args.manifestPath);
  const manifestDir = path.dirname(manifestPath);
  const manifest = await readJson(manifestPath);

  if (!Array.isArray(manifest.documents) || !manifest.documents.length) {
    throw new Error('Manifest must include non-empty documents[]');
  }

  const results = [];
  for (let i = 0; i < manifest.documents.length; i += 1) {
    const entry = manifest.documents[i];
    validateEntry(entry, i);

    const shouldPublish = Boolean(entry.publish);
    const record = {
      filePath: entry.filePath,
      uploadedDocumentId: null,
      publicationJobId: null,
      status: 'pending'
    };

    if (args.dryRun) {
      record.status = shouldPublish ? 'dry-run-upload+publish' : 'dry-run-upload-only';
      results.push(record);
      continue;
    }

    try {
      let documentId = String(entry.documentId || '');

      if (!args.onlyPublish) {
        const doc = await uploadDocument({ apiBase, token: args.token, entry, manifestDir });
        documentId = doc.id;
      } else if (!documentId) {
        documentId = await findLatestDocumentId({ apiBase, entry });
      }

      record.uploadedDocumentId = documentId;

      if (shouldPublish) {
        const job = await createPublication({ apiBase, token: args.token, documentId });
        record.publicationJobId = job.id;
        record.status = 'uploaded+publication-started';
      } else {
        record.status = 'uploaded';
      }
    } catch (error) {
      record.status = `failed: ${error.message}`;
    }

    results.push(record);
  }

  console.log(JSON.stringify({
    apiBase,
    manifestPath,
    dryRun: args.dryRun,
    onlyPublish: args.onlyPublish,
    results
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
