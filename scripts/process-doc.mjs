#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import https from 'https';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import { execFile } from 'child_process';

const repoRoot = path.resolve(path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const appsPath = path.join(repoRoot, 'meta', 'apps.json');
const localManifestPath = path.join(repoRoot, 'vendor', 'ngx-cima-landing-pages', 'webpages-manifest.json');
const pagesConvertibleExt = new Set(['.pages', '.doc', '.docx', '.rtf', '.rtfd']);
let pagesAvailabilityCache = null;
const platformsRoot = path.join(repoRoot, 'platforms');
const releaseAssetsRoot = path.join(repoRoot, 'release-assets');
const defaultLanguages = ['it_IT', 'en_GB', 'en_EN', 'fr_FR'];
const docTypes = ['terms', 'privacy', 'cookie'];

const rl = createInterface({ input, output });

function parseArgs() {
  const args = {};
  for (let i = 2; i < process.argv.length; i++) {
    const token = process.argv[i];
    if (!token.startsWith('--')) continue;
    const [rawKey, inlineValue] = token.slice(2).split('=');
    if (inlineValue !== undefined) {
      args[rawKey] = inlineValue === 'true' ? true : inlineValue === 'false' ? false : inlineValue;
      continue;
    }
    const next = process.argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[rawKey] = true;
      continue;
    }
    args[rawKey] = next;
    i += 1;
  }
  return args;
}

async function ask(question, defaultValue) {
  const suffix = defaultValue ? ` (${defaultValue})` : '';
  const answer = (await rl.question(`${question}${suffix}: `)).trim();
  return answer || defaultValue;
}

async function chooseFromList(prompt, options, defaultValue) {
  const defaultIndex = defaultValue ? options.findIndex((o) => o.value === defaultValue) : 0;
  const safeDefault = defaultIndex >= 0 ? defaultIndex + 1 : 1;
  options.forEach((option, index) => {
    const marker = index === defaultIndex ? '*' : ' ';
    console.log(`[${index + 1}]${marker} ${option.label}`);
  });
  const raw = await ask(`${prompt} (1-${options.length})`, String(safeDefault));
  const idx = Number(raw) - 1;
  if (Number.isNaN(idx) || idx < 0 || idx >= options.length) {
    console.log('Invalid selection. Please try again.');
    return chooseFromList(prompt, options, defaultValue);
  }
  return options[idx].value;
}

async function gatherSourceFiles() {
  const files = [];
  const baseDir = path.join(repoRoot, 'platforms');
  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else {
        files.push(path.relative(repoRoot, fullPath));
      }
    }
  }

  try {
    await walk(baseDir);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  return files.sort();
}

async function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`Request failed with status ${res.statusCode}`));
          res.resume();
          return;
        }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (err) {
            reject(err);
          }
        });
      })
      .on('error', reject);
  });
}

function extractRemoteApps(payload) {
  const candidates = [];
  if (Array.isArray(payload)) candidates.push(payload);
  if (payload && Array.isArray(payload.webpages)) candidates.push(payload.webpages);
  if (payload && Array.isArray(payload.pages)) candidates.push(payload.pages);
  const source = candidates.find((list) => list.length);
  if (!source) return [];
  return source
    .map((item) => {
      const slug = item.slug || item.id || item.name;
      if (!slug) return null;
      const label = item.title || item.name || slug;
      return { id: slug, label };
    })
    .filter(Boolean);
}

async function saveAppsConfig(config) {
  await fs.writeFile(appsPath, `${JSON.stringify(config, null, 2)}\n`);
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
}

async function loadAppCatalog() {
  let config = { apps: [] };
  try {
    const raw = await fs.readFile(appsPath, 'utf-8');
    config = JSON.parse(raw);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  let fallback = config.apps && config.apps.length ? config.apps : [{ id: 'sample-app', label: 'Sample App' }];
  let resolvedApps = [];

  if (await fileExists(localManifestPath)) {
    try {
      const raw = await fs.readFile(localManifestPath, 'utf-8');
      const data = JSON.parse(raw);
      resolvedApps = extractRemoteApps(data);
      if (!resolvedApps.length) {
        console.warn('Local webpages-manifest.json found but no slugs extracted.');
      }
    } catch (err) {
      console.warn(`Failed to parse local webpages-manifest.json: ${err.message}`);
    }
  }

  if (!resolvedApps.length && config.remote_manifest_url) {
    try {
      const data = await fetchJson(config.remote_manifest_url);
      resolvedApps = extractRemoteApps(data);
      if (!resolvedApps.length) {
        console.warn('Remote manifest fetched but no slugs found.');
      }
    } catch (err) {
      console.warn(`Unable to fetch remote apps: ${err.message}.`);
    }
  }

  if (resolvedApps.length) {
    config.apps = resolvedApps;
    fallback = resolvedApps;
    await saveAppsConfig(config);
  }

  if (!fallback.length) {
    fallback = [{ id: 'sample-app', label: 'Sample App' }];
  }

  const unique = new Map();
  fallback.forEach((app) => {
    if (!app || !app.id) return;
    unique.set(app.id, { id: app.id, label: app.label || app.id });
  });
  return Array.from(unique.values()).sort((a, b) => a.id.localeCompare(b.id));
}

function inferTypeFromPath(relativePath) {
  const parts = relativePath.split(path.sep);
  const maybeType = parts.find((part) => docTypes.includes(part));
  return maybeType || docTypes[0];
}

function inferAppFromPath(relativePath) {
  const parts = relativePath.split(path.sep);
  const idx = parts.indexOf('platforms');
  if (idx >= 0 && parts.length > idx + 1) {
    return parts[idx + 1];
  }
  if (parts.length) return parts[0];
  return 'sample-app';
}

function formatDateISO(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function formatDateDDMMYYYY(date = new Date()) {
  const iso = formatDateISO(date);
  const [year, month, day] = iso.split('-');
  return `${day}-${month}-${year}`;
}

function nextVersion(currentVersion) {
  if (!currentVersion) return 'v001';
  const match = /^v(\d+)$/.exec(currentVersion);
  if (!match) return 'v001';
  const next = Number(match[1]) + 1;
  return `v${String(next).padStart(3, '0')}`;
}

async function suggestVersion(app, type, lang, date) {
  const sourceDir = path.join(platformsRoot, app, type, lang, date, 'source');
  try {
    const entries = await fs.readdir(sourceDir);
    const versions = entries
      .map((name) => {
        const match = name.match(/_v(\d{3})\./);
        return match ? `v${match[1]}` : null;
      })
      .filter(Boolean);
    if (!versions.length) return 'v001';
    const latest = versions.sort().pop();
    return nextVersion(latest);
  } catch (err) {
    if (err.code === 'ENOENT') return 'v001';
    throw err;
  }
}

async function computeChecksum(filePath) {
  const data = await fs.readFile(filePath);
  return `sha256:${crypto.createHash('sha256').update(data).digest('hex')}`;
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function moveFile(from, to) {
  await ensureDir(path.dirname(to));
  await fs.rename(from, to);
}

async function promptForSourceFile(existingSources) {
  if (!existingSources.length) {
    const manual = await ask('No files found inside platforms/. Provide path to the source file', '');
    if (!manual) throw new Error('Source file is required');
    return manual;
  }
  const options = [
    ...existingSources.map((file) => ({ label: file, value: file })),
    { label: '[Other] Enter custom path', value: null }
  ];
  const selection = await chooseFromList('Select the source file to process', options, options[0].value);
  if (selection) return selection;
  const manual = await ask('Manual path to source file', '');
  if (!manual) throw new Error('Source file is required');
  return manual;
}

function escapeForAppleScript(value) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function convertPagesToPdf(sourcePath, targetPdfPath) {
  await ensureDir(path.dirname(targetPdfPath));
  const script = `set sourceFile to POSIX file "${escapeForAppleScript(sourcePath)}"\nset destFile to POSIX file "${escapeForAppleScript(targetPdfPath)}"\ntell application \"Pages\"\n  set docRef to open sourceFile\n  export docRef to destFile as PDF\n  close docRef saving no\nend tell`;
  return new Promise((resolve, reject) => {
    const child = execFile('osascript', ['-e', script], (error, stdout, stderr) => {
      if (error) {
        const message = stderr?.trim() || error.message;
        reject(new Error(message));
      } else {
        resolve();
      }
    });
    child.on('error', reject);
  });
}

async function isPagesAvailable() {
  if (pagesAvailabilityCache !== null) return pagesAvailabilityCache;
  if (process.platform !== 'darwin') {
    pagesAvailabilityCache = false;
    return pagesAvailabilityCache;
  }
  pagesAvailabilityCache = await new Promise((resolve) => {
    const child = execFile('osascript', ['-e', 'id of application "Pages"'], (error) => {
      resolve(!error);
    });
    child.on('error', () => resolve(false));
  });
  return pagesAvailabilityCache;
}

async function tryAutoConversion(sourcePath, preferredOutputPath) {
  const ext = path.extname(sourcePath).toLowerCase();
  if (!pagesConvertibleExt.has(ext)) return false;
  if (!(await isPagesAvailable())) {
    if (process.platform === 'darwin') {
      console.log('Pages.app not detected. Launch Pages at least once to enable automatic exports.');
    }
    return false;
  }
  try {
    await convertPagesToPdf(sourcePath, preferredOutputPath);
    console.log(`PDF generated via Pages automation -> ${preferredOutputPath}`);
    return true;
  } catch (err) {
    console.log(`Automatic Pages export failed (${err.message}).`);
    return false;
  }
}

async function promptForPdfPath(initialPath) {
  let current = initialPath;
  while (true) {
    const manualPathInput = await ask(
      'Path to the exported PDF (export now, then press Enter to re-check)',
      current
    );
    if (!manualPathInput) {
      throw new Error('PDF path is required.');
    }
    const resolved = path.isAbsolute(manualPathInput)
      ? manualPathInput
      : path.resolve(repoRoot, manualPathInput);
    if (await fileExists(resolved)) {
      return resolved;
    }
    console.log(`File not found: ${resolved}`);
    console.log('Save the PDF to that path, then press Enter to try again or provide a different path.');
    current = manualPathInput;
  }
}

async function obtainPdf(sourcePath, preferredOutputPath) {
  if (await tryAutoConversion(sourcePath, preferredOutputPath)) {
    return preferredOutputPath;
  }
  await ensureDir(path.dirname(preferredOutputPath));
  console.log(`Please export the PDF manually to: ${preferredOutputPath}`);
  return promptForPdfPath(preferredOutputPath);
}

function buildBaseName(app, type, date, lang, version) {
  return `${app}_${type}_${date}_${lang}_${version}`;
}

async function writeMetaFile(folder, data) {
  const lines = [
    `platform: ${data.platform}`,
    `document_type: ${data.document_type}`,
    `language: ${data.language}`,
    '',
    `version: ${data.version}`,
    `drafted_on: ${data.drafted_on}`,
    'effective_from:',
    '',
    'author:',
    'reviewed_by:',
    '',
    `github_release_tag: ${data.github_release_tag}`,
    `github_release_asset: ${data.github_release_asset}`,
    '',
    'notes:'
  ];
  await fs.writeFile(path.join(folder, 'meta.yml'), `${lines.join('\n')}\n`);
}

async function interactiveFlow(apps) {
  const sources = await gatherSourceFiles();
  const relativeSource = await promptForSourceFile(sources);
  const absSource = path.isAbsolute(relativeSource) ? relativeSource : path.resolve(repoRoot, relativeSource);
  const stats = await fs.stat(absSource);
  const inferredType = inferTypeFromPath(relativeSource);
  const inferredApp = inferAppFromPath(relativeSource);
  const app = await chooseFromList('Select app/web-app', apps.map((app) => ({ label: `${app.label} (${app.id})`, value: app.id })), inferredApp);
  const type = await chooseFromList('Select document type', docTypes.map((value) => ({ label: value, value })), inferredType);
  const lang = await chooseFromList('Select language', defaultLanguages.map((value) => ({ label: value, value })), defaultLanguages[0]);
  const dateDefault = formatDateDDMMYYYY(stats.mtime);
  const date = await ask('Document date (DD-MM-YYYY)', dateDefault);
  const version = await ask('Version (v001, v002, ...)', await suggestVersion(app, type, lang, date));
  const baseName = buildBaseName(app, type, date, lang, version);
  const targetDocsDir = path.join(releaseAssetsRoot, app, type, lang, date);
  const preferredPdfPath = path.join(targetDocsDir, `${baseName}.pdf`);
  const pdfPath = await obtainPdf(absSource, preferredPdfPath);
  const args = { app, type, version, date, lang, src: absSource, pdf: path.resolve(pdfPath), baseName };
  await processDocument(args, apps);
}

async function copyPreserving(from, to) {
  const resolvedFrom = path.resolve(from);
  const resolvedTo = path.resolve(to);
  if (resolvedFrom === resolvedTo) return;
  await ensureDir(path.dirname(resolvedTo));
  await fs.copyFile(resolvedFrom, resolvedTo);
}

async function renameOriginalSource(originalPath, baseName) {
  const resolved = path.resolve(originalPath);
  const dir = path.dirname(resolved);
  const ext = path.extname(resolved);
  const target = path.join(dir, `${baseName}${ext || '.docx'}`);
  if (target === resolved) return;
  try {
    await fs.access(target);
    console.log(`Original source rename skipped because ${path.relative(repoRoot, target)} already exists.`);
    return;
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  await fs.rename(resolved, target);
  console.log(`Original source renamed to ${path.relative(repoRoot, target)}`);
}

async function processDocument(args, apps) {
  const { app, type, version, date, lang } = args;
  const baseName = args.baseName || buildBaseName(app, type, date, lang, version);
  const sourceExt = path.extname(args.src) || '.docx';
  const targetSourceDir = path.join(platformsRoot, app, type, lang, date, 'source');
  const targetDocsDir = path.join(releaseAssetsRoot, app, type, lang, date);
  const targetSourcePath = path.join(targetSourceDir, `${baseName}${sourceExt}`);
  const targetPdfPath = path.join(targetDocsDir, `${baseName}.pdf`);

  await ensureDir(targetSourceDir);
  await ensureDir(targetDocsDir);
  await copyPreserving(args.src, targetSourcePath);
  await copyPreserving(args.pdf, targetPdfPath);
  await renameOriginalSource(args.src, baseName);

  const meta = {
    platform: app,
    document_type: type,
    language: lang,
    version,
    drafted_on: date,
    github_release_tag: baseName,
    github_release_asset: `${baseName}.pdf`
  };
  await writeMetaFile(path.join(platformsRoot, app, type, lang, date), meta);
  console.log('\nUpdated files:');
  console.log(`- Source: ${path.relative(repoRoot, targetSourcePath)}`);
  console.log(`- PDF   : ${path.relative(repoRoot, targetPdfPath)}`);
  console.log('- meta.yml updated');
}

async function main() {
  const args = parseArgs();
  const apps = await loadAppCatalog();

  const required = ['app', 'type', 'version', 'date', 'lang', 'src', 'pdf'];
  const isNonInteractive = required.every((key) => args[key]);

  if (isNonInteractive) {
    args.src = path.resolve(args.src);
    args.pdf = path.resolve(args.pdf);
    await processDocument(args, apps);
  } else {
    await interactiveFlow(apps);
  }
}

main()
  .catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  })
  .finally(() => {
    rl.close();
  });
