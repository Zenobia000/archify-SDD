// Architecture Center data: the engineering viewpoint catalog joined with the
// published document packs. Paths are relative to the site root <base>.
import { CONCERNS, DOCUMENTS, LEVELS, ROLES, VIEWPOINTS, localizeDocument, localizeViewpoint } from '../../../archify/recipes/viewpoints.mjs';
import { PACKS } from './pack-registry.mjs';

export { CONCERNS, LEVELS, PACKS };

/** @typedef {{ en: string, zh: string }} Copy */
/** @typedef {import('./pack-types').Pack} Pack */
/** @typedef {import('./pack-types').PackArtifact} PackArtifact */
/** @type {Record<string, Copy>} */
export const LEVEL_LABELS = {
  business: { en: 'Business', zh: '业务' },
  system: { en: 'System', zh: '系统' },
  implementation: { en: 'Implementation', zh: '实现' },
};
/** @type {Record<string, Copy>} */
export const CONCERN_LABELS = {
  data: { en: 'Data', zh: '数据' },
  behavior: { en: 'Behavior', zh: '行为' },
  structure: { en: 'Structure', zh: '结构' },
  'cross-cutting': { en: 'Cross-cutting', zh: '横切' },
};
/** @type {Record<string, Copy>} */
export const TYPE_LABELS = {
  architecture: { en: 'Architecture', zh: '架构图' }, workflow: { en: 'Workflow', zh: '工作流' },
  sequence: { en: 'Sequence', zh: '时序图' }, dataflow: { en: 'Data flow', zh: '数据流' },
  lifecycle: { en: 'Lifecycle', zh: '生命周期' }, erd: { en: 'ERD', zh: '实体关系图' },
  tree: { en: 'Tree', zh: '树图' }, class: { en: 'Class', zh: '类图' },
  timeline: { en: 'Timeline', zh: '时间线' }, waterfall: { en: 'Waterfall', zh: '瀑布图' },
  explainer: { en: 'Explainer', zh: '一页解答' },
};
/** @type {Record<string, string>} */
export const C4_LABELS = { context: 'C4 L1', container: 'C4 L2', component: 'C4 L3', code: 'C4 L4', deployment: 'Deployment' };

export const roles = Object.entries(ROLES).map(([id, label]) => ({
  id,
  label,
  documents: Object.keys(DOCUMENTS).filter((doc) => VIEWPOINTS.some((entry) => entry.roles.includes(id) && entry.documents.includes(doc))),
  viewpoints: VIEWPOINTS.filter((entry) => entry.roles.includes(id)).map((entry) => entry.id),
}));

export const documents = Object.keys(DOCUMENTS).map((id) => ({
  id,
  en: localizeDocument(id, 'en'),
  zh: localizeDocument(id, 'zh'),
  viewpoints: VIEWPOINTS.filter((entry) => entry.documents.includes(id)).map((entry) => entry.id),
}));

export const viewpoints = VIEWPOINTS.map((entry) => ({ ...localizeViewpoint(entry, 'en'), zh: localizeViewpoint(entry, 'zh') }));

// A type alone names the viewpoint unless several share it: architecture is
// told apart by C4 level, workflow and dataflow by abstraction level.
/** @param {PackArtifact} artifact */
export function viewpointFor(artifact) {
  const view = artifact.viewpoint || {};
  const sameType = viewpoints.filter((entry) => entry.type === artifact.type);
  if (sameType.length <= 1) return sameType[0] || null;
  return sameType.find((entry) => entry.c4_level && entry.c4_level === view.c4_level)
    || sameType.find((entry) => !entry.c4_level && entry.level === view.level)
    || null;
}

/** @param {Pack} pack @param {PackArtifact} artifact */
export function artifactPage(pack, artifact) { return `packs/${pack.id}/${artifact.id}.html`; }
/** @param {Pack} pack @param {PackArtifact} artifact */
export function artifactFile(pack, artifact) { return `packs/${pack.id}/artifacts/${artifact.output}`; }
/** @param {Pack} pack @param {PackArtifact} artifact */
export function artifactSource(pack, artifact) { return `packs/${pack.id}/${artifact.source}`; }
/** @param {Pack} pack */
export function packPage(pack) { return `packs/${pack.id}.html`; }

// Every published artifact as a catalog entry with its facet values.
export const catalog = PACKS.flatMap((pack) => pack.artifacts.map((artifact) => {
  const viewpoint = viewpointFor(artifact);
  return {
    pack,
    artifact,
    viewpoint,
    roles: artifact.viewpoint?.roles || viewpoint?.roles || [],
    documents: [...new Set(artifact.documents.map((entry) => pack.documents.find((doc) => doc.id === entry.document)?.kind || entry.document))],
    level: artifact.viewpoint?.level || null,
    concern: artifact.viewpoint?.concern || null,
    type: artifact.type,
  };
}));

/** @param {Pack} pack @param {string} level @param {string} concern */
export function cellArtifacts(pack, level, concern) {
  return pack.artifacts.filter((artifact) => artifact.viewpoint?.level === level && artifact.viewpoint?.concern === concern);
}

/** @param {string} viewpointId */
export function exampleFor(viewpointId) {
  return catalog.find((entry) => entry.viewpoint?.id === viewpointId) || null;
}

// Static routes shared by the English pages and their zh wrappers.
export function packRoutes() {
  return PACKS.map((pack) => ({ params: { pack: pack.id }, props: { pack } }));
}
export function artifactRoutes() {
  return PACKS.flatMap((pack) => pack.artifacts.map((artifact) => ({ params: { pack: pack.id, artifact: artifact.id }, props: { pack, artifact } })));
}

// Refinement hierarchy: roots refine nothing inside the pack; children are
// the diagrams that refine them.
/** @typedef {{ artifact: PackArtifact, children: TreeNode[], views: PackArtifact[] }} TreeNode */
/** @param {Pack} pack @returns {TreeNode[]} */
export function refinementTree(pack) {
  const byId = new Map(pack.artifacts.map((artifact) => [artifact.id, artifact]));
  const seen = new Set();
  /** @param {PackArtifact} artifact @returns {TreeNode | null} */
  const node = (artifact) => {
    if (seen.has(artifact.id)) return null;
    seen.add(artifact.id);
    const children = artifact.refinedBy.flatMap((id) => { const child = byId.get(id); return child ? [child] : []; });
    // An alternate view (deployment) sits beside its diagram, so it is listed
    // separately from the diagrams that zoom into it.
    const views = (artifact.views || []).flatMap((id) => { const view = byId.get(id); return view && !seen.has(view.id) ? [view] : []; });
    views.forEach((view) => seen.add(view.id));
    return { artifact, children: children.flatMap((child) => { const branch = node(child); return branch ? [branch] : []; }), views };
  };
  return pack.artifacts.filter((artifact) => !artifact.refines.some((id) => byId.has(id)) && !(artifact.viewOf || []).some((id) => byId.has(id))).flatMap((artifact) => { const branch = node(artifact); return branch ? [branch] : []; });
}

/** @type {Record<string, Copy>} */
export const ROLE_LABELS = ROLES;
