import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as validators from '../archify/renderers/shared/generated-validators.mjs';
import { createScratchDirectory } from './helpers/scratch-directory.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'archify/bin/archify.mjs');
const example = path.join(root, 'archify/examples/production-deployment.architecture.json');

function architecture(meta = {}) {
  const diagram = JSON.parse(fs.readFileSync(example, 'utf8'));
  diagram.meta = { ...diagram.meta, output: 'trace.html', ...meta };
  return diagram;
}

function run(args, cwd) {
  return spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });
}

function traceIsland(html) {
  const match = html.match(/<script id="archify-trace-data" type="application\/json">([^<]*)<\/script>/);
  return match ? JSON.parse(match[1]) : null;
}

const viewpoint = { level: 'system', concern: 'structure', c4_level: 'container', roles: ['architect'], status: 'current' };

test('every native diagram schema accepts viewpoint and trace metadata', () => {
  const types = ['workflow', 'sequence', 'dataflow', 'lifecycle', 'architecture', 'erd', 'tree', 'class', 'timeline', 'waterfall'];
  for (const type of types) {
    const source = fs.readdirSync(path.join(root, 'archify/examples'))
      .find((name) => name.endsWith(`.${type}.json`));
    const diagram = JSON.parse(fs.readFileSync(path.join(root, 'archify/examples', source), 'utf8'));
    diagram.meta.viewpoint = viewpoint;
    diagram.meta.trace = { id: 'doc-view', refines: ['parent-view'] };
    assert.equal(validators[type](diagram), true, `${type}: ${JSON.stringify(validators[type].errors)}`);
  }
});

test('viewpoint and trace reject values outside the contract', () => {
  const cases = [
    { viewpoint: { level: 'strategic' } },
    { viewpoint: { roles: ['architect', 'architect'] } },
    { viewpoint: {} },
    { trace: { refines: ['parent'] } },
    { trace: { id: 'view', elements: { edge: 'c30' } } },
    { trace: { id: 'view', drills_into: [{ node: 'edge', target: '../escape.html' }] } },
    { trace: { id: 'view', drills_into: [{ node: 'edge', target: 'child.html', extra: true }] } },
  ];
  for (const meta of cases) {
    assert.equal(validators.architecture(architecture(meta)), false, JSON.stringify(meta));
  }
});

test('render embeds viewpoint and trace as one JSON data island', () => {
  const directory = createScratchDirectory(path.join(os.tmpdir(), 'archify-trace-'));
  const trace = {
    id: 'deployment-view',
    refines: ['context-view'],
    drills_into: [{ node: 'gateway', target: 'gateway-components.html', focus: 'router', label: 'Components' }],
    elements: { gateway: 'C-30' },
  };
  fs.writeFileSync(path.join(directory, 'input.json'), JSON.stringify(architecture({ viewpoint, trace })));
  const result = run(['render', 'architecture', 'input.json', 'trace.html'], directory);
  assert.equal(result.status, 0, result.stderr);

  const html = fs.readFileSync(path.join(directory, 'trace.html'), 'utf8');
  assert.deepEqual(traceIsland(html), { viewpoint, trace });
});

test('render without trace metadata emits no trace island', () => {
  const directory = createScratchDirectory(path.join(os.tmpdir(), 'archify-trace-'));
  fs.writeFileSync(path.join(directory, 'input.json'), JSON.stringify(architecture()));
  const result = run(['render', 'architecture', 'input.json', 'plain.html'], directory);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(traceIsland(fs.readFileSync(path.join(directory, 'plain.html'), 'utf8')), null);
});

test('trace references to unknown nodes fail with a stable diagnostic', () => {
  const directory = createScratchDirectory(path.join(os.tmpdir(), 'archify-trace-'));
  const trace = {
    id: 'deployment-view',
    drills_into: [{ node: 'missing-node', target: 'child.html' }],
    elements: { 'missing-element': 'C-10' },
  };
  fs.writeFileSync(path.join(directory, 'input.json'), JSON.stringify(architecture({ trace })));
  const result = run(['validate', 'architecture', 'input.json', '--json'], directory);
  assert.notEqual(result.status, 0);

  const receipt = JSON.parse(result.stdout);
  const diagnostic = receipt.diagnostics.find((entry) => entry.code === 'trace/unknown-node');
  assert.ok(diagnostic, result.stdout);
  assert.match(JSON.stringify(receipt.diagnostics), /drills_into\/0\/node/);
  assert.match(JSON.stringify(receipt.diagnostics), /elements\/missing-element/);
});
