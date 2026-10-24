import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createScratchDirectory } from './helpers/scratch-directory.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packsRoot = path.join(repoRoot, 'docs', 'packs');

function normalize(text) {
  return text.replace(/\r\n?/g, '\n');
}

test('reference document packs are fresh renders of their sources', { timeout: 300000 }, () => {
  const outputRoot = createScratchDirectory(path.join(os.tmpdir(), 'archify-packs-'));
  execFileSync(process.execPath, [path.join(repoRoot, 'scripts', 'build-packs.mjs'), outputRoot], { encoding: 'utf8' });

  const packs = fs.readdirSync(path.join(outputRoot, 'packs'));
  assert.ok(packs.includes('careslot'));
  for (const id of packs) {
    const fresh = path.join(outputRoot, 'packs', id, 'artifacts');
    const checkedIn = path.join(packsRoot, id, 'artifacts');
    assert.deepEqual(fs.readdirSync(checkedIn).sort(), fs.readdirSync(fresh).sort(), `${id}: artifact file set`);
    for (const name of fs.readdirSync(fresh)) {
      assert.equal(
        normalize(fs.readFileSync(path.join(checkedIn, name), 'utf8')),
        normalize(fs.readFileSync(path.join(fresh, name), 'utf8')),
        `${id}/${name} is stale; run npm --prefix archify run build:packs`,
      );
    }
  }
});

test('the CareSlot pack covers every viewpoint matrix cell and links every C4 level', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(packsRoot, 'careslot', 'artifacts', 'pack.manifest.json'), 'utf8'));
  for (const level of ['business', 'system', 'implementation']) {
    for (const concern of ['data', 'behavior', 'structure']) {
      assert.ok(manifest.artifacts.some((artifact) => artifact.viewpoint?.level === level && artifact.viewpoint?.concern === concern), `${level}/${concern}`);
    }
  }
  const byC4 = Object.fromEntries(manifest.artifacts.filter((artifact) => artifact.viewpoint?.c4_level)
    .map((artifact) => [artifact.viewpoint.c4_level, artifact]));
  assert.ok(byC4.context.drillsInto.some((link) => link.target === byC4.container.output));
  assert.ok(byC4.container.drillsInto.some((link) => link.target === byC4.component.output));
  assert.ok(byC4.component.drillsInto.some((link) => link.target === byC4.code.output));
  assert.ok(manifest.artifacts.every((artifact) => artifact.check === true), 'every artifact passed its checks');
});
