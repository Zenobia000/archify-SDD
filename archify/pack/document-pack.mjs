// Document packs group related diagrams into design documents and check the
// relations between them: every refined diagram and drill-down target must be
// in the pack, refinement must not loop, and every declared element must
// appear on at least one diagram. Rendering reuses the ordinary render and
// check commands, then writes a manifest and a self-contained index page.

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { pack as validatePackSchema } from '../renderers/shared/generated-validators.mjs';

const cli = fileURLToPath(new URL('../bin/archify.mjs', import.meta.url));
const LEVELS = ['business', 'system', 'implementation'];
const CONCERNS = ['data', 'behavior', 'structure'];

function diagnostic(code, message, subject = {}, supportedFixes = [], severity = 'error') {
  return { code, severity, message, subject, evidence: {}, supportedFixes };
}

function readSource(baseDir, artifact) {
  const file = path.join(baseDir, artifact.source);
  const text = fs.readFileSync(file, 'utf8');
  if (artifact.source.endsWith('.md')) {
    // Explainer drafts title the page with the first `# Heading {#id}` line.
    const title = text.match(/^#\s+(.+?)(?:\s+\{#[^}]*\})?\s*$/m)?.[1]?.trim();
    return { file, meta: { title: title || artifact.id } };
  }
  const data = JSON.parse(text);
  return { file, meta: data.meta || {} };
}

function findCycle(ids, refines) {
  const state = new Map();
  const stack = [];
  function visit(id) {
    if (state.get(id) === 'done') return null;
    if (state.get(id) === 'active') return stack.slice(stack.indexOf(id)).concat(id);
    state.set(id, 'active');
    stack.push(id);
    for (const parent of refines.get(id) || []) {
      const cycle = visit(parent);
      if (cycle) return cycle;
    }
    stack.pop();
    state.set(id, 'done');
    return null;
  }
  for (const id of ids) {
    const cycle = visit(id);
    if (cycle) return cycle;
  }
  return null;
}

// Load the pack and every source, then check the cross-diagram contract.
export function analyzePack(packPath) {
  const baseDir = path.dirname(path.resolve(packPath));
  let pack;
  try {
    pack = JSON.parse(fs.readFileSync(packPath, 'utf8'));
  } catch (error) {
    return { ok: false, diagnostics: [diagnostic('pack/read', `Pack could not be read: ${error.message}`, { pack: packPath }, ['provide a readable JSON pack file'])] };
  }
  if (!validatePackSchema(pack)) {
    return {
      ok: false,
      pack,
      diagnostics: validatePackSchema.errors.map((error) => diagnostic('pack/schema',
        `${error.instancePath || '/'} ${error.message}`, { pack: packPath, path: error.instancePath }, ['match schemas/pack.schema.json'])),
    };
  }

  const diagnostics = [];
  const artifacts = [];
  const byId = new Map();
  for (const entry of pack.artifacts) {
    if (byId.has(entry.id)) {
      diagnostics.push(diagnostic('pack/duplicate-artifact', `Artifact id ${JSON.stringify(entry.id)} is declared twice.`, { artifact: entry.id }, ['give each artifact a unique id']));
      continue;
    }
    let source;
    try {
      source = readSource(baseDir, entry);
    } catch (error) {
      diagnostics.push(diagnostic('pack/missing-source', `Source for ${entry.id} could not be read: ${error.message}`, { artifact: entry.id, source: entry.source }, ['fix the source path relative to the pack file']));
      continue;
    }
    const trace = source.meta.trace || null;
    if (entry.type !== 'explainer' && trace?.id !== entry.id) {
      diagnostics.push(diagnostic('pack/trace-id-mismatch',
        `Artifact ${entry.id} must set meta.trace.id to ${JSON.stringify(entry.id)} (found ${JSON.stringify(trace?.id ?? null)}).`,
        { artifact: entry.id, source: entry.source }, [`set meta.trace.id to "${entry.id}"`]));
    }
    const artifact = {
      id: entry.id,
      type: entry.type,
      title: source.meta.title || entry.id,
      subtitle: source.meta.subtitle || null,
      source: entry.source,
      sourcePath: source.file,
      output: entry.output || `${entry.id}.html`,
      viewpoint: source.meta.viewpoint || entry.viewpoint || null,
      refines: trace?.refines || [],
      drillsInto: trace?.drills_into || [],
      elements: trace?.elements || {},
    };
    byId.set(artifact.id, artifact);
    artifacts.push(artifact);
  }

  const outputs = new Map(artifacts.map((artifact) => [artifact.output, artifact.id]));
  for (const document of pack.documents) {
    for (const section of document.sections) {
      for (const id of section.artifacts) {
        if (!byId.has(id)) {
          diagnostics.push(diagnostic('pack/missing-artifact', `Section ${section.id} lists unknown artifact ${JSON.stringify(id)}.`, { document: document.id, section: section.id, artifact: id }, ['declare the artifact in artifacts[] or remove it from the section']));
        }
      }
    }
  }
  for (const artifact of artifacts) {
    for (const parent of artifact.refines) {
      if (!byId.has(parent)) {
        diagnostics.push(diagnostic('pack/missing-artifact', `${artifact.id} refines unknown artifact ${JSON.stringify(parent)}.`, { artifact: artifact.id, refines: parent }, ['refine an artifact declared in this pack']));
      }
    }
    for (const link of artifact.drillsInto) {
      if (!outputs.has(link.target)) {
        diagnostics.push(diagnostic('pack/missing-artifact', `${artifact.id} drills into ${JSON.stringify(link.target)}, which no pack artifact outputs.`, { artifact: artifact.id, node: link.node, target: link.target }, ['point drills_into.target at another artifact output in this pack']));
      }
    }
  }
  const cycle = findCycle(artifacts.map((artifact) => artifact.id), new Map(artifacts.map((artifact) => [artifact.id, artifact.refines.filter((id) => byId.has(id))])));
  if (cycle) {
    diagnostics.push(diagnostic('pack/refines-cycle', `Refinement loops: ${cycle.join(' -> ')}.`, { cycle }, ['refines must point from detailed diagrams to more abstract ones']));
  }

  const declared = new Map((pack.elements || []).map((element) => [element.id, element]));
  const appearances = new Map([...declared.keys()].map((id) => [id, []]));
  for (const artifact of artifacts) {
    for (const [node, elementId] of Object.entries(artifact.elements)) {
      if (!declared.has(elementId)) {
        diagnostics.push(diagnostic('pack/undeclared-element', `${artifact.id} maps node ${node} to undeclared element ${elementId}.`, { artifact: artifact.id, node, element: elementId }, ['declare the element in elements[]']));
        continue;
      }
      appearances.get(elementId).push({ artifact: artifact.id, node });
    }
  }
  for (const [id, places] of appearances) {
    if (!places.length) {
      diagnostics.push(diagnostic('pack/orphan-element', `Element ${id} appears on no diagram.`, { element: id }, ['map the element to a node through meta.trace.elements, or remove it']));
    }
  }

  for (const artifact of artifacts) {
    artifact.refinedBy = artifacts.filter((other) => other.refines.includes(artifact.id)).map((other) => other.id);
    artifact.drilledFrom = artifacts.filter((other) => other.drillsInto.some((link) => link.target === artifact.output))
      .map((other) => other.id);
  }
  const elements = [...declared.values()].map((element) => ({ ...element, appearsIn: appearances.get(element.id) }));
  return { ok: !diagnostics.some((entry) => entry.severity === 'error'), pack, baseDir, artifacts, elements, diagnostics };
}

function run(args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

export function renderPack(packPath, outDir, { quality } = {}) {
  const analysis = analyzePack(packPath);
  if (!analysis.ok) return analysis;
  fs.mkdirSync(outDir, { recursive: true });
  const diagnostics = [...analysis.diagnostics];
  for (const artifact of analysis.artifacts) {
    const output = path.join(outDir, artifact.output);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    const rendered = run(['render', artifact.type, artifact.sourcePath, output, ...(quality ? ['--quality', quality] : [])]);
    if (rendered.status !== 0) {
      diagnostics.push(diagnostic('pack/render-failed', `${artifact.id} failed to render: ${(rendered.stderr || rendered.stdout).trim().split('\n').slice(-3).join(' ')}`, { artifact: artifact.id, source: artifact.source }, [`run archify finalize ${artifact.type} on ${artifact.source} and repair it`]));
      continue;
    }
    const checked = run(['check', output, '--json']);
    let receipt = null;
    try { receipt = JSON.parse(checked.stdout); } catch {}
    artifact.check = receipt?.ok === true;
    if (!artifact.check) {
      diagnostics.push(diagnostic('pack/check-failed', `${artifact.id} rendered but failed artifact checks.`, { artifact: artifact.id, output: artifact.output }, [`run archify check ${artifact.output} --json for details`]));
    }
    const bytes = fs.readFileSync(output);
    artifact.sha256 = createHash('sha256').update(bytes).digest('hex');
    artifact.bytes = bytes.length;
  }
  const ok = !diagnostics.some((entry) => entry.severity === 'error');
  const manifest = packManifest(analysis);
  fs.writeFileSync(path.join(outDir, 'pack.manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(path.join(outDir, 'index.html'), packIndexHtml(manifest));
  return { ...analysis, ok, diagnostics, manifest, outDir };
}

export function packManifest({ pack, artifacts, elements }) {
  return {
    schema_version: 1,
    pack_type: 'document-pack',
    id: pack.id,
    title: pack.title,
    ...(pack.subtitle ? { subtitle: pack.subtitle } : {}),
    ...(pack.locale ? { locale: pack.locale } : {}),
    documents: pack.documents,
    artifacts: artifacts.map((artifact) => ({
      id: artifact.id,
      type: artifact.type,
      title: artifact.title,
      ...(artifact.subtitle ? { subtitle: artifact.subtitle } : {}),
      source: artifact.source,
      output: artifact.output,
      viewpoint: artifact.viewpoint,
      documents: pack.documents.flatMap((document) => document.sections
        .filter((section) => section.artifacts.includes(artifact.id))
        .map((section) => ({ document: document.id, section: section.id, title: section.title }))),
      refines: artifact.refines,
      refinedBy: artifact.refinedBy,
      drillsInto: artifact.drillsInto,
      drilledFrom: artifact.drilledFrom,
      elements: artifact.elements,
      ...(artifact.sha256 ? { sha256: artifact.sha256, bytes: artifact.bytes, check: artifact.check } : {}),
    })),
    elements,
  };
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function href(output) {
  return output.split('/').map(encodeURIComponent).join('/');
}

const TYPE_LABEL = {
  architecture: 'Architecture', workflow: 'Workflow', sequence: 'Sequence', dataflow: 'Data flow', lifecycle: 'Lifecycle',
  erd: 'ERD', tree: 'Tree', class: 'Class', timeline: 'Timeline', waterfall: 'Waterfall', explainer: 'Explainer',
};
const C4_LABEL = { context: 'C4 L1', container: 'C4 L2', component: 'C4 L3', code: 'C4 L4', deployment: 'Deployment' };

function artifactLink(artifact) {
  const c4 = artifact.viewpoint?.c4_level ? `<span class="tag">${esc(C4_LABEL[artifact.viewpoint.c4_level])}</span>` : '';
  return `<a class="artifact" href="${href(artifact.output)}"><span class="type">${esc(TYPE_LABEL[artifact.type])}</span>${c4}<strong>${esc(artifact.title)}</strong></a>`;
}

function hierarchyHtml(artifacts) {
  const byId = new Map(artifacts.map((artifact) => [artifact.id, artifact]));
  const roots = artifacts.filter((artifact) => !artifact.refines.some((id) => byId.has(id)));
  const seen = new Set();
  function branch(artifact) {
    if (seen.has(artifact.id)) return '';
    seen.add(artifact.id);
    const children = artifact.refinedBy.map((id) => byId.get(id)).filter(Boolean);
    return `<li>${artifactLink(artifact)}${children.length ? `<ul>${children.map(branch).join('')}</ul>` : ''}</li>`;
  }
  return `<ul class="tree">${roots.map(branch).join('')}</ul>`;
}

export function packIndexHtml(manifest) {
  const { artifacts } = manifest;
  const cell = (level, concern) => artifacts.filter((artifact) => artifact.viewpoint?.level === level && artifact.viewpoint?.concern === concern);
  const matrix = `<table class="matrix"><thead><tr><th></th>${CONCERNS.map((concern) => `<th scope="col">${esc(concern)}</th>`).join('')}</tr></thead><tbody>${LEVELS.map((level) => `<tr><th scope="row">${esc(level)}</th>${CONCERNS.map((concern) => {
    const items = cell(level, concern);
    return `<td>${items.length ? items.map(artifactLink).join('') : '<span class="empty">—</span>'}</td>`;
  }).join('')}</tr>`).join('')}</tbody></table>`;
  const others = artifacts.filter((artifact) => !LEVELS.includes(artifact.viewpoint?.level) || !CONCERNS.includes(artifact.viewpoint?.concern));
  const documents = manifest.documents.map((document) => `<section class="document"><h3><span class="doc-id">${esc(document.id)}</span> ${esc(document.title)}</h3>${document.summary ? `<p>${esc(document.summary)}</p>` : ''}<ol>${document.sections.map((section) => `<li><span class="section-id">${esc(section.id)}</span> ${esc(section.title)}<div class="links">${section.artifacts.map((id) => artifacts.find((artifact) => artifact.id === id)).filter(Boolean).map(artifactLink).join('')}</div></li>`).join('')}</ol></section>`).join('');
  const elements = manifest.elements.length ? `<section><h2>Traceability</h2><table class="trace"><thead><tr><th>ID</th><th>Element</th><th>Owner</th><th>Status</th><th>Appears in</th></tr></thead><tbody>${manifest.elements.map((element) => `<tr><td><code>${esc(element.id)}</code></td><td>${esc(element.label)}</td><td>${esc(element.owner || '')}</td><td>${esc(element.status || '')}</td><td>${element.appearsIn.map((place) => {
    const artifact = artifacts.find((entry) => entry.id === place.artifact);
    return `<a href="${href(artifact.output)}#focus=${encodeURIComponent(place.node)}">${esc(artifact.title)}</a>`;
  }).join(', ')}</td></tr>`).join('')}</tbody></table></section>` : '';
  return `<!DOCTYPE html>
<html lang="${esc(manifest.locale || 'en')}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="generator" content="archify pack">
<title>${esc(manifest.title)}</title>
<style>
:root { --bg: #ffffff; --surface: #f2f3f3; --line: #d1d5db; --text: #16191f; --muted: #545b64; --navy: #232f3e; --accent: #0972d3; color-scheme: light dark; }
@media (prefers-color-scheme: dark) { :root { --bg: #0f1b2a; --surface: #16202d; --line: #414d5c; --text: #e9ebed; --muted: #b6bec9; --navy: #0b1420; --accent: #539fe5; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', 'PingFang TC', 'Microsoft JhengHei', sans-serif; }
header { background: var(--navy); color: #fff; padding: 28px 32px; }
header h1 { margin: 0 0 4px; font-size: 26px; font-weight: 600; }
header p { margin: 0; color: #d1d5db; }
main { max-width: 1180px; margin: 0 auto; padding: 24px 32px 48px; }
h2 { font-size: 19px; margin: 32px 0 12px; padding-bottom: 6px; border-bottom: 1px solid var(--line); }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid var(--line); padding: 8px 10px; vertical-align: top; text-align: left; }
thead th, tbody th { background: var(--surface); font-weight: 600; text-transform: capitalize; }
.matrix td { width: 30%; }
.artifact { display: flex; flex-wrap: wrap; gap: 6px; align-items: baseline; margin: 2px 0 6px; color: var(--accent); text-decoration: none; }
.artifact:hover strong { text-decoration: underline; }
.artifact strong { font-weight: 600; }
.type, .tag { font-size: 11px; padding: 0 6px; border: 1px solid var(--line); border-radius: 3px; color: var(--muted); }
.empty { color: var(--muted); }
.documents { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
.document { border: 1px solid var(--line); border-radius: 4px; padding: 14px 16px; }
.document h3 { margin: 0 0 6px; font-size: 16px; }
.document p { margin: 0 0 8px; color: var(--muted); font-size: 13px; }
.document ol { margin: 0; padding-left: 0; list-style: none; }
.document li { padding: 6px 0; border-top: 1px solid var(--line); }
.doc-id, .section-id { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: var(--muted); }
.links { margin-top: 4px; }
.tree, .tree ul { list-style: none; padding-left: 18px; margin: 0; }
.tree { padding-left: 0; }
.tree ul { border-left: 1px solid var(--line); margin-left: 6px; }
.trace td:first-child { white-space: nowrap; }
@media (max-width: 720px) { main, header { padding-left: 16px; padding-right: 16px; } .matrix, .trace { display: block; overflow-x: auto; } }
</style>
</head>
<body>
<header><h1>${esc(manifest.title)}</h1>${manifest.subtitle ? `<p>${esc(manifest.subtitle)}</p>` : ''}</header>
<main>
<section><h2>Viewpoint matrix</h2>${matrix}${others.length ? `<p><strong>Other viewpoints:</strong></p><div>${others.map(artifactLink).join('')}</div>` : ''}</section>
<section><h2>Documents</h2><div class="documents">${documents}</div></section>
<section><h2>Refinement hierarchy</h2>${hierarchyHtml(artifacts)}</section>
${elements}
</main>
</body>
</html>
`;
}
