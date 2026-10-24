// Standalone "architecture center" for one document pack: a single
// self-contained index.html with a document navigator, facet filters, the
// viewpoint matrix, the refinement hierarchy, a traceability table, and a
// per-diagram view that embeds the rendered artifact beside its metadata.
// It works from file:// (no network, no build step) and needs JavaScript only
// for routing, filtering and theme; the overview and every diagram panel are
// server-rendered so the markup stays reviewable.

const LEVELS = ['business', 'system', 'implementation'];
const CONCERNS = ['data', 'behavior', 'structure'];
const ALL_CONCERNS = [...CONCERNS, 'cross-cutting'];
const TYPE_ORDER = ['architecture', 'workflow', 'sequence', 'dataflow', 'lifecycle', 'erd', 'tree', 'class', 'timeline', 'waterfall', 'explainer'];
const ROLE_ORDER = ['business-analyst', 'system-analyst', 'architect', 'software-designer', 'developer', 'operator'];
const C4_LABEL = { context: 'C4 L1', container: 'C4 L2', component: 'C4 L3', code: 'C4 L4', deployment: 'Deployment' };

const UI = {
  en: {
    pack: 'Document pack', nav: 'Document navigator', skip: 'Skip to content',
    overview: 'Overview', diagrams: 'diagrams', documents: 'documents', elements: 'traced elements', checks: 'artifact checks passed',
    filter: 'Filter', clearAll: 'Clear all', role: 'Role', document: 'Document', level: 'Abstraction level', concern: 'Concern', type: 'Diagram type',
    matrix: 'Viewpoint matrix', otherViewpoints: 'Outside the matrix',
    hierarchy: 'Refinement hierarchy', hierarchyHint: 'Each diagram sits under the more abstract diagram it refines: business views at the top, schema and code at the bottom.',
    traceability: 'Traceability', traceHint: 'Stable element IDs follow one process, container, component or entity across every diagram it appears on.',
    element: 'Element', owner: 'Owner', status: 'Status', appearsIn: 'Appears in',
    diagram: 'Diagram', typeLabel: 'Type', levelLabel: 'Level', concernLabel: 'Concern', rolesLabel: 'Roles',
    inDocuments: 'In documents', refines: 'Refines', refinedBy: 'Refined by', top: 'Top of the hierarchy.', drillDown: 'Drill-down', traced: 'Traced elements',
    views: 'Alternate views', viewOf: 'A view of', viewTag: 'view',
    files: 'Files', openStandalone: 'Open standalone diagram', openSource: 'Authored source',
    showing: 'Showing {n} of {t} diagrams', noMatch: 'No diagrams match these filters.',
    theme: 'Theme', auto: 'Auto', light: 'Light', dark: 'Dark', frame: 'live Archify diagram',
  },
  'zh-TW': {
    pack: '文件包', nav: '文件導覽', skip: '跳至內容',
    overview: '總覽', diagrams: '張圖', documents: '份文件', elements: '個追溯元素', checks: '項成品檢查通過',
    filter: '篩選', clearAll: '全部清除', role: '角色', document: '文件', level: '抽象層級', concern: '關注點', type: '圖表類型',
    matrix: '視角矩陣', otherViewpoints: '矩陣之外',
    hierarchy: '細化層級', hierarchyHint: '每張圖都掛在它所細化的上層圖之下：業務視圖在最上，資料表與程式碼在最下。',
    traceability: '追溯矩陣', traceHint: '穩定的元素 ID 讓同一個流程、容器、元件或實體，可以在它出現的每張圖之間追溯。',
    element: '元素', owner: '負責方', status: '狀態', appearsIn: '出現於',
    diagram: '圖表', typeLabel: '類型', levelLabel: '層級', concernLabel: '關注點', rolesLabel: '角色',
    inDocuments: '所屬文件', refines: '細化自', refinedBy: '被細化為', top: '位於層級頂端。', drillDown: '下鑽', traced: '追溯元素',
    views: '其他視角', viewOf: '是下列圖的視角', viewTag: '視角',
    files: '檔案', openStandalone: '獨立開啟圖表', openSource: '原始檔',
    showing: '顯示 {n} / {t} 張圖', noMatch: '沒有符合篩選條件的圖。',
    theme: '主題', auto: '自動', light: '淺色', dark: '深色', frame: 'Archify 互動式圖表',
  },
  'zh-CN': {
    pack: '文档包', nav: '文档导览', skip: '跳至内容',
    overview: '总览', diagrams: '张图', documents: '份文档', elements: '个追溯元素', checks: '项成品检查通过',
    filter: '筛选', clearAll: '全部清除', role: '角色', document: '文档', level: '抽象层级', concern: '关注点', type: '图表类型',
    matrix: '视角矩阵', otherViewpoints: '矩阵之外',
    hierarchy: '细化层级', hierarchyHint: '每张图都挂在它所细化的上层图之下：业务视图在最上，数据表与代码在最下。',
    traceability: '追溯矩阵', traceHint: '稳定的元素 ID 让同一个流程、容器、组件或实体，可以在它出现的每张图之间追溯。',
    element: '元素', owner: '负责方', status: '状态', appearsIn: '出现于',
    diagram: '图表', typeLabel: '类型', levelLabel: '层级', concernLabel: '关注点', rolesLabel: '角色',
    inDocuments: '所属文档', refines: '细化自', refinedBy: '被细化为', top: '位于层级顶端。', drillDown: '下钻', traced: '追溯元素',
    views: '其他视角', viewOf: '是下列图的视角', viewTag: '视角',
    files: '文件', openStandalone: '独立打开图表', openSource: '源文件',
    showing: '显示 {n} / {t} 张图', noMatch: '没有符合筛选条件的图。',
    theme: '主题', auto: '自动', light: '浅色', dark: '深色', frame: 'Archify 交互式图表',
  },
};

const LABELS = {
  en: {
    level: { business: 'Business', system: 'System', implementation: 'Implementation' },
    concern: { data: 'Data', behavior: 'Behavior', structure: 'Structure', 'cross-cutting': 'Cross-cutting' },
    type: { architecture: 'Architecture', workflow: 'Workflow', sequence: 'Sequence', dataflow: 'Data flow', lifecycle: 'Lifecycle', erd: 'ERD', tree: 'Tree', class: 'Class', timeline: 'Timeline', waterfall: 'Waterfall', explainer: 'Explainer' },
    role: { 'business-analyst': 'Business analyst', 'system-analyst': 'System analyst', architect: 'Software architect', 'software-designer': 'Software designer', developer: 'Developer', operator: 'Operator / SRE' },
    status: { current: 'current', partial: 'partial', target: 'target' },
  },
  'zh-TW': {
    level: { business: '業務', system: '系統', implementation: '實作' },
    concern: { data: '資料', behavior: '行為', structure: '結構', 'cross-cutting': '橫切' },
    type: { architecture: '架構圖', workflow: '工作流程', sequence: '時序圖', dataflow: '資料流', lifecycle: '生命週期', erd: '實體關係圖', tree: '樹狀圖', class: '類別圖', timeline: '時間軸', waterfall: '瀑布圖', explainer: '一頁式解答' },
    role: { 'business-analyst': '業務分析師', 'system-analyst': '系統分析師', architect: '軟體架構師', 'software-designer': '軟體設計師', developer: '開發者', operator: '維運 / SRE' },
    status: { current: '現況', partial: '部分落地', target: '目標' },
  },
  'zh-CN': {
    level: { business: '业务', system: '系统', implementation: '实现' },
    concern: { data: '数据', behavior: '行为', structure: '结构', 'cross-cutting': '横切' },
    type: { architecture: '架构图', workflow: '工作流', sequence: '时序图', dataflow: '数据流', lifecycle: '生命周期', erd: '实体关系图', tree: '树图', class: '类图', timeline: '时间线', waterfall: '瀑布图', explainer: '一页式解答' },
    role: { 'business-analyst': '业务分析师', 'system-analyst': '系统分析师', architect: '软件架构师', 'software-designer': '软件设计师', developer: '开发者', operator: '运维 / SRE' },
    status: { current: '现状', partial: '部分落地', target: '目标' },
  },
};

// zh-TW and Hant variants share one catalogue; any other zh is Simplified.
export function resolveUiLocale(locale) {
  const tag = String(locale || 'en').toLowerCase();
  if (/^zh-(tw|hk|mo|hant)/.test(tag)) return 'zh-TW';
  if (tag.startsWith('zh')) return 'zh-CN';
  return 'en';
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

// Keep path separators, encode everything else a URL would reinterpret.
function href(output) {
  return output.split('/').map(encodeURIComponent).join('/');
}

function scriptJson(value) {
  return JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e').replaceAll('&', '\\u0026');
}

export function packIndexHtml(manifest) {
  const locale = resolveUiLocale(manifest.locale);
  const t = UI[locale];
  const labels = LABELS[locale];
  const { artifacts, documents } = manifest;
  const byId = new Map(artifacts.map((artifact) => [artifact.id, artifact]));
  const kindOf = (id) => documents.find((document) => document.id === id)?.kind || id;

  const typeLabel = (artifact) => `${labels.type[artifact.type] || artifact.type}${artifact.viewpoint?.c4_level ? ` · ${C4_LABEL[artifact.viewpoint.c4_level]}` : ''}`;
  const facetData = (artifact) => ({
    role: (artifact.viewpoint?.roles || []).join(' '),
    document: [...new Set(artifact.documents.map((entry) => kindOf(entry.document)))].join(' '),
    level: artifact.viewpoint?.level || '',
    concern: artifact.viewpoint?.concern || '',
    type: artifact.type,
  });
  const facetAttrs = (artifact) => Object.entries(facetData(artifact)).map(([name, value]) => ` data-${name}="${esc(value)}"`).join('');
  const route = (id, focus) => `#a=${encodeURIComponent(id)}${focus ? `&amp;focus=${encodeURIComponent(focus)}` : ''}`;
  const link = (artifact, { focus, chip = true, className = '' } = {}) =>
    `<a class="af ${className}" data-nav="${esc(artifact.id)}" href="${route(artifact.id, focus)}"${facetAttrs(artifact)}>${chip ? `<span class="chip">${esc(typeLabel(artifact))}</span>` : ''}<span>${esc(artifact.title)}</span></a>`;

  // ---- facets: only the values this pack actually uses, in canonical order.
  const used = (pick) => new Set(artifacts.flatMap((artifact) => pick(artifact)));
  const facets = [
    ['role', t.role, ROLE_ORDER.filter((value) => used((a) => a.viewpoint?.roles || []).has(value)), labels.role],
    ['document', t.document, documents.map((document) => document.kind || document.id).filter((value, index, all) => all.indexOf(value) === index), Object.fromEntries(documents.map((document) => [document.kind || document.id, document.kind || document.id]))],
    ['level', t.level, LEVELS.filter((value) => used((a) => [a.viewpoint?.level]).has(value)), labels.level],
    ['concern', t.concern, ALL_CONCERNS.filter((value) => used((a) => [a.viewpoint?.concern]).has(value)), labels.concern],
    ['type', t.type, TYPE_ORDER.filter((value) => used((a) => [a.type]).has(value)), labels.type],
  ].filter(([, , values]) => values.length > 1);
  const facetHtml = facets.map(([name, title, values, text]) => `<fieldset class="facet"><legend>${esc(title)}</legend>${values.map((value) => `<label><input type="checkbox" data-facet="${name}" value="${esc(value)}"> <span>${esc(text[value] || value)}</span></label>`).join('')}</fieldset>`).join('');

  // ---- sidebar: documents, sections and their diagrams.
  const sidebarDocs = documents.map((document) => `<section class="side-doc"><h2><span class="doc-id">${esc(document.id)}</span>${esc(document.title)}</h2><ol>${document.sections.map((section) => `<li><span class="sec-id">${esc(section.id)}</span> ${esc(section.title)}<div>${section.artifacts.map((id) => byId.get(id)).filter(Boolean).map((artifact) => link(artifact, { chip: false, className: 'side-art' })).join('')}</div></li>`).join('')}</ol></section>`).join('');

  // ---- overview.
  const cell = (level, concern) => artifacts.filter((artifact) => artifact.viewpoint?.level === level && artifact.viewpoint?.concern === concern);
  const matrix = `<div class="table-wrap"><table class="matrix"><thead><tr><th><span class="sr-only">${esc(t.level)}</span></th>${CONCERNS.map((concern) => `<th scope="col">${esc(labels.concern[concern])}</th>`).join('')}</tr></thead><tbody>${LEVELS.map((level) => `<tr><th scope="row">${esc(labels.level[level])}</th>${CONCERNS.map((concern) => {
    const items = cell(level, concern);
    return `<td>${items.length ? items.map((artifact) => link(artifact)).join('') : '<span class="empty">—</span>'}</td>`;
  }).join('')}</tr>`).join('')}</tbody></table></div>`;
  const others = artifacts.filter((artifact) => !LEVELS.includes(artifact.viewpoint?.level) || !CONCERNS.includes(artifact.viewpoint?.concern));

  // Alternate views (a deployment of the containers) hang under their diagram
  // but are marked, because they sit beside it rather than one level below.
  const roots = artifacts.filter((artifact) => !artifact.refines.some((id) => byId.has(id)) && !(artifact.viewOf || []).some((id) => byId.has(id)));
  const seen = new Set();
  const branch = (artifact) => {
    if (seen.has(artifact.id)) return '';
    seen.add(artifact.id);
    const children = artifact.refinedBy.map((id) => byId.get(id)).filter(Boolean);
    const views = (artifact.views || []).map((id) => byId.get(id)).filter(Boolean);
    const items = [...children.map(branch), ...views.filter((view) => !seen.has(view.id)).map((view) => { seen.add(view.id); return `<li class="view-item">${link(view)}<span class="view-tag">${esc(t.viewTag)}</span></li>`; })];
    return `<li>${link(artifact)}${items.length ? `<ul>${items.join('')}</ul>` : ''}</li>`;
  };
  const hierarchy = `<ul class="tree">${roots.map(branch).join('')}</ul>`;

  const trace = manifest.elements.length ? `<section><h2>${esc(t.traceability)}</h2><p class="hint">${esc(t.traceHint)}</p><div class="table-wrap"><table class="trace"><thead><tr><th>ID</th><th>${esc(t.element)}</th><th>${esc(t.owner)}</th><th>${esc(t.status)}</th><th>${esc(t.appearsIn)}</th></tr></thead><tbody>${manifest.elements.map((element) => `<tr><td><code>${esc(element.id)}</code></td><td>${esc(element.label)}</td><td>${esc(element.owner || '')}</td><td>${element.status ? `<span class="badge ${esc(element.status)}">${esc(labels.status[element.status] || element.status)}</span>` : ''}</td><td>${element.appearsIn.map((place) => {
    const artifact = byId.get(place.artifact);
    return artifact ? `<a class="trace-link" href="${route(artifact.id, place.node)}">${esc(artifact.title)}</a>` : '';
  }).filter(Boolean).join(', ')}</td></tr>`).join('')}</tbody></table></div></section>` : '';

  const checked = artifacts.filter((artifact) => artifact.check === true).length;
  const stats = `<div class="stats"><div><strong>${documents.length}</strong><span>${esc(t.documents)}</span></div><div><strong>${artifacts.length}</strong><span>${esc(t.diagrams)}</span></div><div><strong>${manifest.elements.length}</strong><span>${esc(t.elements)}</span></div>${artifacts.some((artifact) => artifact.check !== undefined) ? `<div><strong>${checked}/${artifacts.length}</strong><span>${esc(t.checks)}</span></div>` : ''}</div>`;

  const overview = `<section class="view" id="view-overview" data-view="overview"><p class="crumbs">${esc(t.pack)}</p><h1>${esc(manifest.title)}</h1>${manifest.subtitle ? `<p class="lede">${esc(manifest.subtitle)}</p>` : ''}${stats}<h2>${esc(t.matrix)}</h2>${matrix}${others.length ? `<h3>${esc(t.otherViewpoints)}</h3><div class="others">${others.map((artifact) => link(artifact)).join('')}</div>` : ''}<h2>${esc(t.hierarchy)}</h2><p class="hint">${esc(t.hierarchyHint)}</p>${hierarchy}${trace}</section>`;

  // ---- one view per diagram.
  const refinedLinks = (ids, arrow) => ids.map((id) => byId.get(id)).filter(Boolean).map((artifact) => `<li><a href="${route(artifact.id)}">${arrow} ${esc(artifact.title)}</a></li>`).join('');
  const diagramView = (artifact) => {
    const view = artifact.viewpoint || {};
    const first = artifact.documents[0];
    const byOutput = new Map(artifacts.map((item) => [item.output, item]));
    const drills = artifact.drillsInto.flatMap((entry) => { const target = byOutput.get(entry.target); return target ? [`<li><a href="${route(target.id, entry.focus)}">${esc(entry.node)} → ${esc(entry.label || target.title)}</a></li>`] : []; });
    const drilledFrom = artifact.drilledFrom.map((id) => byId.get(id)).filter(Boolean).map((item) => `<li><a href="${route(item.id)}">← ${esc(item.title)}</a></li>`);
    const elements = Object.entries(artifact.elements || {}).flatMap(([node, id]) => { const element = manifest.elements.find((item) => item.id === id); return element ? [`<li><a href="${route(artifact.id, node)}"><code>${esc(element.id)}</code> ${esc(element.label)}</a></li>`] : []; });
    const roles = (view.roles || []).map((role) => labels.role[role] || role).join(locale === 'en' ? ', ' : '、');
    const rows = [
      [t.typeLabel, esc(typeLabel(artifact))],
      view.level ? [t.levelLabel, esc(labels.level[view.level] || view.level)] : null,
      view.concern ? [t.concernLabel, esc(labels.concern[view.concern] || view.concern)] : null,
      view.status ? [t.status, `<span class="badge ${esc(view.status)}">${esc(labels.status[view.status] || view.status)}</span>`] : null,
      roles ? [t.rolesLabel, esc(roles)] : null,
    ].filter(Boolean).map(([name, value]) => `<dt>${esc(name)}</dt><dd>${value}</dd>`).join('');
    const parents = refinedLinks(artifact.refines, '↑');
    const children = refinedLinks(artifact.refinedBy, '↓');
    const viewOf = refinedLinks(artifact.viewOf || [], '↔');
    const views = refinedLinks(artifact.views || [], '↔');
    return `<section class="view" id="view-${esc(artifact.id)}" data-view="${esc(artifact.id)}" hidden><p class="crumbs"><a href="#overview">${esc(manifest.title)}</a> › ${first ? `<span>${esc(first.document)} · ${esc(first.section)} ${esc(first.title)}</span> › ` : ''}<span>${esc(artifact.title)}</span></p><h1>${esc(artifact.title)}</h1>${artifact.subtitle ? `<p class="lede">${esc(artifact.subtitle)}</p>` : ''}<div class="stage"><div class="frame"><iframe title="${esc(`${artifact.title} — ${t.frame}`)}" data-base="${esc(href(artifact.output))}"></iframe></div><aside class="info">`
      + `<section><h2>${esc(t.diagram)}</h2><dl>${rows}</dl></section>`
      + `<section><h2>${esc(t.inDocuments)}</h2><ul>${artifact.documents.map((entry) => `<li>${esc(entry.section)} · ${esc(entry.title)}</li>`).join('')}</ul></section>`
      + (viewOf ? `<section><h2>${esc(t.viewOf)}</h2><ul>${viewOf}</ul></section>` : `<section><h2>${esc(t.refines)}</h2>${parents ? `<ul>${parents}</ul>` : `<p class="none">${esc(t.top)}</p>`}${children ? `<h2 class="sub">${esc(t.refinedBy)}</h2><ul>${children}</ul>` : ''}${views ? `<h2 class="sub">${esc(t.views)}</h2><ul>${views}</ul>` : ''}</section>`)
      + `${drills.length || drilledFrom.length ? `<section><h2>${esc(t.drillDown)}</h2><ul>${drills.join('')}${drilledFrom.join('')}</ul></section>` : ''}`
      + `${elements.length ? `<section><h2>${esc(t.traced)}</h2><ul>${elements.join('')}</ul></section>` : ''}`
      + `<section><h2>${esc(t.files)}</h2><ul><li><a href="${esc(href(artifact.output))}" target="_blank" rel="noopener">${esc(t.openStandalone)} ↗</a></li><li><code>${esc(artifact.source)}</code></li></ul></section>`
      + '</aside></div></section>';
  };

  const data = { outputs: Object.fromEntries(artifacts.map((artifact) => [artifact.id, href(artifact.output)])), titles: Object.fromEntries(artifacts.map((artifact) => [artifact.id, artifact.title])), pack: manifest.title, showing: t.showing };

  return `<!DOCTYPE html>
<html lang="${esc(locale)}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="generator" content="archify pack">
<title>${esc(manifest.title)}</title>
<style>
:root { --bg:#fff; --surface:#f2f3f3; --raised:#fff; --line:#d1d5db; --hair:#e9ebed; --text:#16191f; --muted:#545b64; --navy:#232f3e; --accent:#0972d3; --ok:#037f0c; --warn:#8d6605; color-scheme:light; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#0f1b2a; --surface:#16202d; --raised:#16202d; --line:#414d5c; --hair:#2a3644; --text:#e9ebed; --muted:#b6bec9; --navy:#0b1420; --accent:#539fe5; --ok:#69ae34; --warn:#d9a43b; color-scheme:dark; } }
:root[data-theme="dark"] { --bg:#0f1b2a; --surface:#16202d; --raised:#16202d; --line:#414d5c; --hair:#2a3644; --text:#e9ebed; --muted:#b6bec9; --navy:#0b1420; --accent:#539fe5; --ok:#69ae34; --warn:#d9a43b; color-scheme:dark; }
* { box-sizing:border-box; }
[hidden] { display:none !important; }
body { margin:0; background:var(--bg); color:var(--text); font:15px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans','PingFang TC','PingFang SC','Microsoft JhengHei','Microsoft YaHei',sans-serif; }
a { color:var(--accent); text-decoration:none; }
a:hover { text-decoration:underline; }
code { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:.9em; }
.sr-only { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; }
.skip { position:absolute; left:-999px; } .skip:focus { left:8px; top:8px; z-index:20; background:var(--bg); padding:.4rem .7rem; }
.top { position:sticky; top:0; z-index:10; display:flex; align-items:center; justify-content:space-between; gap:1rem; padding:.6rem 1.25rem; background:var(--navy); color:#fff; }
.top a.brand { color:#fff; font-weight:600; font-size:1.05rem; }
.top .tools { display:flex; align-items:center; gap:.5rem; font-size:.8125rem; color:#d1d5db; }
.top .tools button { border:1px solid rgba(255,255,255,.3); background:none; color:#d1d5db; padding:.2rem .6rem; border-radius:3px; cursor:pointer; font:inherit; }
.top .tools button[aria-pressed="true"] { background:#fff; color:var(--navy); }
.layout { display:grid; grid-template-columns:310px minmax(0,1fr); min-height:calc(100vh - 48px); }
.side { position:sticky; top:48px; align-self:start; max-height:calc(100vh - 48px); overflow:auto; padding:1rem; border-right:1px solid var(--line); background:var(--surface); }
.side > a.overview { display:block; padding:.4rem .6rem; margin-bottom:.8rem; border:1px solid var(--line); border-radius:3px; background:var(--raised); font-weight:600; color:var(--text); }
.side > a.overview[aria-current="page"] { border-color:var(--accent); color:var(--accent); }
.filters { margin-bottom:1rem; border:1px solid var(--line); border-radius:3px; background:var(--raised); }
.filters > summary { display:flex; align-items:center; justify-content:space-between; padding:.5rem .7rem; cursor:pointer; font-weight:600; }
.filters[open] > summary { border-bottom:1px solid var(--hair); }
.filters .clear { border:0; background:none; color:var(--accent); cursor:pointer; font:inherit; font-size:.8125rem; padding:0; }
.facet { margin:0; padding:.4rem .7rem .5rem; border:0; border-top:1px solid var(--hair); }
.facet legend { padding:0; font-size:.6875rem; font-weight:600; letter-spacing:.04em; text-transform:uppercase; color:var(--muted); }
.facet label { display:flex; align-items:center; gap:.4rem; padding:.1rem 0; font-size:.875rem; cursor:pointer; }
.facet input { accent-color:var(--accent); }
.count { margin:.2rem 0 .8rem; font-size:.8125rem; color:var(--muted); }
.side-doc { margin-bottom:1rem; }
.side-doc h2 { margin:0 0 .3rem; font-size:.9375rem; }
.side-doc ol { margin:0; padding:0; list-style:none; }
.side-doc li { padding:.35rem 0; border-top:1px solid var(--hair); font-size:.8125rem; color:var(--muted); }
.doc-id, .sec-id { margin-right:.4rem; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:.75rem; color:var(--muted); }
.af { display:flex; flex-wrap:wrap; align-items:baseline; gap:.35rem; margin:.15rem 0; }
.af[hidden] { display:none; }
.side-art { padding:.15rem .4rem; margin-left:-.4rem; border-radius:3px; font-size:.875rem; font-weight:600; }
.side-art[aria-current="page"] { background:var(--navy); color:#fff; }
.chip { padding:0 .35rem; border:1px solid var(--line); border-radius:3px; font-size:.6875rem; color:var(--muted); font-weight:400; }
main { min-width:0; padding:1.5rem 2rem 3rem; }
.crumbs { margin:0 0 .6rem; font-size:.8125rem; color:var(--muted); }
h1 { margin:0 0 .4rem; font-size:1.75rem; line-height:1.25; letter-spacing:-.01em; }
h2 { margin:2rem 0 .7rem; padding-bottom:.4rem; border-bottom:1px solid var(--line); font-size:1.15rem; }
h3 { margin:1.4rem 0 .5rem; font-size:1rem; }
.lede { max-width:760px; margin:0 0 .6rem; color:var(--muted); }
.hint { max-width:760px; margin:-.2rem 0 .8rem; color:var(--muted); font-size:.875rem; }
.stats { display:flex; flex-wrap:wrap; gap:1.5rem; margin:.8rem 0 .4rem; }
.stats div { display:flex; flex-direction:column; }
.stats strong { font-size:1.5rem; font-weight:600; line-height:1.2; }
.stats span { color:var(--muted); font-size:.75rem; }
.table-wrap { overflow-x:auto; }
table { border-collapse:collapse; width:100%; background:var(--raised); }
th, td { border:1px solid var(--line); padding:.5rem .7rem; text-align:left; vertical-align:top; }
thead th { background:var(--navy); color:#fff; font-weight:600; }
.matrix tbody th { width:7.5rem; background:var(--surface); }
.matrix td { width:30%; }
.matrix .af { margin:.1rem 0 .4rem; }
.empty { color:var(--muted); }
.others { display:flex; flex-direction:column; }
.tree, .tree ul { margin:0; padding-left:0; list-style:none; }
.tree ul { margin-left:.6rem; padding-left:1.1rem; border-left:1px solid var(--line); }
.tree li { padding:.25rem 0; }
.tree .af { display:inline-flex; font-weight:600; }
.view-tag { margin-left:.4rem; padding:0 .35rem; border:1px dashed var(--line); border-radius:3px; font-size:.6875rem; color:var(--muted); }
.trace td:first-child, .trace td:nth-child(3), .trace td:nth-child(4) { white-space:nowrap; }
.badge { padding:0 .4rem; border:1px solid currentColor; border-radius:3px; font-size:.75rem; }
.badge.current { color:var(--ok); } .badge.partial { color:var(--warn); } .badge.target { color:var(--accent); border-style:dashed; }
.stage { display:grid; grid-template-columns:minmax(0,1fr) 290px; gap:1.25rem; align-items:start; margin-top:1rem; }
.frame { border:1px solid var(--line); border-radius:4px; overflow:hidden; background:#fff; }
.frame iframe { display:block; width:100%; height:clamp(440px, calc(100vh - 230px), 920px); border:0; }
.info section { margin-bottom:.9rem; padding:.8rem .9rem; border:1px solid var(--line); border-radius:4px; background:var(--raised); }
.info h2 { margin:0 0 .5rem; padding:0; border:0; font-size:.75rem; letter-spacing:.04em; text-transform:uppercase; color:var(--muted); }
.info h2.sub { margin-top:.8rem; }
.info dl { display:grid; grid-template-columns:auto 1fr; gap:.3rem .8rem; margin:0; font-size:.875rem; }
.info dt { color:var(--muted); } .info dd { margin:0; }
.info ul { margin:0; padding:0; list-style:none; font-size:.875rem; }
.info li { padding:.2rem 0; }
.none { margin:0; color:var(--muted); font-size:.8125rem; }
@media (max-width:1100px) { .stage { grid-template-columns:1fr; } }
@media (max-width:900px) { .layout { grid-template-columns:1fr; } .side { position:static; max-height:none; border-right:0; border-bottom:1px solid var(--line); } main { padding:1.2rem 1rem 2.5rem; } }
</style>
</head>
<body>
<a class="skip" href="#main">${esc(t.skip)}</a>
<header class="top"><a class="brand" href="#overview">${esc(manifest.title)}</a><div class="tools" role="group" aria-label="${esc(t.theme)}"><span>${esc(t.theme)}</span>${[['auto', t.auto], ['light', t.light], ['dark', t.dark]].map(([value, text]) => `<button type="button" data-theme-choice="${value}" aria-pressed="${value === 'auto'}">${esc(text)}</button>`).join('')}</div></header>
<div class="layout">
<nav class="side" aria-label="${esc(t.nav)}">
<a class="overview" href="#overview" data-nav="overview">${esc(t.overview)}</a>
${facets.length ? `<details class="filters"><summary><span>${esc(t.filter)}</span><button type="button" class="clear" data-facet-clear>${esc(t.clearAll)}</button></summary>${facetHtml}</details>` : ''}
<p class="count" data-count aria-live="polite"></p>
${sidebarDocs}
</nav>
<main id="main">
${overview}
${artifacts.map(diagramView).join('\n')}
<p class="count" data-empty hidden>${esc(t.noMatch)}</p>
</main>
</div>
<script type="application/json" id="pack-data">${scriptJson(data)}</script>
<script>
(function () {
  'use strict';
  var data = JSON.parse(document.getElementById('pack-data').textContent);
  var root = document.documentElement;
  var views = Array.prototype.slice.call(document.querySelectorAll('[data-view]'));
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('[data-nav]'));
  var has = function (id) { return Object.prototype.hasOwnProperty.call(data.outputs, id); };

  // Theme: Auto follows the system; the choice is remembered when storage works.
  var KEY = 'archify-pack-theme';
  var pref = 'auto';
  try { var stored = localStorage.getItem(KEY); if (stored === 'light' || stored === 'dark') pref = stored; } catch (_) {}
  var dark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function theme() { return pref === 'auto' ? (dark && dark.matches ? 'dark' : 'light') : pref; }
  function applyTheme() {
    if (pref === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', pref);
    Array.prototype.forEach.call(document.querySelectorAll('[data-theme-choice]'), function (button) {
      button.setAttribute('aria-pressed', String(button.getAttribute('data-theme-choice') === pref));
    });
    var active = views.filter(function (view) { return !view.hidden && view.querySelector('iframe'); })[0];
    if (active) load(active, currentFocus);
  }
  Array.prototype.forEach.call(document.querySelectorAll('[data-theme-choice]'), function (button) {
    button.addEventListener('click', function () {
      pref = button.getAttribute('data-theme-choice');
      try { if (pref === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, pref); } catch (_) {}
      applyTheme();
    });
  });
  if (dark && dark.addEventListener) dark.addEventListener('change', function () { if (pref === 'auto') applyTheme(); });

  // A diagram loads when first shown. Changing only the focus swaps the URL
  // fragment, which the viewer follows without reloading.
  var currentFocus = null;
  function load(view, focus) {
    var frame = view.querySelector('iframe');
    var head = frame.getAttribute('data-base') + '?embed=1&preset=reference&theme=' + theme();
    var current = frame.getAttribute('src') || '';
    var fragment = focus ? '#focus=' + encodeURIComponent(focus) : '';
    if (current.split('#')[0] !== head) frame.setAttribute('src', head + fragment);
    else if (fragment && current.slice(head.length) !== fragment) frame.setAttribute('src', head + fragment);
  }

  function route() {
    var params = new URLSearchParams(location.hash.replace(/^#/, ''));
    var id = params.get('a');
    if (!id || !has(id)) id = 'overview';
    currentFocus = params.get('focus');
    views.forEach(function (view) { view.hidden = view.getAttribute('data-view') !== id; });
    navLinks.forEach(function (link) {
      if (link.getAttribute('data-nav') === id) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    });
    if (id !== 'overview') load(views.filter(function (view) { return view.getAttribute('data-view') === id; })[0], currentFocus);
    document.title = (id === 'overview' ? data.pack : data.titles[id] + ' — ' + data.pack);
    var current = document.querySelector('.side-art[aria-current="page"]');
    if (current && current.scrollIntoView) current.scrollIntoView({ block: 'nearest' });
    // On a narrow screen the navigator stacks above the content, so jump past it.
    var narrow = window.matchMedia && window.matchMedia('(max-width: 900px)').matches;
    if (initial) { initial = false; return; }
    if (currentFocus) return;
    if (narrow && id !== 'overview') document.getElementById('main').scrollIntoView(); else window.scrollTo(0, 0);
  }
  var initial = true;
  window.addEventListener('hashchange', route);

  // Facets: values inside one facet widen the match, different facets narrow it.
  var boxes = Array.prototype.slice.call(document.querySelectorAll('input[data-facet]'));
  var items = Array.prototype.slice.call(document.querySelectorAll('.af'));
  var count = document.querySelector('[data-count]');
  var emptyNote = document.querySelector('[data-empty]');
  function filter() {
    var chosen = {};
    boxes.forEach(function (box) { if (box.checked) (chosen[box.getAttribute('data-facet')] = chosen[box.getAttribute('data-facet')] || []).push(box.value); });
    var visible = {};
    items.forEach(function (item) {
      var match = Object.keys(chosen).every(function (facet) {
        var values = (item.getAttribute('data-' + facet) || '').split(' ');
        return chosen[facet].some(function (value) { return values.indexOf(value) >= 0; });
      });
      item.hidden = !match;
      if (match) visible[item.getAttribute('data-nav')] = true;
    });
    var shown = Object.keys(visible).length;
    var total = Object.keys(data.outputs).length;
    count.textContent = data.showing.replace('{n}', shown).replace('{t}', total);
    emptyNote.hidden = shown !== 0;
  }
  boxes.forEach(function (box) { box.addEventListener('change', filter); });
  var clear = document.querySelector('[data-facet-clear]');
  if (clear) clear.addEventListener('click', function (event) {
    event.preventDefault();
    boxes.forEach(function (box) { box.checked = false; });
    filter();
  });
  filter();
  applyTheme();
  route();
})();
</script>
</body>
</html>
`;
}
