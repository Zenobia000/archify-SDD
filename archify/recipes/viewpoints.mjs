// Engineering viewpoints: which native diagram answers which design-document
// question, for which role, at which abstraction level. The matrix rows are
// abstraction levels (business, system, implementation); the columns are
// concerns (data, behavior, structure). Viewpoints marked `extra` sit outside
// the matrix but belong to the same documents.

export const LEVELS = ['business', 'system', 'implementation'];
export const CONCERNS = ['data', 'behavior', 'structure'];

export const ROLES = {
  'business-analyst': { en: 'Business analyst', zh: '业务分析师' },
  'system-analyst': { en: 'System analyst', zh: '系统分析师' },
  architect: { en: 'Software architect', zh: '软件架构师' },
  'software-designer': { en: 'Software designer', zh: '软件设计师' },
  developer: { en: 'Developer', zh: '开发者' },
  operator: { en: 'Operator / SRE', zh: '运维 / SRE' },
};

export const DOCUMENTS = {
  BRD: {
    roles: ['business-analyst', 'system-analyst'],
    en: { title: 'Business Requirements Document', purpose: 'Why the system exists: business processes, actors, and the information they exchange.' },
    zh: { title: '业务需求文档（BRD）', purpose: '系统为什么存在：业务流程、参与者与彼此交换的信息。' },
  },
  SRS: {
    roles: ['system-analyst', 'software-designer'],
    en: { title: 'Software Requirements Specification', purpose: 'What the system must do: functional flows, data flows, and states seen from outside.' },
    zh: { title: '软件需求规格（SRS）', purpose: '系统必须做什么：功能流程、数据流与对外可见的状态。' },
  },
  SAD: {
    roles: ['architect'],
    en: { title: 'Software Architecture Document', purpose: 'How the system is shaped: context, containers, deployment, and cross-cutting decisions.' },
    zh: { title: '软件架构文档（SAD）', purpose: '系统如何构成：上下文、容器、部署与横切决策。' },
  },
  SDD: {
    roles: ['software-designer', 'developer'],
    en: { title: 'Software Design Document', purpose: 'How each part is built: components, interactions, data design, states, and modules.' },
    zh: { title: '软件设计文档（SDD）', purpose: '每个部分如何实现：组件、交互、数据设计、状态与模块。' },
  },
  ADR: {
    roles: ['architect'],
    en: { title: 'Architecture Decision Record', purpose: 'One significant decision: context, options, the choice, and its consequences.' },
    zh: { title: '架构决策记录（ADR）', purpose: '一项重要决策：背景、选项、结论与影响。' },
  },
};

function viewpoint(id, fields) {
  return Object.freeze({ id, ...fields });
}

export const VIEWPOINTS = Object.freeze([
  viewpoint('business-dataflow', {
    level: 'business', concern: 'data', type: 'dataflow', documents: ['BRD'], roles: ['business-analyst', 'system-analyst'],
    signals: [['business data flow', 14], ['information flow', 10], ['where documents go', 10], ['where money goes', 10], ['业务数据流', 14], ['業務資料流', 14], ['信息流', 8], ['資訊流', 8]],
    en: { title: 'Business data flow', question: 'Which business documents, money, and information move between actors?', include: ['actors and business stores', 'documents or money as flow labels', 'no technical components'] },
    zh: { title: '业务数据流', question: '哪些业务单据、资金与信息在参与者之间流动？', include: ['参与者与业务存储', '以单据或金额作为流标签', '不出现技术组件'] },
  }),
  viewpoint('business-process', {
    level: 'business', concern: 'behavior', type: 'workflow', documents: ['BRD'], roles: ['business-analyst', 'system-analyst'],
    signals: [['business process', 14], ['bpmn', 12], ['swimlane', 8], ['as-is process', 10], ['to-be process', 10], ['业务流程', 14], ['業務流程', 14], ['泳道', 8]],
    en: { title: 'Business process', question: 'Who does what, in which order, with which business decisions?', include: ['one lane per role or department', 'business decisions as gates', 'start and end events'] },
    zh: { title: '业务流程', question: '谁按什么顺序做什么、经过哪些业务决策？', include: ['每个角色或部门一条泳道', '业务决策作为闸门', '开始与结束事件'] },
  }),
  viewpoint('system-context', {
    level: 'business', concern: 'structure', type: 'architecture', c4: 'context', documents: ['SAD'], roles: ['architect', 'system-analyst'],
    signals: [['system context', 16], ['c4 context', 16], ['c4 l1', 16], ['context diagram', 14], ['external systems', 8], ['系统上下文', 16], ['系統脈絡', 16], ['系统脉络', 16], ['外部系统', 8], ['外部系統', 8]],
    en: { title: 'System context (C4 L1)', question: 'Who uses the system and which external systems does it depend on?', include: ['the system as one box', 'people and external systems', 'labelled interactions'] },
    zh: { title: '系统上下文（C4 L1）', question: '谁使用这个系统、它依赖哪些外部系统？', include: ['系统本身只画一个框', '人员与外部系统', '带标签的交互'] },
  }),
  viewpoint('dfd-level-1', {
    level: 'system', concern: 'data', type: 'dataflow', documents: ['SRS'], roles: ['system-analyst'],
    signals: [['dfd', 14], ['data flow diagram', 14], ['level 1', 6], ['data store', 6], ['资料流程图', 14], ['資料流程圖', 14], ['数据流图', 14], ['資料流圖', 14]],
    en: { title: 'Data flow diagram (DFD L1)', question: 'Which processes transform which data, and where is it stored?', include: ['external entities', 'numbered processes', 'data stores', 'named data flows'] },
    zh: { title: '数据流图（DFD L1）', question: '哪些处理过程转换哪些数据、数据存在哪里？', include: ['外部实体', '编号的处理过程', '数据存储', '命名的数据流'] },
  }),
  viewpoint('activity', {
    level: 'system', concern: 'behavior', type: 'workflow', documents: ['SRS'], roles: ['system-analyst', 'software-designer'],
    signals: [['activity diagram', 16], ['use case flow', 10], ['functional flow', 10], ['alternate flow', 8], ['活动图', 16], ['活動圖', 16], ['用例流程', 10], ['使用案例流程', 10]],
    en: { title: 'Activity diagram', question: 'How does one use case run, including branches and alternate paths?', include: ['one use case', 'decisions and alternate paths', 'system and user lanes'] },
    zh: { title: '活动图', question: '一个用例如何执行，包括分支与替代路径？', include: ['单一用例', '决策与替代路径', '系统与用户泳道'] },
  }),
  viewpoint('container', {
    level: 'system', concern: 'structure', type: 'architecture', c4: 'container', documents: ['SAD'], roles: ['architect'],
    signals: [['container diagram', 16], ['c4 container', 16], ['c4 l2', 16], ['applications and data stores', 10], ['容器图', 16], ['容器圖', 16]],
    en: { title: 'Containers (C4 L2)', question: 'Which applications and data stores make up the system and how do they talk?', include: ['deployable apps and stores', 'technology in sublabels', 'protocols on relationships', 'the system boundary'] },
    zh: { title: '容器（C4 L2）', question: '系统由哪些应用与数据存储组成、彼此如何通信？', include: ['可部署应用与存储', '在副标签写技术', '关系上写协议', '系统边界'] },
  }),
  viewpoint('schema-er', {
    level: 'implementation', concern: 'data', type: 'erd', documents: ['SDD'], roles: ['software-designer', 'developer'],
    signals: [['schema', 10], ['erd', 14], ['entity relationship', 14], ['database design', 12], ['table design', 12], ['资料表', 10], ['資料表', 10], ['数据库设计', 12], ['資料庫設計', 12]],
    en: { title: 'Schema ER', question: 'Which tables, keys, and cardinalities implement the data?', include: ['every physical column', 'primary and foreign keys', 'cardinality'] },
    zh: { title: '数据表 ER', question: '哪些表、键与基数实现了这些数据？', include: ['所有物理字段', '主键与外键', '基数'] },
  }),
  viewpoint('sequence', {
    level: 'implementation', concern: 'behavior', type: 'sequence', documents: ['SDD'], roles: ['software-designer', 'developer'],
    signals: [['sequence diagram', 16], ['sequence', 6], ['call chain', 10], ['request lifecycle', 10], ['interaction', 6], ['时序图', 16], ['循序圖', 16], ['序列圖', 16], ['调用链', 10]],
    en: { title: 'Sequence diagram', question: 'Which components exchange which messages, in what order, for one scenario?', include: ['one scenario', 'participants from the component view', 'returns and async messages'] },
    zh: { title: '时序图', question: '在一个场景中，哪些组件按什么顺序交换哪些消息？', include: ['单一场景', '参与者来自组件视图', '返回与异步消息'] },
  }),
  viewpoint('component', {
    level: 'implementation', concern: 'structure', type: 'architecture', c4: 'component', documents: ['SDD'], roles: ['architect', 'software-designer'],
    signals: [['component diagram', 16], ['c4 component', 16], ['c4 l3', 16], ['inside the service', 8], ['组件图', 16], ['元件圖', 16]],
    en: { title: 'Components (C4 L3)', question: 'Which components live inside one container and what are their responsibilities?', include: ['one container boundary', 'components with responsibilities', 'neighbouring containers as external'] },
    zh: { title: '组件（C4 L3）', question: '一个容器内部有哪些组件、各自负责什么？', include: ['单一容器边界', '组件及其职责', '相邻容器视为外部'] },
  }),
  viewpoint('code-structure', {
    extra: true, level: 'implementation', concern: 'structure', type: 'class', c4: 'code', documents: ['SDD'], roles: ['software-designer', 'developer'],
    signals: [['class diagram', 16], ['domain model', 12], ['c4 code', 14], ['c4 l4', 14], ['类图', 16], ['類別圖', 16], ['领域模型', 12], ['領域模型', 12]],
    en: { title: 'Code structure (C4 L4)', question: 'Which types, interfaces, and relationships implement one component?', include: ['selected members only', 'relationship kinds'] },
    zh: { title: '代码结构（C4 L4）', question: '哪些类型、接口与关系实现了一个组件？', include: ['只列关键成员', '关系类型'] },
  }),
  viewpoint('state-machine', {
    extra: true, level: 'system', concern: 'behavior', type: 'lifecycle', documents: ['SRS', 'SDD'], roles: ['system-analyst', 'software-designer'],
    signals: [['state machine', 16], ['state diagram', 14], ['status transitions', 10], ['lifecycle', 8], ['状态机', 16], ['狀態機', 16], ['状态图', 14], ['狀態圖', 14]],
    en: { title: 'State machine', question: 'Which states can one business object be in, and what moves it?', include: ['one object', 'guards on transitions', 'terminal states'] },
    zh: { title: '状态机', question: '一个业务对象有哪些状态、由什么推动转换？', include: ['单一对象', '转换上的条件', '终止状态'] },
  }),
  viewpoint('deployment', {
    extra: true, level: 'system', concern: 'structure', type: 'architecture', c4: 'deployment', documents: ['SAD'], roles: ['architect', 'operator'],
    signals: [['deployment diagram', 16], ['deployment view', 14], ['infrastructure', 8], ['runtime topology', 10], ['部署图', 16], ['部署圖', 16], ['部署视图', 14], ['部署視圖', 14]],
    en: { title: 'Deployment', question: 'Where does each container run and what crosses a network boundary?', include: ['nodes and networks as boundaries', 'containers placed on nodes', 'boundary crossings'] },
    zh: { title: '部署', question: '每个容器运行在哪里、哪些连接跨越网络边界？', include: ['节点与网络作为边界', '容器放在节点上', '跨边界连接'] },
  }),
  viewpoint('module-decomposition', {
    extra: true, level: 'implementation', concern: 'structure', type: 'tree', documents: ['SDD'], roles: ['software-designer'],
    signals: [['module decomposition', 16], ['package structure', 12], ['module breakdown', 12], ['模块分解', 16], ['模組分解', 16], ['套件结构', 12]],
    en: { title: 'Module decomposition', question: 'How is the code organised into modules and packages?', include: ['single-parent containment', 'module responsibilities'] },
    zh: { title: '模块分解', question: '代码如何组织成模块与包？', include: ['单一父节点包含关系', '模块职责'] },
  }),
  viewpoint('decision-record', {
    extra: true, level: null, concern: 'cross-cutting', type: 'explainer', documents: ['ADR'], roles: ['architect'],
    signals: [['adr', 14], ['architecture decision', 16], ['decision record', 16], ['trade-off', 8], ['架构决策', 16], ['架構決策', 16], ['决策记录', 16], ['決策紀錄', 16]],
    en: { title: 'Architecture decision record', question: 'What was decided, against which options, and with what consequences?', include: ['context', 'options', 'decision', 'consequences'] },
    zh: { title: '架构决策记录', question: '决定了什么、比较了哪些选项、带来哪些影响？', include: ['背景', '选项', '决策', '影响'] },
  }),
]);

function language(lang) {
  return lang === 'zh' ? 'zh' : 'en';
}

function normalized(value) {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/[\s_]+/g, ' ').trim();
}

export function localizeViewpoint(entry, lang = 'en') {
  const copy = entry[language(lang)];
  return {
    id: entry.id,
    matrix: !entry.extra,
    level: entry.level,
    concern: entry.concern,
    type: entry.type,
    ...(entry.c4 ? { c4_level: entry.c4 } : {}),
    documents: entry.documents.slice(),
    roles: entry.roles.slice(),
    title: copy.title,
    question: copy.question,
    include: copy.include.slice(),
  };
}

export function localizeDocument(id, lang = 'en') {
  const document = DOCUMENTS[id];
  return { id, roles: document.roles.slice(), ...document[language(lang)] };
}

function matchesFilter(entry, { role, document } = {}) {
  return (!role || entry.roles.includes(role)) && (!document || entry.documents.includes(document));
}

export function listViewpoints({ role, document, lang = 'en' } = {}) {
  const viewpoints = VIEWPOINTS.filter((entry) => matchesFilter(entry, { role, document }));
  const documentIds = document ? [document] : Object.keys(DOCUMENTS)
    .filter((id) => !role || viewpoints.some((entry) => entry.documents.includes(id)));
  return {
    ok: true,
    mode: 'viewpoints',
    lang: language(lang),
    ...(role ? { role } : {}),
    ...(document ? { document } : {}),
    documents: documentIds.map((id) => localizeDocument(id, lang)),
    viewpoints: viewpoints.map((entry) => localizeViewpoint(entry, lang)),
  };
}

function scoreViewpoint(entry, query) {
  const text = normalized(query);
  if (!text) return { entry, score: 0, matched: [] };
  if (text === entry.id || text === entry.id.replace(/-/g, ' ')) return { entry, score: 100, matched: [entry.id] };
  let score = 0;
  const matched = [];
  for (const [signal, weight] of entry.signals) {
    if (text.includes(normalized(signal))) {
      score += weight;
      matched.push(signal);
    }
  }
  return { entry, score, matched };
}

// Returns null when nothing in the query names a viewpoint, so callers can
// keep their scenario recommendation unchanged.
export function recommendViewpoint(query, { role, document, lang = 'en' } = {}) {
  const candidates = VIEWPOINTS.filter((entry) => matchesFilter(entry, { role, document }));
  const ranked = candidates.map((entry) => scoreViewpoint(entry, query))
    .sort((left, right) => right.score - left.score || VIEWPOINTS.indexOf(left.entry) - VIEWPOINTS.indexOf(right.entry));
  if (!ranked.length || ranked[0].score === 0) return null;
  const [winner] = ranked;
  return {
    confidence: winner.score >= 14 ? 'high' : winner.score >= 7 ? 'medium' : 'low',
    matchedSignals: winner.matched.slice(),
    viewpoint: localizeViewpoint(winner.entry, lang),
    alternatives: ranked.slice(1).filter((entry) => entry.score > 0).slice(0, 2)
      .map((entry) => localizeViewpoint(entry.entry, lang)),
  };
}

export function formatViewpointList(result) {
  const zh = result.lang === 'zh';
  const roleName = result.role ? ROLES[result.role][result.lang] : null;
  const lines = [zh ? `Archify 工程视角${roleName ? `（${roleName}）` : ''}` : `Archify engineering viewpoints${roleName ? ` (${roleName})` : ''}`, ''];
  for (const document of result.documents) {
    lines.push(`${document.id}  ${document.title}`, `  ${document.purpose}`);
    for (const entry of result.viewpoints.filter((item) => item.documents.includes(document.id))) {
      const cell = entry.level ? `${entry.level}/${entry.concern}` : entry.concern;
      lines.push(`  - ${entry.id}  [${entry.type}${entry.c4_level ? ` · C4 ${entry.c4_level}` : ''}]  ${cell}  ${entry.title}`);
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}

export function formatViewpointRecommendation(result) {
  const zh = result.lang === 'zh';
  if (!result.viewpoint) return zh ? '没有匹配的工程视角。' : 'No engineering viewpoint matched.';
  const entry = result.viewpoint;
  return [
    `${zh ? '推荐视角' : 'Viewpoint'}: ${entry.title} [${entry.type}${entry.c4_level ? ` · C4 ${entry.c4_level}` : ''}]`,
    `${zh ? '要回答的问题' : 'Question answered'}: ${entry.question}`,
    `${zh ? '所属文档' : 'Documents'}: ${entry.documents.join(', ')}`,
    `${zh ? '必须包含' : 'Must include'}: ${entry.include.join('; ')}`,
    `meta.viewpoint: ${JSON.stringify({ ...(entry.level ? { level: entry.level } : {}), concern: entry.concern, ...(entry.c4_level ? { c4_level: entry.c4_level } : {}) })}`,
  ].join('\n');
}
