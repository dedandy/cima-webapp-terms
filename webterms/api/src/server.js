import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_FILE = path.join(ROOT_DIR, 'data', 'db.json');
const STORAGE_DIR = path.join(ROOT_DIR, 'storage');
const FRONTEND_DIST_DIR = path.resolve(ROOT_DIR, '..', 'frontend', 'dist', 'frontend', 'browser');
const META_APPS_FILE = path.resolve(ROOT_DIR, '..', '..', 'legacy-doc-pipeline', 'meta', 'apps.json');

const PORT = Number(process.env.PORT || 8787);
const REQUIRE_LOGIN = process.env.WEBTERMS_REQUIRE_LOGIN !== 'false';
const DEV_LOGIN_USER = process.env.WEBTERMS_DEV_USER || 'dev';
const DEV_LOGIN_PASS = process.env.WEBTERMS_DEV_PASS || 'dev4portal';
const MOCKUP_API_BASE_URL = process.env.MOCKUP_API_BASE_URL || '';
const MOCKUP_LOGIN_PATH = process.env.MOCKUP_LOGIN_PATH || '/auth/login';
const MOCKUP_CONFIG_PATH = process.env.MOCKUP_CONFIG_PATH || '/config';
const MOCKUP_SERVICE_TOKEN = process.env.MOCKUP_SERVICE_TOKEN || '';
const CONVERTER_URL = process.env.WEBTERMS_CONVERTER_URL || '';
const sessionTokens = new Map();

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

const DOC_TYPES = new Set(['terms', 'privacy', 'cookie']);
const execFileAsync = promisify(execFile);

async function detectConverterHealth() {
  if (CONVERTER_URL) {
    try {
      const healthUrl = `${CONVERTER_URL.replace(/\/$/, '')}/health`;
      const response = await fetch(healthUrl, { method: 'GET' });
      return {
        mode: 'docker',
        configuredUrl: CONVERTER_URL,
        reachable: response.ok
      };
    } catch {
      return {
        mode: 'docker',
        configuredUrl: CONVERTER_URL,
        reachable: false
      };
    }
  }

  try {
    await execFileAsync('soffice', ['--version'], { timeout: 5000 });
    return {
      mode: 'local',
      reachable: true
    };
  } catch {
    return {
      mode: 'none',
      reachable: false
    };
  }
}

async function ensureDataStore() {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.mkdir(STORAGE_DIR, { recursive: true });

  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, JSON.stringify({ documents: [] }, null, 2), 'utf8');
  }
}

async function readDb() {
  const raw = await fs.readFile(DATA_FILE, 'utf8');
  const parsed = JSON.parse(raw || '{}');
  return { documents: Array.isArray(parsed.documents) ? parsed.documents : [] };
}

async function writeDb(db) {
  await fs.writeFile(DATA_FILE, JSON.stringify(db, null, 2), 'utf8');
}

function json(res, statusCode, payload) {
  res.writeHead(statusCode, { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function safeFileName(fileName) {
  return fileName
    .replaceAll(/[^a-zA-Z0-9._-]/g, '-')
    .replaceAll(/-+/g, '-')
    .replaceAll(/^-|-$/g, '')
    .toLowerCase();
}

async function convertToPdfIfNeeded(fileBuffer, originalFileName) {
  const extension = path.extname(originalFileName).toLowerCase();
  if (extension === '.pdf') {
    return { pdfBuffer: fileBuffer, converted: false };
  }

  if (CONVERTER_URL) {
    try {
      const form = new FormData();
      form.append('files', new Blob([fileBuffer]), path.basename(originalFileName));
      const endpoint = `${CONVERTER_URL.replace(/\/$/, '')}/forms/libreoffice/convert`;
      const response = await fetch(endpoint, {
        method: 'POST',
        body: form
      });
      if (!response.ok) {
        throw new Error(`converter_http_${response.status}`);
      }
      const output = Buffer.from(await response.arrayBuffer());
      if (!output.length) {
        throw new Error('empty_pdf');
      }
      return { pdfBuffer: output, converted: true };
    } catch {
      throw new Error('Cannot convert file to PDF via converter service.');
    }
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'webterms-convert-'));
  const tempInputPath = path.join(tempDir, path.basename(originalFileName));
  const baseName = path.basename(originalFileName, extension);
  const tempOutputPath = path.join(tempDir, `${baseName}.pdf`);

  try {
    await fs.writeFile(tempInputPath, fileBuffer);
    await execFileAsync('soffice', [
      '--headless',
      '--convert-to',
      'pdf',
      '--outdir',
      tempDir,
      tempInputPath
    ], { timeout: 120000 });
    const pdfBuffer = await fs.readFile(tempOutputPath);
    return { pdfBuffer, converted: true };
  } catch {
    throw new Error(
      'Cannot convert file to PDF. Configure WEBTERMS_CONVERTER_URL or install LibreOffice (soffice).'
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 25 * 1024 * 1024) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function normalizeDoc(input) {
  const platform = String(input.platform || '').trim().toLowerCase();
  const line = String(input.line || '').trim().toLowerCase();
  const docType = String(input.docType || '').trim().toLowerCase();
  const lang = String(input.lang || '').trim();
  const effectiveDate = String(input.effectiveDate || '').trim();

  if (!platform) {
    throw new Error('platform is required');
  }
  if (!DOC_TYPES.has(docType)) {
    throw new Error('docType must be one of: terms, privacy, cookie');
  }
  if (!lang) {
    throw new Error('lang is required');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
    throw new Error('effectiveDate must be YYYY-MM-DD');
  }

  return { platform, line, docType, lang, effectiveDate };
}

function buildVersion(documents, seed) {
  const matches = documents.filter((doc) => {
    return (
      doc.platform === seed.platform &&
      (doc.line || '') === (seed.line || '') &&
      doc.docType === seed.docType &&
      doc.lang === seed.lang &&
      doc.effectiveDate === seed.effectiveDate
    );
  });
  const maxVersion = matches.reduce((acc, doc) => Math.max(acc, Number(doc.version || 0)), 0);
  return maxVersion + 1;
}

function withComputedFields(doc) {
  return {
    ...doc,
    isDeleted: Boolean(doc.deletedAt)
  };
}

function compareByRecency(a, b) {
  const dateCmp = String(a.effectiveDate || '').localeCompare(String(b.effectiveDate || ''));
  if (dateCmp !== 0) {
    return dateCmp;
  }
  const versionCmp = Number(a.version || 0) - Number(b.version || 0);
  if (versionCmp !== 0) {
    return versionCmp;
  }
  return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
}

function buildPublicLatest(documents) {
  const active = documents.filter((doc) => !doc.deletedAt);
  const latestMap = new Map();
  for (const doc of active) {
    const key = `${doc.platform}|${doc.line || ''}|${doc.docType}|${doc.lang}`;
    const prev = latestMap.get(key);
    if (!prev || compareByRecency(prev, doc) < 0) {
      latestMap.set(key, doc);
    }
  }

  const latest = {};
  for (const doc of latestMap.values()) {
    latest[doc.platform] = latest[doc.platform] || {};
    latest[doc.platform][doc.docType] = latest[doc.platform][doc.docType] || {};
    latest[doc.platform][doc.docType][doc.lang] = {
      id: doc.id,
      line: doc.line || '',
      version: doc.version,
      effectiveDate: doc.effectiveDate,
      sha256: doc.sha256,
      url: `/webterms/api/public/${doc.docType}_${doc.platform}_${doc.lang}.pdf`,
      downloadUrl: `/webterms/api/documents/${doc.id}/download`
    };
  }
  return latest;
}

async function resolvePdfForDocument(db, document) {
  const filePath = path.join(STORAGE_DIR, document.storedFileName);
  const rawBuffer = await fs.readFile(filePath);

  const alreadyPdf =
    String(document.mimeType || '').toLowerCase() === 'application/pdf' &&
    String(document.storedFileName || '').toLowerCase().endsWith('.pdf');
  if (alreadyPdf) {
    return { pdfBuffer: rawBuffer, fileName: document.downloadFileName || 'document.pdf' };
  }

  const conversion = await convertToPdfIfNeeded(rawBuffer, document.originalFileName || document.storedFileName);
  const standardizedBaseName = `${document.docType}_${document.platform}_${document.lang}`;
  const downloadFileName = `${safeFileName(standardizedBaseName)}.pdf`;
  const storedFileName = `${document.id}_${downloadFileName}`;
  const newPath = path.join(STORAGE_DIR, storedFileName);
  await fs.writeFile(newPath, conversion.pdfBuffer);
  if (storedFileName !== document.storedFileName) {
    await fs.rm(filePath, { force: true });
  }

  const now = new Date().toISOString();
  const index = db.documents.findIndex((item) => item.id === document.id);
  const updated = {
    ...document,
    storedFileName,
    downloadFileName,
    originalMimeType: document.originalMimeType || document.mimeType || 'application/octet-stream',
    mimeType: 'application/pdf',
    sizeBytes: conversion.pdfBuffer.byteLength,
    sha256: createHash('sha256').update(conversion.pdfBuffer).digest('hex'),
    convertedToPdf: true,
    updatedAt: now
  };
  db.documents[index] = updated;
  await writeDb(db);

  return { pdfBuffer: conversion.pdfBuffer, fileName: downloadFileName };
}

function filterDocuments(allDocuments, query) {
  return allDocuments.filter((doc) => {
    if (!query.includeDeleted && doc.deletedAt) {
      return false;
    }

    if (query.platform && doc.platform !== query.platform) {
      return false;
    }
    if (query.line && (doc.line || '') !== query.line) {
      return false;
    }
    if (query.docType && doc.docType !== query.docType) {
      return false;
    }
    if (query.lang && doc.lang !== query.lang) {
      return false;
    }
    if (query.search) {
      const haystack = `${doc.originalFileName} ${doc.platform} ${doc.docType} ${doc.lang}`.toLowerCase();
      if (!haystack.includes(query.search)) {
        return false;
      }
    }
    return true;
  });
}

function parseQuery(url) {
  const parsed = new URL(url, 'http://localhost');
  return {
    platform: parsed.searchParams.get('platform')?.trim().toLowerCase() || '',
    line: parsed.searchParams.get('line')?.trim().toLowerCase() || '',
    docType: parsed.searchParams.get('docType')?.trim().toLowerCase() || '',
    lang: parsed.searchParams.get('lang')?.trim() || '',
    search: parsed.searchParams.get('search')?.trim().toLowerCase() || '',
    includeDeleted: parsed.searchParams.get('includeDeleted') === 'true'
  };
}

async function readAppsFallback() {
  try {
    const raw = await fs.readFile(META_APPS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    const apps = Array.isArray(parsed.apps) ? parsed.apps : [];
    return apps.map((item) => ({
      id: String(item.id || '').trim(),
      label: String(item.label || item.id || '').trim()
    }));
  } catch {
    return [];
  }
}

function extractBearerToken(req) {
  const header = String(req.headers.authorization || '');
  if (!header.toLowerCase().startsWith('bearer ')) {
    return '';
  }
  return header.slice(7).trim();
}

function isAuthorized(req) {
  if (!REQUIRE_LOGIN) {
    return true;
  }
  const token = extractBearerToken(req);
  return Boolean(token && sessionTokens.has(token));
}

async function handleMockupLogin(req, res) {
  const payload = await parseBody(req);
  const username = String(payload.username || '').trim();
  const password = String(payload.password || '').trim();

  if (!username || !password) {
    json(res, 400, { error: 'username and password are required' });
    return;
  }

  if (MOCKUP_API_BASE_URL) {
    try {
      const remoteResponse = await fetch(`${MOCKUP_API_BASE_URL}${MOCKUP_LOGIN_PATH}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const body = await remoteResponse.json().catch(() => ({}));
      if (!remoteResponse.ok) {
        json(res, 401, { error: body.error || 'Invalid credentials' });
        return;
      }
      const token =
        String(body.accessToken || body.token || body.jwt || '').trim() || randomUUID();
      sessionTokens.set(token, { username, createdAt: new Date().toISOString() });
      json(res, 200, { token, user: { username }, source: 'mockup' });
      return;
    } catch {
      json(res, 502, { error: 'Mockup login unavailable' });
      return;
    }
  }

  if (username !== DEV_LOGIN_USER || password !== DEV_LOGIN_PASS) {
    json(res, 401, { error: 'Invalid credentials' });
    return;
  }

  const token = randomUUID();
  sessionTokens.set(token, { username, createdAt: new Date().toISOString() });
  json(res, 200, { token, user: { username }, source: 'local-dev' });
}

async function handleMockupConfig(req, res) {
  const fallbackPlatforms = await readAppsFallback();
  const fallbackPayload = {
    lines: [],
    platforms: fallbackPlatforms,
    languages: ['it', 'en', 'fr', 'es', 'pt'],
    source: 'fallback'
  };

  if (!MOCKUP_API_BASE_URL) {
    json(res, 200, fallbackPayload);
    return;
  }

  try {
    const authToken = extractBearerToken(req) || MOCKUP_SERVICE_TOKEN;
    const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};
    const remoteResponse = await fetch(`${MOCKUP_API_BASE_URL}${MOCKUP_CONFIG_PATH}`, {
      headers
    });
    const body = await remoteResponse.json().catch(() => ({}));
    if (!remoteResponse.ok) {
      json(res, 200, fallbackPayload);
      return;
    }

    const remotePlatforms = Array.isArray(body.platforms) ? body.platforms : [];
    const normalizedPlatforms = remotePlatforms
      .map((item) => {
        if (typeof item === 'string') {
          return { id: item, label: item };
        }
        const id = String(item.id || item.slug || item.code || '').trim();
        const label = String(item.label || item.name || id).trim();
        return id ? { id, label } : null;
      })
      .filter(Boolean);

    const remoteLines = Array.isArray(body.lines) ? body.lines.map((line) => String(line)) : [];
    json(res, 200, {
      lines: remoteLines,
      platforms: normalizedPlatforms.length ? normalizedPlatforms : fallbackPlatforms,
      languages: ['it', 'en', 'fr', 'es', 'pt'],
      source: 'mockup'
    });
  } catch {
    json(res, 200, fallbackPayload);
  }
}

async function serveFrontend(res, normalizedPath) {
  const requestPath = normalizedPath === '/' ? '/index.html' : normalizedPath;
  const absolutePath = path.normalize(path.join(FRONTEND_DIST_DIR, requestPath));
  if (!absolutePath.startsWith(FRONTEND_DIST_DIR)) {
    json(res, 400, { error: 'Invalid path' });
    return;
  }

  try {
    const content = await fs.readFile(absolutePath);
    const ext = path.extname(absolutePath).toLowerCase();
    const type =
      ext === '.html'
        ? 'text/html; charset=utf-8'
        : ext === '.css'
          ? 'text/css; charset=utf-8'
          : ext === '.js'
            ? 'application/javascript; charset=utf-8'
            : 'application/octet-stream';
    res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': type });
    res.end(content);
  } catch {
    const fallbackIndex = path.join(FRONTEND_DIST_DIR, 'index.html');
    try {
      const indexContent = await fs.readFile(fallbackIndex);
      res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'text/html; charset=utf-8' });
      res.end(indexContent);
    } catch {
      json(res, 404, { error: 'Frontend build not found. Run: npm run build in webterms/frontend' });
    }
  }
}

async function handleUpload(req, res) {
  if (!isAuthorized(req)) {
    json(res, 401, { error: 'Unauthorized: login required for upload' });
    return;
  }

  const payload = await parseBody(req);
  const fileName = String(payload.fileName || '').trim();
  const contentBase64 = String(payload.contentBase64 || '').trim();

  if (!fileName || !contentBase64) {
    json(res, 400, { error: 'fileName and contentBase64 are required' });
    return;
  }

  let normalized;
  try {
    normalized = normalizeDoc(payload);
  } catch (error) {
    json(res, 400, { error: error.message });
    return;
  }

  let fileBuffer;
  try {
    fileBuffer = Buffer.from(contentBase64, 'base64');
  } catch {
    json(res, 400, { error: 'Invalid base64 payload' });
    return;
  }

  let conversion;
  try {
    conversion = await convertToPdfIfNeeded(fileBuffer, fileName);
  } catch (error) {
    json(res, 422, { error: error.message });
    return;
  }

  const sourceSha256 = createHash('sha256').update(fileBuffer).digest('hex');
  const pdfBuffer = conversion.pdfBuffer;
  const sha256 = createHash('sha256').update(pdfBuffer).digest('hex');
  const db = await readDb();
  const duplicate = db.documents.find((doc) => {
    if (doc.deletedAt) {
      return false;
    }
    const sameScope =
      doc.platform === normalized.platform &&
      (doc.line || '') === (normalized.line || '') &&
      doc.docType === normalized.docType &&
      doc.lang === normalized.lang &&
      doc.effectiveDate === normalized.effectiveDate;
    if (!sameScope) {
      return false;
    }
    const sameSource = doc.sourceSha256 && doc.sourceSha256 === sourceSha256;
    const samePdf = doc.sha256 === sha256;
    return sameSource || samePdf;
  });
  if (duplicate) {
    json(res, 409, {
      error: 'Duplicate document content',
      duplicateDocumentId: duplicate.id
    });
    return;
  }

  const id = randomUUID();
  const standardizedBaseName = `${normalized.docType}_${normalized.platform}_${normalized.lang}`;
  const downloadFileName = `${safeFileName(standardizedBaseName)}.pdf`;
  const storedFileName = `${id}_${downloadFileName}`;
  const storagePath = path.join(STORAGE_DIR, storedFileName);
  await fs.writeFile(storagePath, pdfBuffer);

  const now = new Date().toISOString();
  const version = buildVersion(db.documents, normalized);
  const documentRecord = {
    id,
    originalFileName: fileName,
    downloadFileName,
    storedFileName,
    originalMimeType: String(payload.mimeType || 'application/octet-stream'),
    sourceSha256,
    mimeType: 'application/pdf',
    sizeBytes: pdfBuffer.byteLength,
    sha256,
    platform: normalized.platform,
    line: normalized.line,
    docType: normalized.docType,
    lang: normalized.lang,
    effectiveDate: normalized.effectiveDate,
    version,
    convertedToPdf: conversion.converted,
    createdAt: now,
    updatedAt: now,
    deletedAt: null
  };

  db.documents.push(documentRecord);
  await writeDb(db);

  json(res, 201, { document: withComputedFields(documentRecord) });
}

async function handleList(req, res) {
  const db = await readDb();
  const query = parseQuery(req.url);
  const filtered = filterDocuments(db.documents, query)
    .map(withComputedFields)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  json(res, 200, { documents: filtered });
}

async function handleSoftDelete(req, res, id) {
  const db = await readDb();
  const index = db.documents.findIndex((doc) => doc.id === id);
  if (index < 0) {
    json(res, 404, { error: 'Document not found' });
    return;
  }
  if (db.documents[index].deletedAt) {
    json(res, 200, { document: withComputedFields(db.documents[index]) });
    return;
  }

  const now = new Date().toISOString();
  db.documents[index] = {
    ...db.documents[index],
    updatedAt: now,
    deletedAt: now
  };
  await writeDb(db);
  json(res, 200, { document: withComputedFields(db.documents[index]) });
}

async function handleDownload(req, res, id) {
  const db = await readDb();
  const document = db.documents.find((doc) => doc.id === id);
  if (!document) {
    json(res, 404, { error: 'Document not found' });
    return;
  }

  try {
    const { pdfBuffer, fileName } = await resolvePdfForDocument(db, document);
    res.writeHead(200, {
      ...CORS_HEADERS,
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName || 'document.pdf'}"`
    });
    res.end(pdfBuffer);
  } catch (error) {
    json(res, 422, { error: error.message || 'Stored file not found or cannot be converted to PDF' });
  }
}

async function handlePublicLatest(req, res) {
  const db = await readDb();
  json(res, 200, { latest: buildPublicLatest(db.documents) });
}

async function handlePublicLatestPdf(req, res, platform, docType, lang) {
  const db = await readDb();
  const candidates = db.documents.filter((doc) => {
    return (
      !doc.deletedAt &&
      doc.platform === platform &&
      doc.docType === docType &&
      doc.lang === lang
    );
  });
  if (!candidates.length) {
    json(res, 404, { error: 'No document found for requested scope' });
    return;
  }
  const latestDoc = candidates.sort(compareByRecency).at(-1);
  try {
    const { pdfBuffer, fileName } = await resolvePdfForDocument(db, latestDoc);
    res.writeHead(200, {
      ...CORS_HEADERS,
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${fileName || 'document.pdf'}"`,
      'Cache-Control': 'public, max-age=60'
    });
    res.end(pdfBuffer);
  } catch (error) {
    json(res, 422, { error: error.message || 'Stored file not found or cannot be converted to PDF' });
  }
}

async function handlePublicLatestPdfByName(req, res, fileSlug) {
  const match = /^([a-z0-9_-]+)_([a-z0-9_-]+)_([a-zA-Z_]+)$/.exec(fileSlug);
  if (!match) {
    json(res, 404, { error: 'Invalid public filename format' });
    return;
  }
  const [, docType, platform, lang] = match;
  if (!DOC_TYPES.has(docType)) {
    json(res, 404, { error: 'Invalid docType in public filename' });
    return;
  }
  await handlePublicLatestPdf(req, res, platform, docType, lang);
}

async function requestHandler(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  try {
    const url = new URL(req.url, 'http://localhost');
    const basePath = '/webterms';
    const normalizedPath = url.pathname.startsWith(basePath)
      ? url.pathname.slice(basePath.length) || '/'
      : url.pathname;

    if (req.method === 'GET' && normalizedPath === '/api/health') {
      const converter = await detectConverterHealth();
      json(res, 200, {
        status: 'ok',
        converter
      });
      return;
    }

    if (req.method === 'POST' && normalizedPath === '/api/documents/upload') {
      await handleUpload(req, res);
      return;
    }

    if (req.method === 'POST' && normalizedPath === '/api/mockup/login') {
      await handleMockupLogin(req, res);
      return;
    }

    if (req.method === 'GET' && normalizedPath === '/api/mockup/config') {
      await handleMockupConfig(req, res);
      return;
    }

    if (req.method === 'GET' && normalizedPath === '/api/documents') {
      await handleList(req, res);
      return;
    }

    const deleteMatch = normalizedPath.match(/^\/api\/documents\/([a-zA-Z0-9-]+)$/);
    if (req.method === 'DELETE' && deleteMatch) {
      await handleSoftDelete(req, res, deleteMatch[1]);
      return;
    }

    const downloadMatch = normalizedPath.match(/^\/api\/documents\/([a-zA-Z0-9-]+)\/download$/);
    if (req.method === 'GET' && downloadMatch) {
      await handleDownload(req, res, downloadMatch[1]);
      return;
    }

    if (req.method === 'GET' && normalizedPath === '/api/public/latest.json') {
      await handlePublicLatest(req, res);
      return;
    }

    const publicLatestMatch = normalizedPath.match(
      /^\/api\/public\/([a-zA-Z0-9_-]+)\/(terms|privacy|cookie)\/([a-zA-Z_]+)\.pdf$/
    );
    if (req.method === 'GET' && publicLatestMatch) {
      await handlePublicLatestPdf(
        req,
        res,
        publicLatestMatch[1].toLowerCase(),
        publicLatestMatch[2].toLowerCase(),
        publicLatestMatch[3]
      );
      return;
    }

    const publicLatestByNameMatch = normalizedPath.match(
      /^\/api\/public\/([a-zA-Z0-9_-]+)\.pdf$/
    );
    if (req.method === 'GET' && publicLatestByNameMatch) {
      await handlePublicLatestPdfByName(req, res, publicLatestByNameMatch[1].toLowerCase());
      return;
    }

    if (
      req.method === 'GET' &&
      (normalizedPath === '/' || normalizedPath.startsWith('/src/'))
    ) {
      await serveFrontend(res, normalizedPath);
      return;
    }

    json(res, 404, { error: 'Route not found' });
  } catch (error) {
    json(res, 500, { error: error.message || 'Internal server error' });
  }
}

async function start() {
  await ensureDataStore();
  const server = http.createServer(requestHandler);
  server.listen(PORT, () => {
    console.log(`webterms api listening on http://localhost:${PORT}`);
  });
}

start();
