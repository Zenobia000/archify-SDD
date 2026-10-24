import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createScratchDirectory } from './helpers/scratch-directory.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'archify/bin/archify.mjs');

function readExample(name) {
  return JSON.parse(fs.readFileSync(path.join(root, 'archify/examples', name), 'utf8'));
}

// Two diagrams: a context-level architecture that drills into a sequence that
// refines it, plus one shared element.
function writePack(directory, edit = () => {}) {
  const context = readExample('web-app.architecture.json');
  const firstNode = context.components[0].id;
  context.meta = {
    ...context.meta,
    output: 'context.html',
    viewpoint: { level: 'business', concern: 'structure', c4_level: 'context' },
    trace: { id: 'context', drills_into: [{ node: firstNode, target: 'calls.html', label: 'Calls' }], elements: { [firstNode]: 'C-10' } },
  };
  const calls = readExample('cache-miss-request.sequence.json');
  calls.meta = {
    ...calls.meta,
    output: 'calls.html',
    viewpoint: { level: 'implementation', concern: 'behavior' },
    trace: { id: 'calls', refines: ['context'] },
  };
  const pack = {
    schema_version: 1,
    pack_type: 'document-pack',
    id: 'sample',
    title: 'Sample <design> pack',
    documents: [
      { id: 'SAD', kind: 'SAD', title: 'Architecture', sections: [{ id: 'SAD-2', title: 'Context', artifacts: ['context'] }] },
      { id: 'SDD', kind: 'SDD', title: 'Design', sections: [{ id: 'SDD-5', title: 'Interactions', artifacts: ['calls'] }] },
    ],
    artifacts: [
      { id: 'context', type: 'architecture', source: 'sources/context.architecture.json', output: 'context.html' },
      { id: 'calls', type: 'sequence', source: 'sources/calls.sequence.json', output: 'calls.html' },
    ],
    elements: [{ id: 'C-10', label: 'Entry point', status: 'current' }],
  };
  edit({ pack, context, calls });
  fs.mkdirSync(path.join(directory, 'sources'), { recursive: true });
  fs.writeFileSync(path.join(directory, 'sources/context.architecture.json'), JSON.stringify(context));
  fs.writeFileSync(path.join(directory, 'sources/calls.sequence.json'), JSON.stringify(calls));
  fs.writeFileSync(path.join(directory, 'sample.pack.json'), JSON.stringify(pack));
  return path.join(directory, 'sample.pack.json');
}

function pack(args) {
  const result = spawnSync(process.execPath, [cli, 'pack', ...args, '--json'], { encoding: 'utf8' });
  return { status: result.status, receipt: JSON.parse(result.stdout), stderr: result.stderr };
}

test('pack render writes every artifact, a manifest with inverse relations, and an index page', () => {
  const directory = createScratchDirectory(path.join(os.tmpdir(), 'archify-pack-'));
  const out = path.join(directory, 'site');
  const { status, receipt, stderr } = pack(['render', writePack(directory), '--out', out]);
  assert.equal(status, 0, stderr || JSON.stringify(receipt.diagnostics));
  assert.equal(receipt.ok, true);
  assert.deepEqual(receipt.artifacts.map((artifact) => [artifact.id, artifact.check]), [['context', true], ['calls', true]]);

  const manifest = JSON.parse(fs.readFileSync(path.join(out, 'pack.manifest.json'), 'utf8'));
  const context = manifest.artifacts.find((artifact) => artifact.id === 'context');
  const calls = manifest.artifacts.find((artifact) => artifact.id === 'calls');
  assert.deepEqual(context.refinedBy, ['calls']);
  assert.deepEqual(calls.drilledFrom, ['context']);
  assert.deepEqual(calls.documents, [{ document: 'SDD', section: 'SDD-5', title: 'Interactions' }]);
  assert.equal(manifest.elements[0].appearsIn[0].artifact, 'context');

  const index = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  assert.match(index, /<title>Sample &lt;design&gt; pack<\/title>/);
  assert.match(index, /href="context\.html" target="_blank"/);
  assert.match(index, /href="calls\.html" target="_blank"/);
  assert.match(index, /Viewpoint matrix/);
  assert.deepEqual([...index.matchAll(/<section class="view"[^>]* data-view="([^"]+)"/g)].map((match) => match[1]), ['overview', 'context', 'calls']);
  assert.equal(fs.readdirSync(out).filter((name) => name.includes('browser-check')).length, 0, 'no receipts beside the artifacts');
  assert.ok(fs.existsSync(path.join(out, 'context.html')));
  assert.match(fs.readFileSync(path.join(out, 'context.html'), 'utf8'), /id="archify-trace-data"/);
});

test('pack validate stops on contracts that cannot hold at any size, each with a stable code', () => {
  const cases = [
    ['pack/missing-artifact', ({ pack: data }) => { data.documents[0].sections[0].artifacts.push('ghost'); }],
    ['pack/refines-cycle', ({ context }) => { context.meta.trace.refines = ['calls']; }],
    ['pack/trace-id-mismatch', ({ calls }) => { calls.meta.trace.id = 'renamed'; }],
    ['pack/unknown-node', ({ calls }) => { calls.meta.trace.drill_from = [{ diagram: 'context', node: 'no-such-node' }]; }],
    ['pack/duplicate-artifact', ({ pack: data }) => { data.artifacts.push({ ...data.artifacts[0] }); }],
    ['pack/schema', ({ pack: data }) => { data.artifacts[0].source = '../escape.json'; }],
  ];
  for (const [code, edit] of cases) {
    const directory = createScratchDirectory(path.join(os.tmpdir(), 'archify-pack-'));
    const { status, receipt } = pack(['validate', writePack(directory, edit)]);
    assert.equal(status, 1, code);
    assert.equal(receipt.ok, false, code);
    assert.ok(receipt.diagnostics.some((entry) => entry.code === code && entry.severity === 'error'), `${code}: ${JSON.stringify(receipt.diagnostics)}`);
  }
});

test('pack validate only warns about things a smaller pack legitimately lacks', () => {
  const cases = [
    ['pack/dangling-reference', ({ calls }) => { calls.meta.trace.refines = ['ghost']; }],
    ['pack/dangling-reference', ({ context }) => { context.meta.trace.drills_into[0].target = 'ghost.html'; }],
    ['pack/orphan-element', ({ pack: data }) => { data.elements.push({ id: 'C-99', label: 'Unused' }); }],
    ['pack/undeclared-element', ({ pack: data }) => { data.elements = []; }],
  ];
  for (const [code, edit] of cases) {
    const directory = createScratchDirectory(path.join(os.tmpdir(), 'archify-pack-'));
    const { status, receipt } = pack(['validate', writePack(directory, edit)]);
    assert.equal(status, 0, `${code}: ${JSON.stringify(receipt.diagnostics)}`);
    assert.equal(receipt.ok, true, code);
    assert.ok(receipt.diagnostics.some((entry) => entry.code === code && entry.severity === 'warning'), `${code}: ${JSON.stringify(receipt.diagnostics)}`);
  }
});

test('the pack page follows the pack locale', () => {
  const directory = createScratchDirectory(path.join(os.tmpdir(), 'archify-pack-'));
  const packPath = writePack(directory, ({ pack: data }) => { data.locale = 'zh-TW'; });
  const out = path.join(directory, 'site');
  const { status, stderr } = pack(['render', packPath, '--out', out]);
  assert.equal(status, 0, stderr);
  const index = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  assert.match(index, /<html lang="zh-TW">/);
  assert.match(index, /視角矩陣/);
});

test('--browser-check gates native diagrams in a real browser and leaves no receipts behind', {
  skip: process.env.ARCHIFY_CHROME ? false : 'Set ARCHIFY_CHROME to run the pack browser gate.',
  timeout: 120000,
}, () => {
  const directory = createScratchDirectory(path.join(os.tmpdir(), 'archify-pack-'));
  const out = path.join(directory, 'site');
  const { status, receipt, stderr } = pack(['render', writePack(directory), '--out', out, '--browser-check']);
  assert.equal(status, 0, stderr || JSON.stringify(receipt.diagnostics));
  assert.deepEqual(receipt.artifacts.map((artifact) => artifact.browserCheck), [true, true]);
  assert.equal(fs.readdirSync(out).filter((name) => name.includes('browser-check')).length, 0);
  assert.equal(JSON.parse(fs.readFileSync(path.join(out, 'pack.manifest.json'), 'utf8')).artifacts[0].browserCheck, true);
});

test('--browser-check is a render option only', () => {
  const directory = createScratchDirectory(path.join(os.tmpdir(), 'archify-pack-'));
  const result = spawnSync(process.execPath, [cli, 'pack', 'validate', writePack(directory), '--browser-check'], { encoding: 'utf8' });
  assert.equal(result.status, 2);
});

test('pack validate accepts a consistent pack without rendering anything', () => {
  const directory = createScratchDirectory(path.join(os.tmpdir(), 'archify-pack-'));
  const { status, receipt } = pack(['validate', writePack(directory)]);
  assert.equal(status, 0, JSON.stringify(receipt.diagnostics));
  assert.deepEqual(receipt.diagnostics, []);
  assert.equal(fs.existsSync(path.join(directory, 'artifacts')), false);
});
