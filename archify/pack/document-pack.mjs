// Document packs group related diagrams into design documents and check the
// relations between them. A pack is whatever the reader asked for, so the
// checks never require a complete set: a reference to a diagram that is not in
// the pack is a warning and is left out of the output, which lets a diagram
// written for a larger set stand alone and lets later diagrams light up their
// links when they are added. Errors are reserved for things that cannot be
// right at any size: duplicate ids, refinement loops, links to nodes that do
// not exist, and a section that names a diagram the pack does not declare.
// Rendering reuses the ordinary render and check commands, then writes a
// manifest and a self-contained index page.

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import { pack as validatePackSchema } from '../renderers/shared/generated-validators.mjs';
import { semanticNodes } from '../renderers/shared/cli.mjs';
import { packIndexHtml } from './pack-index.mjs';

export { packIndexHtml };

const cli = fileURLToPath(new URL('../bin/archify.mjs', import.meta.url));

function diagnostic(code, message, subject = {}, supportedFixes = [], severity = 'error') {
  return { code, severity, message, subject, evidence: {}, supportedFixes };
}

const warning = (code, message, subject, supportedFixes) => diagnostic(code, message, subject, supportedFixes, 'warning');

// C4 zoom order. Deployment is another view of the containers, not a deeper level.
const C4_DEPTH = { context: 1, container: 2, component: 3, code: 4 };
const C4_BY_DEPTH = ['', 'context', 'container', 'component', 'code'];
const DRILL_LABEL_MAX = 48;

function readSource(baseDir, artifact) {
  const file = path.join(baseDir, artifact.source);
  const text = fs.readFileSync(file, 'utf8');
  if (artifact.source.endsWith('.md')) {
    // Explainer drafts title the page with the first `# Heading {#id}` line.
    const title = text.match(/^#\s+(.+?)(?:\s+\{#[^}]*\})?\s*$/m)?.[1]?.trim();
    return { file, meta: { title: title || artifact.id }, nodes: new Map() };
  }
  const data = JSON.parse(text);
  return { file, meta: data.meta || {}, nodes: new Map(semanticNodes(artifact.type, data).map((node) => [node.id, node.label])) };
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

const c4Level = (artifact) => artifact.viewpoint?.c4_level;
const sameJson = (left, right) => JSON.stringify(left) === JSON.stringify(right);

// C4 zoom rules, as warnings: a pack may hold any subset of the levels, but
// the levels it does hold must still nest. Absent levels are never reported.
function c4Warnings(artifacts, byId) {
  const found = [];
  const seen = new Set();
  const add = (key, entry) => { if (!seen.has(key)) { seen.add(key); found.push(entry); } };
  for (const artifact of artifacts) {
    const level = c4Level(artifact);
    if (!level) continue;
    const parents = artifact.traceRefines.map((id) => byId.get(id)).filter((parent) => c4Level(parent));
    const expected = level === 'deployment' ? 'container' : C4_BY_DEPTH[C4_DEPTH[level] - 1];
    for (const parent of parents) {
      if (expected && c4Level(parent) !== expected) {
        add(`skip:${artifact.id}>${parent.id}`, warning('pack/c4-level-skip',
          `${artifact.id} (${level}) refines ${parent.id} (${c4Level(parent)}); a ${level} diagram refines a ${expected} diagram.`,
          { artifact: artifact.id, parent: parent.id }, [`refine the ${expected} diagram instead, or draw it first`]));
      }
      if (level !== 'deployment' && c4Level(parent) === expected && !parent.drillsInto.some((link) => link.target === artifact.output)) {
        add(`nav:${artifact.id}>${parent.id}`, warning('pack/c4-not-navigable',
          `${artifact.id} refines ${parent.id}, but no node in ${parent.id} opens it.`,
          { artifact: artifact.id, parent: parent.id }, [`add trace.drill_from to ${artifact.id}, naming the ${expected} node it details`]));
      }
    }
    if (parents.length > 1) {
      add(`parents:${artifact.id}`, warning('pack/c4-multiple-parents',
        `${artifact.id} refines more than one C4 diagram: ${parents.map((parent) => parent.id).join(', ')}.`,
        { artifact: artifact.id, parents: parents.map((parent) => parent.id) }, ['a C4 diagram zooms into exactly one parent']));
    }
  }
  for (const artifact of artifacts) {
    const byNode = new Map();
    for (const link of artifact.drillsInto) {
      const target = artifacts.find((other) => other.output === link.target);
      if (!target || !c4Level(target)) continue;
      const key = `${link.node}|${c4Level(target)}`;
      byNode.set(key, [...(byNode.get(key) || []), target.id]);
    }
    for (const [key, targets] of byNode) {
      if (targets.length > 1) {
        add(`drill:${artifact.id}:${key}`, warning('pack/c4-ambiguous-drill',
          `${artifact.id} node ${key.split('|')[0]} opens more than one ${key.split('|')[1]} diagram: ${targets.join(', ')}.`,
          { artifact: artifact.id, node: key.split('|')[0], targets }, ['one container opens one component diagram; keep a single target']));
      }
    }
  }
  return found;
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
      nodes: source.nodes,
      authored: { refines: trace?.refines || [], drills: trace?.drills_into || [] },
      refines: [...(trace?.refines || [])],
      drillsInto: (trace?.drills_into || []).map((link) => ({ ...link })),
      drillFrom: trace?.drill_from || [],
      elements: trace?.elements || {},
    };
    byId.set(artifact.id, artifact);
    artifacts.push(artifact);
  }

  for (const document of pack.documents) {
    for (const section of document.sections) {
      for (const id of section.artifacts) {
        if (!byId.has(id)) {
          diagnostics.push(diagnostic('pack/missing-artifact', `Section ${section.id} lists unknown artifact ${JSON.stringify(id)}.`, { document: document.id, section: section.id, artifact: id }, ['declare the artifact in artifacts[] or remove it from the section']));
        }
      }
    }
  }

  // References to diagrams outside the pack are soft: the pack is what was
  // asked for, so a diagram may mention neighbours that have not been drawn.
  const outputs = new Set(artifacts.map((artifact) => artifact.output));
  for (const artifact of artifacts) {
    const missing = [];
    artifact.refines = artifact.refines.filter((parent) => byId.has(parent) || !missing.push(`refines ${parent}`));
    artifact.drillsInto = artifact.drillsInto.filter((link) => outputs.has(link.target) || !missing.push(`${link.node} opens ${link.target}`));
    artifact.drillFrom = artifact.drillFrom.filter((entry) => byId.has(entry.diagram) || !missing.push(`opened from ${entry.diagram}`));
    if (missing.length) {
      diagnostics.push(warning('pack/dangling-reference', `${artifact.id} points at diagrams that are not in this pack (${missing.join('; ')}); those links are left out.`, { artifact: artifact.id, references: missing }, ['add the diagram to the pack when it exists, or ignore this warning']));
    }
  }

  // A detailed diagram may declare which node of an abstract one opens it, so
  // adding it later needs no edit to the abstract diagram's source.
  for (const artifact of artifacts) {
    for (const entry of artifact.drillFrom) {
      const parent = byId.get(entry.diagram);
      if (parent.type !== 'explainer' && !parent.nodes.has(entry.node)) {
        diagnostics.push(diagnostic('pack/unknown-node', `${artifact.id} is opened from ${entry.diagram} node ${JSON.stringify(entry.node)}, which that diagram does not have.`, { artifact: artifact.id, diagram: entry.diagram, node: entry.node }, [`use a node id from ${parent.source}`]));
        continue;
      }
      if (!parent.drillsInto.some((link) => link.node === entry.node && link.target === artifact.output)) {
        const label = entry.label || (artifact.title.length > DRILL_LABEL_MAX ? `${artifact.title.slice(0, DRILL_LABEL_MAX - 1)}…` : artifact.title);
        parent.drillsInto.push({ node: entry.node, target: artifact.output, ...(entry.focus ? { focus: entry.focus } : {}), label });
      }
      if (!artifact.refines.includes(parent.id)) artifact.refines.push(parent.id);
    }
  }

  const cycle = findCycle(artifacts.map((artifact) => artifact.id), new Map(artifacts.map((artifact) => [artifact.id, artifact.refines])));
  if (cycle) {
    diagnostics.push(diagnostic('pack/refines-cycle', `Refinement loops: ${cycle.join(' -> ')}.`, { cycle }, ['refines must point from detailed diagrams to more abstract ones']));
  }

  // Element IDs are registered in the pack for owner and status, but a diagram
  // that uses an ID the pack has not registered still traces: the ID takes the
  // label of the node it marks.
  const declared = new Map((pack.elements || []).map((element) => [element.id, { ...element }]));
  const registered = new Set(declared.keys());
  const appearances = new Map([...declared.keys()].map((id) => [id, []]));
  for (const artifact of artifacts) {
    const unregistered = [];
    for (const [node, elementId] of Object.entries(artifact.elements)) {
      if (!declared.has(elementId)) {
        unregistered.push(elementId);
        declared.set(elementId, { id: elementId, label: artifact.nodes.get(node) || node, declared: false });
        appearances.set(elementId, []);
      }
      appearances.get(elementId).push({ artifact: artifact.id, node });
    }
    if (unregistered.length) {
      diagnostics.push(warning('pack/undeclared-element', `${artifact.id} uses element IDs the pack does not register (${unregistered.join(', ')}); they are traced under their node labels.`, { artifact: artifact.id, elements: unregistered }, ['register the elements in the pack to give them an owner and status']));
    }
  }
  const unused = [...registered].filter((id) => !appearances.get(id).length);
  if (unused.length) {
    diagnostics.push(warning('pack/orphan-element', `Registered elements appear on no diagram yet (${unused.join(', ')}).`, { elements: unused }, ['map them to nodes through meta.trace.elements when their diagrams are drawn']));
  }

  // The links a source needs once the pack is known; renderPack writes a
  // corrected copy when this differs from what the author wrote.
  for (const artifact of artifacts) {
    artifact.traceRefines = [...artifact.refines];
    artifact.needsRewrite = !sameJson(artifact.authored.refines, artifact.traceRefines)
      || !sameJson(artifact.authored.drills, artifact.drillsInto);
  }

  diagnostics.push(...c4Warnings(artifacts, byId));

  // Deployment is another view of the containers, not a level below them.
  for (const artifact of artifacts) {
    artifact.viewOf = c4Level(artifact) === 'deployment' ? artifact.refines : [];
    if (artifact.viewOf.length) artifact.refines = [];
  }
  for (const artifact of artifacts) {
    artifact.refinedBy = artifacts.filter((other) => other.refines.includes(artifact.id)).map((other) => other.id);
    artifact.views = artifacts.filter((other) => other.viewOf.includes(artifact.id)).map((other) => other.id);
    artifact.drilledFrom = artifacts.filter((other) => other.drillsInto.some((link) => link.target === artifact.output))
      .map((other) => other.id);
  }
  const elements = [...declared.values()].map((element) => ({ ...element, appearsIn: appearances.get(element.id) }));
  return { ok: !diagnostics.some((entry) => entry.severity === 'error'), pack, baseDir, artifacts, elements, diagnostics };
}

function run(args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

export function renderPack(packPath, outDir, { quality, browserCheck = false } = {}) {
  const analysis = analyzePack(packPath);
  if (!analysis.ok) return analysis;
  fs.mkdirSync(outDir, { recursive: true });
  const diagnostics = [...analysis.diagnostics];
  // browser-check writes its receipt beside the artifact unless told otherwise;
  // keep receipts out of the published directory so renders stay reproducible.
  const receiptDir = browserCheck ? fs.mkdtempSync(path.join(os.tmpdir(), 'archify-pack-browser-')) : null;
  // A diagram whose links the pack had to complete or trim renders from a
  // corrected copy; every other source renders untouched.
  let effectiveDir = null;
  const sourceFor = (artifact) => {
    if (!artifact.needsRewrite || artifact.type === 'explainer') return artifact.sourcePath;
    const data = JSON.parse(fs.readFileSync(artifact.sourcePath, 'utf8'));
    const trace = { ...data.meta.trace };
    if (artifact.traceRefines.length) trace.refines = artifact.traceRefines; else delete trace.refines;
    if (artifact.drillsInto.length) trace.drills_into = artifact.drillsInto; else delete trace.drills_into;
    data.meta = { ...data.meta, trace };
    effectiveDir ??= fs.mkdtempSync(path.join(os.tmpdir(), 'archify-pack-source-'));
    const file = path.join(effectiveDir, `${artifact.id}.json`);
    fs.writeFileSync(file, JSON.stringify(data));
    return file;
  };
  for (const artifact of analysis.artifacts) {
    const output = path.join(outDir, artifact.output);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    const rendered = run(['render', artifact.type, sourceFor(artifact), output, ...(quality ? ['--quality', quality] : [])]);
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
    // Explainers are plain pages; the viewer gate only applies to native diagrams.
    if (browserCheck && artifact.type !== 'explainer') {
      const browser = run(['browser-check', output, '--json', '--out-dir', receiptDir]);
      let browserReceipt = null;
      try { browserReceipt = JSON.parse(browser.stdout); } catch {}
      artifact.browserCheck = browserReceipt?.ok === true;
      if (!artifact.browserCheck) {
        diagnostics.push(diagnostic('pack/browser-check-failed', `${artifact.id} failed the real-browser check: ${browserReceipt?.error || 'no usable receipt (is Chrome installed? set ARCHIFY_CHROME)'}`, { artifact: artifact.id, output: artifact.output }, [`run archify browser-check ${artifact.output} --json for details`]));
      }
    }
    const bytes = fs.readFileSync(output);
    artifact.sha256 = createHash('sha256').update(bytes).digest('hex');
    artifact.bytes = bytes.length;
  }
  if (receiptDir) fs.rmSync(receiptDir, { recursive: true, force: true });
  if (effectiveDir) fs.rmSync(effectiveDir, { recursive: true, force: true });
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
      ...(artifact.viewOf.length ? { viewOf: artifact.viewOf } : {}),
      ...(artifact.views.length ? { views: artifact.views } : {}),
      drillsInto: artifact.drillsInto,
      drilledFrom: artifact.drilledFrom,
      elements: artifact.elements,
      ...(artifact.sha256 ? { sha256: artifact.sha256, bytes: artifact.bytes, check: artifact.check } : {}),
      ...(artifact.browserCheck !== undefined ? { browserCheck: artifact.browserCheck } : {}),
    })),
    elements,
  };
}
