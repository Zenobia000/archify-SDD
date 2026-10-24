// Document packs group related diagrams into design documents and check the
// relations between them: every refined diagram and drill-down target must be
// in the pack, refinement must not loop, and every declared element must
// appear on at least one diagram. Rendering reuses the ordinary render and
// check commands, then writes a manifest and a self-contained index page.

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import { pack as validatePackSchema } from '../renderers/shared/generated-validators.mjs';
import { packIndexHtml } from './pack-index.mjs';

export { packIndexHtml };

const cli = fileURLToPath(new URL('../bin/archify.mjs', import.meta.url));

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

export function renderPack(packPath, outDir, { quality, browserCheck = false } = {}) {
  const analysis = analyzePack(packPath);
  if (!analysis.ok) return analysis;
  fs.mkdirSync(outDir, { recursive: true });
  const diagnostics = [...analysis.diagnostics];
  // browser-check writes its receipt beside the artifact unless told otherwise;
  // keep receipts out of the published directory so renders stay reproducible.
  const receiptDir = browserCheck ? fs.mkdtempSync(path.join(os.tmpdir(), 'archify-pack-browser-')) : null;
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
      ...(artifact.browserCheck !== undefined ? { browserCheck: artifact.browserCheck } : {}),
    })),
    elements,
  };
}
