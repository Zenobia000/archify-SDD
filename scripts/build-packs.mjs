#!/usr/bin/env node

// Render every reference document pack under docs/packs/<id>/<id>.pack.json
// into <output-root>/packs/<id>/artifacts. Sources always come from the
// repository; the output root defaults to docs/ and may be a temporary
// directory for freshness checks.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sameLocation } from '../archify/renderers/shared/path-semantics.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packsRoot = path.join(repoRoot, 'docs', 'packs');
const outputRoot = path.resolve(process.argv[2] || path.join(repoRoot, 'docs'));
const cli = path.join(repoRoot, 'archify', 'bin', 'archify.mjs');

const packs = fs.readdirSync(packsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(packsRoot, entry.name, `${entry.name}.pack.json`))
  .filter((file) => fs.existsSync(file))
  .sort();

for (const sourcePack of packs) {
  const id = path.basename(path.dirname(sourcePack));
  const packDir = path.join(outputRoot, 'packs', id);
  const outDir = path.join(packDir, 'artifacts');
  // Explainers record their source relative to the output, so a render
  // elsewhere mirrors the pack beside its artifacts to keep bytes identical.
  const sourceDir = path.dirname(sourcePack);
  if (sameLocation(packDir, sourceDir).status !== 'match') {
    fs.rmSync(packDir, { recursive: true, force: true });
    fs.mkdirSync(packDir, { recursive: true });
    for (const entry of fs.readdirSync(sourceDir)) {
      if (entry !== 'artifacts') fs.cpSync(path.join(sourceDir, entry), path.join(packDir, entry), { recursive: true });
    }
  }
  const packPath = path.join(packDir, `${id}.pack.json`);
  fs.rmSync(outDir, { recursive: true, force: true });
  let receipt;
  try {
    receipt = JSON.parse(execFileSync(process.execPath, [cli, 'pack', 'render', packPath, '--out', outDir, '--json'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    }));
  } catch (error) {
    const failed = (() => { try { return JSON.parse(error.stdout); } catch { return null; } })();
    for (const entry of failed?.diagnostics || []) console.error(`[${entry.code}] ${entry.message}`);
    throw new Error(`pack ${id} failed to render`);
  }
  console.log(`pack ${id}: ${receipt.artifacts.length} artifacts`);
}
