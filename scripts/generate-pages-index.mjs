#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';

const repoRoot = path.resolve(path.join(new URL(import.meta.url).pathname, '..', '..'));
const latestPath = path.join(repoRoot, 'latest.json');
const siteDir = path.join(repoRoot, '_site');

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function readLatest() {
  try {
    const raw = await fs.readFile(latestPath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
}

async function buildRows(latest, options = {}) {
  const rows = [];
  const seenPdfPaths = new Map();
  const { repoSlug, refName } = options;
  for (const app of Object.keys(latest).sort()) {
    const types = latest[app] || {};
    for (const type of Object.keys(types).sort()) {
      const langs = types[type] || {};
      for (const lang of Object.keys(langs).sort()) {
        const entry = langs[lang];
        let pdfUrl = entry.pdf_release || entry.pdf_path || '';
        if (!entry.pdf_release && entry.pdf_path && repoSlug && refName) {
          const normalizedPath = entry.pdf_path.replace(/\\/g, '/').replace(/^\/+/, '');
          pdfUrl = `https://raw.githubusercontent.com/${repoSlug}/${refName}/${normalizedPath}`;
        }
        let status = 'missing';
        if (entry.pdf_release) {
          status = 'release';
        } else if (entry.pdf_path) {
          if (!seenPdfPaths.has(entry.pdf_path)) {
            const resolved = path.resolve(repoRoot, entry.pdf_path);
            try {
              await fs.access(resolved);
              seenPdfPaths.set(entry.pdf_path, true);
            } catch {
              seenPdfPaths.set(entry.pdf_path, false);
            }
          }
          status = seenPdfPaths.get(entry.pdf_path) ? 'local' : 'missing';
        }
        let platform = app;
        if (platform === 'platforms') {
          const hint = entry.source || entry.pdf_path || '';
          const parts = hint.replace(/\\/g, '/').split('/');
          const idx = parts.indexOf('platforms');
          if (idx >= 0 && parts[idx + 1]) {
            platform = parts[idx + 1];
          } else if (parts[0] === 'release-assets' && parts[1]) {
            platform = parts[1];
          }
        }
        rows.push({
          platform,
          lang,
          version: entry.version || '',
          date: entry.date || '',
          pdf: pdfUrl,
          status
        });
      }
    }
  }
  return rows;
}

async function main() {
  const latest = await readLatest();
  const repoSlug = process.env.GITHUB_REPOSITORY || '';
  const refName =
    process.env.GITHUB_REF_NAME ||
    (process.env.GITHUB_REF ? process.env.GITHUB_REF.split('/').pop() : '') ||
    'main';
  const rows = await buildRows(latest, { repoSlug, refName });

  await fs.mkdir(siteDir, { recursive: true });
  await fs.copyFile(latestPath, path.join(siteDir, 'latest.json')).catch(() => {});

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Latest Legal Documents</title>
    <style>
      :root { color-scheme: light; }
      body { font-family: Arial, sans-serif; margin: 32px; color: #111; }
      h1 { margin: 0 0 8px; font-size: 24px; }
      p { margin: 0 0 24px; color: #555; }
      table { border-collapse: collapse; width: 100%; }
      th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #e1e1e1; }
      th { font-weight: 600; }
      a { color: #0b5fff; text-decoration: none; }
      a:hover { text-decoration: underline; }
    </style>
  </head>
  <body>
    <h1>Latest Legal Documents</h1>
    <p>Auto-generated index of the latest PDFs per platform/language.</p>
    <table>
      <thead>
        <tr>
          <th>Platform</th>
          <th>Lang</th>
          <th>Date</th>
          <th>Version</th>
          <th>PDF</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${
          rows.length
            ? rows
                .map(
                  (row) => `
        <tr>
          <td>${escapeHtml(row.platform)}</td>
          <td>${escapeHtml(row.lang)}</td>
          <td>${escapeHtml(row.date)}</td>
          <td>${escapeHtml(row.version)}</td>
          <td>${row.pdf ? `<a href="${escapeHtml(row.pdf)}">Download</a>` : ''}</td>
          <td>${escapeHtml(row.status)}</td>
        </tr>`
                )
                .join('')
            : '<tr><td colspan="6">No entries available.</td></tr>'
        }
      </tbody>
    </table>
  </body>
</html>`;

  await fs.writeFile(path.join(siteDir, 'index.html'), html);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
