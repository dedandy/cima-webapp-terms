#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';

const repoRoot = path.resolve(path.join(new URL(import.meta.url).pathname, '..', '..'));
const platformsRoot = path.join(repoRoot, 'platforms');
const latestIndexPath = path.join(repoRoot, 'latest.json');

function parseDateDDMMYYYY(value) {
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

function compareRelease(a, b) {
  const aDate = parseDateDDMMYYYY(a.date);
  const bDate = parseDateDDMMYYYY(b.date);
  if (aDate && bDate && aDate !== bDate) {
    return aDate.localeCompare(bDate);
  }
  const aVer = Number((a.version || '').replace(/[^\d]/g, '')) || 0;
  const bVer = Number((b.version || '').replace(/[^\d]/g, '')) || 0;
  return aVer - bVer;
}

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath)));
    } else if (entry.name === 'meta.yml') {
      files.push(fullPath);
    }
  }
  return files;
}

async function parseMeta(filePath) {
  const raw = await fs.readFile(filePath, 'utf-8');
  const data = {};
  raw.split('\n').forEach((line) => {
    const [key, ...rest] = line.split(':');
    if (!key || !rest.length) return;
    const value = rest.join(':').trim();
    if (value) data[key.trim()] = value;
  });
  return data;
}

async function main() {
  const latest = {};
  let metaFiles = [];
  try {
    metaFiles = await walk(platformsRoot);
  } catch (err) {
    if (err.code === 'ENOENT') {
      await fs.writeFile(latestIndexPath, '{}\n');
      return;
    }
    throw err;
  }

  for (const file of metaFiles) {
    const meta = await parseMeta(file);
    const folder = path.dirname(file);
    const parts = folder.split(path.sep);
    const lang = parts[parts.length - 2];
    const date = parts[parts.length - 1];
    const app = parts[parts.length - 5];
    const type = parts[parts.length - 4];
    if (!app || !type || !lang || !date) continue;

    const sourceDir = path.join(folder, 'source');
    let sourceFile = null;
    try {
      const sources = await fs.readdir(sourceDir);
      sourceFile = sources.find((name) => name.startsWith(`${app}_${type}_${date}_${lang}_${meta.version}`));
    } catch (err) {
      sourceFile = null;
    }

    const pdfPath = path.join('release-assets', app, type, lang, date, `${meta.github_release_tag}.pdf`);
    const entry = {
      app,
      type,
      language: lang,
      date,
      version: meta.version,
      pdf: pdfPath.replace(/\\/g, '/'),
      source: sourceFile ? path.join(folder, 'source', sourceFile).replace(repoRoot, '').replace(/\\/g, '/').replace(/^\/+/, '') : undefined
    };

    latest[app] = latest[app] || {};
    latest[app][type] = latest[app][type] || {};
    const current = latest[app][type][lang];
    if (!current || compareRelease(current, entry) < 0) {
      latest[app][type][lang] = entry;
    }
  }

  await fs.writeFile(latestIndexPath, `${JSON.stringify(latest, null, 2)}\n`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
