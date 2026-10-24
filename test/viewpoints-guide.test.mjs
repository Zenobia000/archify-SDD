import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CONCERNS, DOCUMENTS, LEVELS, ROLES, VIEWPOINTS, recommendViewpoint } from '../archify/recipes/viewpoints.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'archify/bin/archify.mjs');
const common = JSON.parse(fs.readFileSync(path.join(root, 'archify/schemas/common.schema.json'), 'utf8'));

function guide(...args) {
  const result = spawnSync(process.execPath, [cli, 'guide', ...args], { encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

test('every matrix cell has exactly one viewpoint and every viewpoint uses schema vocabulary', () => {
  for (const level of LEVELS) {
    for (const concern of CONCERNS) {
      const cell = VIEWPOINTS.filter((entry) => !entry.extra && entry.level === level && entry.concern === concern);
      assert.equal(cell.length, 1, `${level}/${concern}`);
    }
  }
  const vocabulary = common.$defs.viewpoint.properties;
  for (const entry of VIEWPOINTS) {
    if (entry.level) assert.ok(vocabulary.level.enum.includes(entry.level), entry.id);
    assert.ok(vocabulary.concern.enum.includes(entry.concern), entry.id);
    if (entry.c4) assert.ok(vocabulary.c4_level.enum.includes(entry.c4), entry.id);
    for (const role of entry.roles) {
      assert.ok(vocabulary.roles.items.enum.includes(role), `${entry.id}: ${role}`);
      assert.ok(Object.hasOwn(ROLES, role), `${entry.id}: ${role}`);
    }
    for (const document of entry.documents) assert.ok(Object.hasOwn(DOCUMENTS, document), `${entry.id}: ${document}`);
  }
});

test('viewpoint signals recognise C4, DFD and document vocabulary in English and Chinese', () => {
  const cases = [
    ['draw the C4 container diagram', 'container'],
    ['我需要系統脈絡圖', 'system-context'],
    ['画一张数据流图', 'dfd-level-1'],
    ['業務流程 for onboarding', 'business-process'],
    ['write an ADR for the queue choice', 'decision-record'],
  ];
  for (const [query, id] of cases) assert.equal(recommendViewpoint(query)?.viewpoint.id, id, query);
  assert.equal(recommendViewpoint('make it pretty'), null);
});

test('guide --role lists the documents and viewpoints that role owns', () => {
  const { status, stdout } = guide('--role', 'architect', '--json');
  assert.equal(status, 0);
  const result = JSON.parse(stdout);
  assert.equal(result.mode, 'viewpoints');
  assert.deepEqual(result.documents.map((document) => document.id), ['SAD', 'SDD', 'ADR']);
  assert.ok(result.viewpoints.every((entry) => entry.roles.includes('architect')));
  assert.ok(result.viewpoints.some((entry) => entry.c4_level === 'context'));
});

test('guide --document narrows a scenario to that document', () => {
  const { status, stdout } = guide('--document', 'sdd', 'sequence of the booking confirmation', '--json');
  assert.equal(status, 0);
  const result = JSON.parse(stdout);
  assert.equal(result.mode, 'viewpoint-recommendation');
  assert.equal(result.viewpoint.id, 'sequence');
  assert.ok(result.viewpoints.every((entry) => entry.documents.includes('SDD')));
});

test('a plain scenario keeps its recipe and adds a viewpoint only on a strong match', () => {
  const strong = JSON.parse(guide('C4 container diagram for the shop', '--json').stdout);
  assert.equal(strong.viewpoint.viewpoint.id, 'container');
  const plain = JSON.parse(guide('how a release moves through approval', '--json').stdout);
  assert.equal(plain.mode, 'recommendation');
  assert.equal(Object.hasOwn(plain, 'viewpoint'), false);
});

test('guide rejects unknown roles and documents', () => {
  assert.equal(guide('--role', 'wizard').status, 2);
  assert.equal(guide('--document', 'XYZ').status, 2);
});
