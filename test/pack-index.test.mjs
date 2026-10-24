import { test } from 'node:test';
import assert from 'node:assert/strict';

import { packIndexHtml, resolveUiLocale } from '../archify/pack/pack-index.mjs';

function artifact(id, overrides = {}) {
  return {
    id, type: 'architecture', title: id, source: `sources/${id}.json`, output: `${id}.html`,
    viewpoint: { level: 'system', concern: 'structure', roles: ['architect'], status: 'current' },
    documents: [{ document: 'SAD', section: 'SAD-2', title: 'Context' }],
    refines: [], refinedBy: [], drillsInto: [], drilledFrom: [], elements: {},
    ...overrides,
  };
}

function manifest(overrides = {}) {
  const top = artifact('top', { refinedBy: ['leaf'], drillsInto: [{ node: 'api', target: 'leaf.html', focus: 'svc', label: 'Detail' }], elements: { api: 'C-20' } });
  const leaf = artifact('leaf', {
    type: 'sequence', refines: ['top'], drilledFrom: ['top'],
    viewpoint: { level: 'implementation', concern: 'behavior', roles: ['software-designer'] },
    documents: [{ document: 'SDD', section: 'SDD-5', title: 'Interaction' }],
  });
  return {
    id: 'sample', title: 'Sample pack', locale: 'en',
    documents: [
      { id: 'SAD', kind: 'SAD', title: 'Architecture', sections: [{ id: 'SAD-2', title: 'Context', artifacts: ['top'] }] },
      { id: 'SDD', kind: 'SDD', title: 'Design', sections: [{ id: 'SDD-5', title: 'Interaction', artifacts: ['leaf'] }] },
    ],
    artifacts: [top, leaf],
    elements: [{ id: 'C-20', label: 'API', owner: 'Team', status: 'partial', appearsIn: [{ artifact: 'top', node: 'api' }] }],
    ...overrides,
  };
}

function attr(html, pattern) {
  return [...html.matchAll(pattern)].map((match) => match[1]);
}

test('UI locale resolves Traditional, Simplified and everything else', () => {
  assert.equal(resolveUiLocale('zh-TW'), 'zh-TW');
  assert.equal(resolveUiLocale('zh-Hant'), 'zh-TW');
  assert.equal(resolveUiLocale('zh-HK'), 'zh-TW');
  assert.equal(resolveUiLocale('zh-CN'), 'zh-CN');
  assert.equal(resolveUiLocale('zh'), 'zh-CN');
  assert.equal(resolveUiLocale('ko'), 'en');
  assert.equal(resolveUiLocale(undefined), 'en');
});

test('index renders one view per diagram plus an overview, all linked by hash routes', () => {
  const html = packIndexHtml(manifest());
  assert.deepEqual(attr(html, /<section class="view"[^>]* data-view="([^"]+)"/g), ['overview', 'top', 'leaf']);
  assert.match(html, /<section class="view" id="view-leaf" data-view="leaf" hidden>/);
  assert.match(html, /<section class="view" id="view-overview" data-view="overview">/);
  assert.match(html, /href="#a=leaf&amp;focus=svc">api → Detail</);
  assert.match(html, /<iframe title="top — live Archify diagram" data-base="top\.html"><\/iframe>/);
  assert.match(html, /href="top\.html" target="_blank" rel="noopener">Open standalone diagram/);
  assert.match(html, /<a href="#a=top">← top<\/a>/);
  assert.match(html, /<a href="#a=top">↑ top<\/a>/);
  assert.match(html, /<span class="badge partial">partial<\/span>/);
});

test('facets list only values the pack uses and only when they can narrow the list', () => {
  const html = packIndexHtml(manifest());
  assert.deepEqual(attr(html, /data-facet="role" value="([^"]+)"/g), ['architect', 'software-designer']);
  assert.deepEqual(attr(html, /data-facet="document" value="([^"]+)"/g), ['SAD', 'SDD']);
  assert.deepEqual(attr(html, /data-facet="level" value="([^"]+)"/g), ['system', 'implementation']);
  assert.deepEqual(attr(html, /data-facet="type" value="([^"]+)"/g), ['architecture', 'sequence']);
  assert.match(html, /data-nav="leaf" href="#a=leaf"[^>]* data-role="software-designer" data-document="SDD" data-level="implementation" data-concern="behavior" data-type="sequence"/);

  const single = manifest({ artifacts: [artifact('only')], documents: [{ id: 'SAD', kind: 'SAD', title: 'A', sections: [{ id: 'SAD-2', title: 'C', artifacts: ['only'] }] }], elements: [] });
  assert.doesNotMatch(packIndexHtml(single), /data-facet=/);
});

test('every authored string is escaped and embedded data cannot close its script', () => {
  const hostile = manifest({ title: '<img src=x onerror=alert(1)>', subtitle: '"quoted" & <b>' });
  hostile.artifacts[0].title = '</script><script>alert(1)</script>';
  hostile.artifacts[0].output = 'a b/<x>.html';
  const html = packIndexHtml(hostile);
  assert.doesNotMatch(html, /<img src=x/);
  assert.doesNotMatch(html, /<script>alert\(1\)/);
  assert.equal([...html.matchAll(/<script\b/g)].length, 2, 'only the data island and the page script');
  assert.match(html, /data-base="a%20b\/%3Cx%3E\.html"/);
  const data = JSON.parse(html.match(/<script type="application\/json" id="pack-data">([^<]*)<\/script>/)[1]);
  assert.equal(data.titles.top, '</script><script>alert(1)</script>');
  assert.equal(data.outputs.top, 'a%20b/%3Cx%3E.html');
});

test('the page speaks the pack locale and falls back to English', () => {
  const traditional = packIndexHtml(manifest({ locale: 'zh-TW' }));
  assert.match(traditional, /<html lang="zh-TW">/);
  assert.match(traditional, /視角矩陣/);
  assert.match(traditional, /顯示 \{n\} \/ \{t\} 張圖/);
  assert.doesNotMatch(traditional, /视角矩阵/);

  const simplified = packIndexHtml(manifest({ locale: 'zh-CN' }));
  assert.match(simplified, /视角矩阵/);

  const fallback = packIndexHtml(manifest({ locale: 'fr' }));
  assert.match(fallback, /<html lang="en">/);
  assert.match(fallback, /Viewpoint matrix/);
});

test('relations that leave the pack are dropped instead of rendered as dead links', () => {
  const broken = manifest();
  broken.artifacts[0].drillsInto.push({ node: 'api', target: 'missing.html' });
  broken.artifacts[0].refines = ['ghost'];
  broken.artifacts[0].elements.api = 'C-99';
  const html = packIndexHtml(broken);
  assert.doesNotMatch(html, /missing\.html/);
  assert.doesNotMatch(html, /ghost/);
  assert.doesNotMatch(html, /C-99/);
});

test('an alternate view hangs under its diagram as a marked view, not as a refinement', () => {
  const base = manifest();
  const containers = artifact('containers', { refinedBy: ['detail'], views: ['deployment'] });
  const detail = artifact('detail', { refines: ['containers'], viewpoint: { level: 'implementation', concern: 'structure', c4_level: 'component' } });
  const deployment = artifact('deployment', { viewOf: ['containers'], viewpoint: { level: 'system', concern: 'structure', c4_level: 'deployment' } });
  const html = packIndexHtml({ ...base, artifacts: [containers, detail, deployment], documents: [{ id: 'SAD', kind: 'SAD', title: 'A', sections: [{ id: 'SAD-2', title: 'C', artifacts: ['containers', 'detail', 'deployment'] }] }], elements: [] });
  const from = html.indexOf('<ul class="tree">');
  const tree = html.slice(from, html.indexOf('</section>', from));
  assert.deepEqual(attr(tree, /data-nav="([^"]+)"/g), ['containers', 'detail', 'deployment'], 'the view is listed once, under its diagram');
  assert.match(tree, /<li class="view-item"><a [^>]*data-nav="deployment"[^]*<span class="view-tag">view<\/span>/);
  const section = (id) => html.slice(html.indexOf(`id="view-${id}"`), html.indexOf('</aside>', html.indexOf(`id="view-${id}"`)));
  const panel = section('deployment');
  assert.match(panel, /<h2>A view of<\/h2><ul><li><a href="#a=containers">↔ containers<\/a>/);
  assert.doesNotMatch(panel, /<h2>Refines<\/h2>/);
  assert.match(section('containers'), /<h2 class="sub">Alternate views<\/h2><ul><li><a href="#a=deployment">↔ deployment/);
});
