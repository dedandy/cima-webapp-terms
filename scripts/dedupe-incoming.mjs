#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

const repoRoot = path.resolve(path.join(new URL(import.meta.url).pathname, '..', '..'));
const incomingRoot = path.join(repoRoot, 'incoming');

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
}

async function hashFile(filePath) {
  const data = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(data).digest('hex');
}

async function main() {
  if (!(await fileExists(incomingRoot))) {
    console.log('incoming/ does not exist. Nothing to dedupe.');
    return;
  }

  const entries = await fs.readdir(incomingRoot, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  if (!files.length) {
    console.log('incoming/ is empty.');
    return;
  }

  const seenNames = new Set();
  const seenHashes = new Map();
  let removed = 0;

  for (const name of files.sort()) {
    const filePath = path.join(incomingRoot, name);
    if (seenNames.has(name)) {
      await fs.unlink(filePath);
      removed += 1;
      continue;
    }
    seenNames.add(name);

    const hash = await hashFile(filePath);
    if (seenHashes.has(hash)) {
      await fs.unlink(filePath);
      removed += 1;
      continue;
    }
    seenHashes.set(hash, name);
  }

  console.log(`Deduped incoming/: removed ${removed} duplicate file(s).`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
