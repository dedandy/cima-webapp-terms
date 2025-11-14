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
const manifestPath = path.join(repoRoot, 'meta', 'manifest.json');
const appsPath = path.join(repoRoot, 'meta', 'apps.json');
const indexPath = path.join(repoRoot, 'index.md');
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
  const baseDir = path.join(repoRoot, 'sources');
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

async function loadAppCatalog() {
  let config = { apps: [] };
  try {
    const raw = await fs.readFile(appsPath, 'utf-8');
    config = JSON.parse(raw);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  let fallback = config.apps && config.apps.length ? config.apps : [{ id: 'sample-app', label: 'Sample App' }];
  let remote = [];
  if (config.remote_manifest_url) {
    try {
      const data = await fetchJson(config.remote_manifest_url);
      remote = extractRemoteApps(data);
      if (remote.length) {
        config.apps = remote;
        await saveAppsConfig(config);
        fallback = remote;
      } else {
        console.warn('Remote manifest fetched but no slugs found. Falling back to local list.');
      }
    } catch (err) {
      console.warn(`Unable to fetch remote apps: ${err.message}. Using local fallback list.`);
    }
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
  const idx = parts.indexOf('sources');
  if (idx >= 0 && parts.length > idx + 1) {
    return parts[idx + 1];
  }
  if (parts.length) return parts[0];
  return 'sample-app';
}

function formatDateISO(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function nextVersion(currentVersion) {
  if (!currentVersion) return 'v001';
  const match = /^v(\d+)$/.exec(currentVersion);
  if (!match) return 'v001';
  const next = Number(match[1]) + 1;
  return `v${String(next).padStart(3, '0')}`;
}

async function readManifest() {
  try {
    const raw = await fs.readFile(manifestPath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { generated_at: new Date().toISOString(), documents: [] };
    }
    throw err;
  }
}

async function writeManifest(manifest) {
  manifest.generated_at = new Date().toISOString();
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

function suggestVersion(manifest, app, type, lang) {
  const documents = manifest.documents || [];
  const match = documents.find((doc) => doc.app === app && doc.type === type && doc.language === lang);
  if (!match) return 'v001';
  return nextVersion(match.version);
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
    const manual = await ask('No files found inside sources/. Provide path to the source file', '');
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

async function convertToPdf(sourcePath, tempPdfPath) {
  return new Promise((resolve, reject) => {
    const child = execFile('textutil', ['-convert', 'pdf', sourcePath, '-output', tempPdfPath], (error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
    child.on('error', reject);
  });
}

async function obtainPdf(sourcePath) {
  const { ext, dir, name } = path.parse(sourcePath);
  const manualNeeded = ext === '.pages';
  if (!manualNeeded) {
    try {
      const tempPdf = path.join(dir, `${name}.pdf`);
      await convertToPdf(sourcePath, tempPdf);
      console.log(`PDF generated via textutil -> ${tempPdf}`);
      return tempPdf;
    } catch (err) {
      console.log('Automatic PDF conversion failed. Please provide an exported PDF.');
    }
  } else {
    console.log('Pages files cannot be auto-converted. Please export a PDF manually first.');
  }
  const manualPath = await ask('Path to the exported PDF', '');
  if (!manualPath) {
    throw new Error('PDF path is required.');
  }
  const resolved = path.resolve(manualPath);
  await fs.access(resolved);
  return resolved;
}

async function updateManifest(manifest, entry) {
  const documents = manifest.documents || [];
  const idx = documents.findIndex((doc) => doc.app === entry.app && doc.type === entry.type && doc.language === entry.language);
  if (idx >= 0) {
    documents[idx] = entry;
  } else {
    documents.push(entry);
  }
  manifest.documents = documents;
  await writeManifest(manifest);
}

async function interactiveFlow(manifest, apps) {
  const sources = await gatherSourceFiles();
  const relativeSource = await promptForSourceFile(sources);
  const absSource = path.isAbsolute(relativeSource) ? relativeSource : path.resolve(repoRoot, relativeSource);
  const stats = await fs.stat(absSource);
  const inferredType = inferTypeFromPath(relativeSource);
  const inferredApp = inferAppFromPath(relativeSource);
  const app = await chooseFromList('Select app/web-app', apps.map((app) => ({ label: `${app.label} (${app.id})`, value: app.id })), inferredApp);
  const type = await chooseFromList('Select document type', docTypes.map((value) => ({ label: value, value })), inferredType);
  const lang = await chooseFromList('Select language', defaultLanguages.map((value) => ({ label: value, value })), defaultLanguages[0]);
  const dateDefault = formatDateISO(stats.mtime);
  const date = await ask('Release date (YYYY-MM-DD)', dateDefault);
  const version = await ask('Version', suggestVersion(manifest, app, type, lang));
  const pdfPath = await obtainPdf(absSource);
  const args = { app, type, version, date, lang, src: absSource, pdf: path.resolve(pdfPath) };
  await processDocument(args, manifest, apps);
}

async function movePreserving(from, to) {
  const resolvedFrom = path.resolve(from);
  const resolvedTo = path.resolve(to);
  if (resolvedFrom === resolvedTo) return;
  await ensureDir(path.dirname(resolvedTo));
  try {
    await fs.rename(resolvedFrom, resolvedTo);
  } catch (err) {
    if (err.code === 'EXDEV') {
      await fs.copyFile(resolvedFrom, resolvedTo);
      await fs.unlink(resolvedFrom);
    } else {
      throw err;
    }
  }
}

async function writeIndexFromManifest(manifest, apps) {
  const documents = manifest.documents || [];
  const appMap = new Map(apps.map((app) => [app.id, app.label || app.id]));
  const grouped = new Map();
  documents.forEach((doc) => {
    if (!grouped.has(doc.app)) grouped.set(doc.app, []);
    grouped.get(doc.app).push(doc);
  });
  const header = `# Legal Document Index\n\nThis file is auto-generated. File naming pattern: \`app_type_v###_YYYY-MM-DD_lang.ext\` with language trailing. PDFs live in \`docs/<app>/<type>/\`, sources in \`sources/<app>/<type>/\`. Run \`node scripts/process-doc.mjs --reindex true\` to rebuild.`;
  const sections = [];
  const appIds = Array.from(grouped.keys()).sort();
  appIds.forEach((appId) => {
    const label = appMap.get(appId) || appId;
    const docs = grouped.get(appId).sort((a, b) => {
      if (a.type !== b.type) return a.type.localeCompare(b.type);
      if (a.language !== b.language) return a.language.localeCompare(b.language);
      return b.version.localeCompare(a.version);
    });
    const rows = docs
      .map(
        (doc) =>
          `| ${doc.type} | ${doc.version} | ${doc.released_on} | ${doc.language} | [PDF](${doc.pdf_path}) | [Source](${doc.source_path}) |`
      )
      .join('\n');
    const table = rows || '| _ | _ | _ | _ | _ | _ |';
    sections.push(
      `## ${label} (${appId})\n\n| Type | Version | Date | Language | PDF Link | Source Link |\n|------|---------|------|----------|----------|-------------|\n${table}`
    );
  });
  if (!sections.length) {
    sections.push('_No documents published yet._');
  }
  const content = `${header}\n\n${sections.join('\n\n')}\n`;
  await fs.writeFile(indexPath, content);
}

async function processDocument(args, manifest, apps) {
  const { app, type, version, date, lang } = args;
  const baseName = `${app}_${type}_${version}_${date}_${lang}`;
  const sourceExt = path.extname(args.src) || '.docx';
  const targetSourceDir = path.join(repoRoot, 'sources', app, type);
  const targetDocsDir = path.join(repoRoot, 'docs', app, type);
  const targetSourcePath = path.join(targetSourceDir, `${baseName}${sourceExt}`);
  const targetPdfPath = path.join(targetDocsDir, `${baseName}.pdf`);

  await ensureDir(targetSourceDir);
  await ensureDir(targetDocsDir);
  await movePreserving(args.src, targetSourcePath);
  await movePreserving(args.pdf, targetPdfPath);

  const checksum = await computeChecksum(targetPdfPath);
  const entry = {
    app,
    type,
    language: lang,
    version,
    released_on: date,
    filename: path.basename(targetPdfPath),
    pdf_path: path.relative(repoRoot, targetPdfPath).replace(/\\/g, '/'),
    source_path: path.relative(repoRoot, targetSourcePath).replace(/\\/g, '/'),
    checksum
  };
  await updateManifest(manifest, entry);
  await writeIndexFromManifest(manifest, apps);
  console.log('\nUpdated files:');
  console.log(`- Source: ${entry.source_path}`);
  console.log(`- PDF   : ${entry.pdf_path}`);
  console.log('- manifest.json refreshed');
  console.log('- index.md regenerated');
}

async function main() {
  const args = parseArgs();
  const manifest = await readManifest();
  const apps = await loadAppCatalog();

  if (args.reindex) {
    await writeIndexFromManifest(manifest, apps);
    console.log('index.md regenerated from manifest.');
    return;
  }

  const required = ['app', 'type', 'version', 'date', 'lang', 'src', 'pdf'];
  const isNonInteractive = required.every((key) => args[key]);

  if (isNonInteractive) {
    args.src = path.resolve(args.src);
    args.pdf = path.resolve(args.pdf);
    await processDocument(args, manifest, apps);
  } else {
    await interactiveFlow(manifest, apps);
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
