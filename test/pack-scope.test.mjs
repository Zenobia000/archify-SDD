import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createScratchDirectory } from './helpers/scratch-directory.mjs';

// A pack is what was asked for. These tests build packs from a single sample
// architecture and check that any subset renders, that links light up when a
// neighbour is added, and that the C4 levels a pack holds still nest.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'archify/bin/archify.mjs');
const base = JSON.parse(fs.readFileSync(path.join(root, 'archify/examples/web-app.architecture.json'), 'utf8'));
const nodes = base.components.map((component) => component.id);

function diagram(id, c4, trace = {}) {
  const copy = structuredClone(base);
  copy.meta = { ...copy.meta, title: `${id} diagram`, output: `${id}.html`, viewpoint: { level: 'system', concern: 'structure', c4_level: c4 }, trace: { id, ...trace } };
  return copy;
}

function build(diagrams, { elements = [], locale } = {}) {
  const directory = createScratchDirectory(path.join(os.tmpdir(), 'archify-scope-'));
  fs.mkdirSync(path.join(directory, 'sources'), { recursive: true });
  for (const [id, source] of Object.entries(diagrams)) fs.writeFileSync(path.join(directory, `sources/${id}.architecture.json`), JSON.stringify(source));
  const ids = Object.keys(diagrams);
  fs.writeFileSync(path.join(directory, 'scope.pack.json'), JSON.stringify({
    schema_version: 1, pack_type: 'document-pack', id: 'scope', title: 'Scope', ...(locale ? { locale } : {}),
    documents: [{ id: 'SAD', kind: 'SAD', title: 'SAD', sections: [{ id: 'SAD-2', title: 'Structure', artifacts: ids }] }],
    artifacts: ids.map((id) => ({ id, type: 'architecture', source: `sources/${id}.architecture.json` })),
    elements,
  }));
  return directory;
}

function pack(directory, ...args) {
  const result = spawnSync(process.execPath, [cli, 'pack', ...args, path.join(directory, 'scope.pack.json'), '--json'], { encoding: 'utf8' });
  return { status: result.status, receipt: JSON.parse(result.stdout) };
}
const codes = (receipt) => receipt.diagnostics.map((entry) => entry.code);

test('a diagram written for a larger set stands alone: absent neighbours become one warning', () => {
  const directory = build({
    containers: diagram('containers', 'container', {
      refines: ['context'],
      drills_into: [{ node: nodes[0], target: 'components.html' }],
      elements: { [nodes[0]]: 'C-10' },
    }),
  });
  const out = path.join(directory, 'site');
  const { status, receipt } = pack(directory, 'render', '--out', out);
  assert.equal(status, 0, JSON.stringify(receipt.diagnostics));
  assert.deepEqual(codes(receipt).sort(), ['pack/dangling-reference', 'pack/undeclared-element']);
  assert.equal(receipt.diagnostics.filter((entry) => entry.code === 'pack/dangling-reference').length, 1, 'one warning per diagram, not per link');

  const html = fs.readFileSync(path.join(out, 'containers.html'), 'utf8');
  const island = JSON.parse(html.match(/<script id="archify-trace-data"[^>]*>([^<]*)<\/script>/)[1]);
  assert.deepEqual(island.trace.refines, undefined, 'the link to a diagram that does not exist is not shipped');
  assert.deepEqual(island.trace.drills_into, undefined);
  const manifest = JSON.parse(fs.readFileSync(path.join(out, 'pack.manifest.json'), 'utf8'));
  assert.equal(manifest.elements[0].label, base.components[0].label, 'an unregistered element is traced under its node label');
  assert.equal(manifest.elements[0].declared, false);
});

test('drill_from links a new detail diagram without editing the abstract one', () => {
  const context = diagram('context', 'context');
  const containers = diagram('containers', 'container', { drill_from: [{ diagram: 'context', node: nodes[0], focus: nodes[1] }] });
  const directory = build({ context, containers });
  const out = path.join(directory, 'site');
  const { status, receipt } = pack(directory, 'render', '--out', out);
  assert.equal(status, 0, JSON.stringify(receipt.diagnostics));
  assert.deepEqual(codes(receipt), [], 'a navigable pair raises nothing');

  const manifest = JSON.parse(fs.readFileSync(path.join(out, 'pack.manifest.json'), 'utf8'));
  const parent = manifest.artifacts.find((artifact) => artifact.id === 'context');
  const child = manifest.artifacts.find((artifact) => artifact.id === 'containers');
  assert.deepEqual(parent.drillsInto, [{ node: nodes[0], target: 'containers.html', focus: nodes[1], label: 'containers diagram' }]);
  assert.deepEqual(parent.refinedBy, ['containers']);
  assert.deepEqual(child.refines, ['context']);
  assert.deepEqual(child.drilledFrom, ['context']);

  // The abstract diagram's own page now carries the link, though its source never named it.
  const island = JSON.parse(fs.readFileSync(path.join(out, 'context.html'), 'utf8').match(/<script id="archify-trace-data"[^>]*>([^<]*)<\/script>/)[1]);
  assert.deepEqual(island.trace.drills_into, parent.drillsInto);
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'sources/context.architecture.json'), 'utf8')).meta.trace.drills_into, undefined, 'the source is untouched');
});

test('C4 levels nest: skipped levels, extra parents and links nobody opens are warnings', () => {
  const skipped = build({ context: diagram('context', 'context'), components: diagram('components', 'component', { refines: ['context'] }) });
  assert.deepEqual(codes(pack(skipped, 'validate').receipt).sort(), ['pack/c4-level-skip']);

  const unreachable = build({ context: diagram('context', 'context'), containers: diagram('containers', 'container', { refines: ['context'] }) });
  const reported = pack(unreachable, 'validate').receipt;
  assert.deepEqual(codes(reported), ['pack/c4-not-navigable']);
  assert.match(reported.diagnostics[0].supportedFixes[0], /drill_from/);

  const twoParents = build({
    context: diagram('context', 'context'),
    other: diagram('other', 'context'),
    containers: diagram('containers', 'container', { drill_from: [{ diagram: 'context', node: nodes[0] }, { diagram: 'other', node: nodes[0] }] }),
  });
  assert.ok(codes(pack(twoParents, 'validate').receipt).includes('pack/c4-multiple-parents'));

  const ambiguous = build({
    context: diagram('context', 'context'),
    a: diagram('a', 'container', { drill_from: [{ diagram: 'context', node: nodes[0] }] }),
    b: diagram('b', 'container', { drill_from: [{ diagram: 'context', node: nodes[0] }] }),
  });
  assert.ok(codes(pack(ambiguous, 'validate').receipt).includes('pack/c4-ambiguous-drill'));
});

test('absent C4 levels are never reported and a lone level is a valid pack', () => {
  for (const level of ['context', 'container', 'component', 'code']) {
    const { status, receipt } = pack(build({ only: diagram('only', level) }), 'validate');
    assert.equal(status, 0, level);
    assert.deepEqual(receipt.diagnostics, [], level);
  }
  // L2 with only some containers opening an L3 is normal.
  const partial = build({
    containers: diagram('containers', 'container'),
    components: diagram('components', 'component', { drill_from: [{ diagram: 'containers', node: nodes[0] }] }),
  });
  assert.deepEqual(pack(partial, 'validate').receipt.diagnostics, []);
});

test('deployment is an alternate view of the containers, not a level below them', () => {
  const directory = build({
    containers: diagram('containers', 'container'),
    components: diagram('components', 'component', { drill_from: [{ diagram: 'containers', node: nodes[0] }] }),
    deployment: diagram('deployment', 'deployment', { refines: ['containers'] }),
  });
  const out = path.join(directory, 'site');
  const { status, receipt } = pack(directory, 'render', '--out', out);
  assert.equal(status, 0, JSON.stringify(receipt.diagnostics));
  assert.deepEqual(codes(receipt), []);
  const manifest = JSON.parse(fs.readFileSync(path.join(out, 'pack.manifest.json'), 'utf8'));
  const [containers, , deployment] = ['containers', 'components', 'deployment'].map((id) => manifest.artifacts.find((artifact) => artifact.id === id));
  assert.deepEqual(containers.refinedBy, ['components'], 'only the zoom-in is a child');
  assert.deepEqual(containers.views, ['deployment']);
  assert.deepEqual(deployment.viewOf, ['containers']);
  assert.deepEqual(deployment.refines, []);

  const index = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  assert.match(index, /<li class="view-item">[^]*data-nav="deployment"[^]*<span class="view-tag">view<\/span>/);
  assert.match(index, /<h2>A view of<\/h2>/);
  assert.match(index, /<h2 class="sub">Alternate views<\/h2>/);

  // A deployment that refines a component, or anything but containers, is flagged.
  const wrong = build({ components: diagram('components', 'component'), deployment: diagram('deployment', 'deployment', { refines: ['components'] }) });
  assert.deepEqual(codes(pack(wrong, 'validate').receipt), ['pack/c4-level-skip']);
});
