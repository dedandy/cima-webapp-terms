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

function buildRows(latest) {
  const rows = [];
  Object.keys(latest)
    .sort()
    .forEach((app) => {
      const types = latest[app] || {};
      Object.keys(types)
        .sort()
        .forEach((type) => {
          const langs = types[type] || {};
          Object.keys(langs)
            .sort()
            .forEach((lang) => {
              const entry = langs[lang];
              const pdfUrl = entry.pdf_release || entry.pdf_path || '';
              rows.push({
                app,
                type,
                lang,
                version: entry.version || '',
                date: entry.date || '',
                pdf: pdfUrl
              });
            });
        });
    });
  return rows;
}

async function main() {
  const latest = await readLatest();
  const rows = buildRows(latest);

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
    <p>Auto-generated index of the latest PDFs per app/type/language.</p>
    <table>
      <thead>
        <tr>
          <th>App</th>
          <th>Type</th>
          <th>Lang</th>
          <th>Date</th>
          <th>Version</th>
          <th>PDF</th>
        </tr>
      </thead>
      <tbody>
        ${
          rows.length
            ? rows
                .map(
                  (row) => `
        <tr>
          <td>${escapeHtml(row.app)}</td>
          <td>${escapeHtml(row.type)}</td>
          <td>${escapeHtml(row.lang)}</td>
          <td>${escapeHtml(row.date)}</td>
          <td>${escapeHtml(row.version)}</td>
          <td>${row.pdf ? `<a href="${escapeHtml(row.pdf)}">Download</a>` : ''}</td>
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
