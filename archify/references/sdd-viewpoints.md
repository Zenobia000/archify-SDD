# Engineering viewpoints and document packs

Read this when the user names a role (business analyst, system analyst,
architect, software designer), a design document (BRD, SRS, SAD, SDD, ADR),
C4, or asks for several related diagrams at different levels of detail.

## Scope: draw what was asked

The catalog below is a menu, not a checklist. Each viewpoint is a standalone
diagram, so produce the smallest set that answers the request and let the
reader ask for more.

| The user asks for | Produce |
|---|---|
| one viewpoint ("a C4 container diagram", "the checkout sequence", "an ER diagram") | one ordinary diagram with `meta.viewpoint`; no pack, no neighbours, no other levels |
| several named diagrams | one pack holding exactly those diagrams |
| one document ("the SAD diagrams") | one pack holding that document's diagrams the facts support; not the other documents |
| a role ("what does an architect draw?") | no diagram yet: run `guide --role <role>`, show the menu, ask which |
| "now the components of the API" for an existing pack | add one diagram to that pack; edit nothing else |
| the whole design-document set, explicitly | the full pack |

Rules that keep requests small:

- Draw only the requested viewpoints. Do not add the level above "for context"
  or the level below "for completeness", and never fill the matrix.
- Name a neighbour in `refines`, `drills_into` or `drill_from` only when it is
  in the pack or the user asked for it. A link to a diagram that is not in the
  pack is dropped with a warning, so nothing breaks when it is not drawn.
- Finish with one line offering the natural next level or view, and stop.

## Viewpoint matrix

Each viewpoint is a native diagram type with a fixed purpose. Rows are the
abstraction level, columns the concern.

| Level \ Concern | Data | Behavior | Structure |
|---|---|---|---|
| `business` | Business data flow → `dataflow` | Business process → `workflow` | System context, C4 L1 → `architecture` |
| `system` | DFD level 1 → `dataflow` | Activity diagram → `workflow` | Containers, C4 L2 → `architecture` |
| `implementation` | Schema ER → `erd` | Sequence → `sequence` | Components, C4 L3 → `architecture` |

Outside the matrix:

| Viewpoint | Type | Meta |
|---|---|---|
| State machine of one business object | `lifecycle` | `level: system`, `concern: behavior` |
| Deployment | `architecture` | `c4_level: deployment` |
| Code structure, C4 L4 | `class` | `c4_level: code` |
| Module decomposition | `tree` | `level: implementation`, `concern: structure` |
| Architecture decision record | `explainer` | pack `viewpoint.concern: cross-cutting` |

`node bin/archify.mjs guide --role <role> --json` lists the documents and
viewpoints a role owns; `--document SAD` lists one document. Add a scenario to
get one recommendation.

## Roles and documents

| Document | Owner roles | Typical sections |
|---|---|---|
| BRD | business analyst, system analyst | business process, business data flow |
| SRS | system analyst | activity diagrams, DFD, externally visible states |
| SAD | architect | system context, containers, deployment, cross-cutting concerns |
| SDD | software designer, developer | components, sequences, schema, state machines, modules, code structure |
| ADR | architect | one decision with context, options and consequences |

## Viewpoint and trace metadata

Every native diagram may declare where it sits and how it relates to others:

```json
"meta": {
  "viewpoint": { "level": "system", "concern": "structure", "c4_level": "container", "roles": ["architect"], "status": "current" },
  "trace": {
    "id": "c4-l2-containers",
    "refines": ["c4-l1-context"],
    "drills_into": [{ "node": "booking-api", "target": "c4-l3-booking-api.html", "focus": "booking-service", "label": "Booking API components" }],
    "elements": { "booking-api": "C-20", "booking-db": "C-30" }
  }
}
```

- `trace.id` is the diagram's stable ID and must equal its pack artifact ID.
- `refines` points to more abstract diagrams only: a DFD refines the business
  data flow, a sequence refines an activity, L3 refines L2. A diagram has one
  parent.
- `drill_from` is the way to link a detailed diagram: the detailed diagram
  names the node of the abstract one that opens it, for example
  `[{ "diagram": "c4-l2-containers", "node": "booking-api", "focus": "booking-service" }]`.
  The pack adds the link to the abstract diagram and treats it as the parent,
  so adding L3 later needs no edit to L2.
- `drills_into` is the same link written on the abstract diagram. Use it only
  when the target already exists. `target` is the sibling artifact's output
  file; `focus` opens it on a node.
- `elements` maps node IDs to stable element IDs (`C-20`, `OP-10`) so one
  element can be followed across diagrams. The pack may register an ID to give
  it an owner and status; an unregistered ID is still traced under its node
  label.
- `status` separates what exists (`current`) from what is partly built
  (`partial`) or planned (`target`). Never mark planned work as current.

Document membership and section numbers belong in the pack, not in diagrams.

## C4 with native architecture fields

| C4 element | Archify authoring |
|---|---|
| Person | `type: external`, `icon: person` |
| Software system in scope | `type: backend` at L1; becomes a `region` boundary at L2 |
| External software system | `type: external` |
| Container (app, API, worker) | `frontend`, `backend`, or `messagebus`; technology in `sublabel` |
| Container (database, store) | `database` |
| System or container boundary | `boundaries[].kind: region`, label `Name [Software System]` or `Name [Container]` |
| Deployment node or network | nested `region` boundaries; trust zones as `security-group` |

Label every relationship with intent and protocol (`Books visit · HTTPS/JSON`).
Use `variant: emphasis` for the main runtime path, `dashed` for asynchronous or
feedback flows, and `security` for cross-cutting control such as identity.
Name the legend entries for C4 roles through `meta.legend.entries`, for example
`external` as `Person / external system`.

Keep each level honest: L1 shows one box for the system, L2 shows no classes,
L3 stays inside one container. Draw the next level as a new diagram and link
it with `drill_from` instead of nesting detail.

### How the levels relate

| Level | Diagrams per system | Relation to the level above |
|---|---|---|
| L1 context | 1 | none |
| L2 container | 1 | 1 : 1 with L1 |
| L3 component | one per container that has structure worth showing | many : 1, each opened from its own container node |
| L4 code | a few, for core components only | many : 1, each opened from its own component node |

Most containers never get an L3: a database opens a schema diagram, a small
worker needs nothing. Absence is normal; draw an L3 only when asked.
Deployment is another **view** of the L2 containers, not a level below them:
give it `c4_level: deployment`, `refines` the container diagram, and the pack
lists it as an alternate view rather than as a child.

`pack validate` warns when the levels a pack does hold do not nest:
`pack/c4-level-skip` (an L3 refining L1), `pack/c4-multiple-parents`,
`pack/c4-not-navigable` (no node opens the child; add `drill_from`) and
`pack/c4-ambiguous-drill` (one node opens two diagrams of the same level).

## Document packs

A pack groups the diagrams the user asked for into documents. Use one when
two or more diagrams belong together (see Scope); a single diagram never needs
one.

### Pack folder

```text
.archify/pack-<slug>-<YYYYMMDD-HHMMSS>/
├── <slug>.pack.json        documents, sections, artifacts, shared elements
├── sources/                one authored source per diagram (.json, or .archify.md for an ADR)
└── artifacts/              generated by `pack render`; never edit by hand
    ├── index.html          the single entry point
    ├── pack.manifest.json
    └── <artifact-id>.html  one per diagram
```

Use one folder per pack and reuse it for repairs. `pack render` defaults to
`artifacts/` beside the pack file, so `--out` is only needed to publish
elsewhere. The page language follows `locale` in the pack file (`en`,
`zh-TW`, `zh-CN`); use the same locale in every diagram's `meta.locale`.

### Pack file

```json
{
  "schema_version": 1, "pack_type": "document-pack", "id": "careslot", "title": "CareSlot design documents", "locale": "en",
  "documents": [{ "id": "SAD", "kind": "SAD", "title": "Software Architecture Document",
    "sections": [{ "id": "SAD-2", "title": "System context", "artifacts": ["c4-l1-context"] }] }],
  "artifacts": [{ "id": "c4-l1-context", "type": "architecture", "source": "sources/c4-l1-context.architecture.json" }],
  "elements": [{ "id": "C-20", "label": "Booking API", "status": "current" }]
}
```

### Authoring order

1. Decide the documents and the diagrams each needs from the viewpoint table;
   write the shared facts (actors, systems, rules, node and element IDs) down
   once and reuse them in every diagram.
2. Author each source with `meta.viewpoint`, `meta.trace` and
   `visual_preset: "reference"`. A diagram's `trace.id` equals its artifact `id`.
3. Validate and render the whole pack:

```bash
node bin/archify.mjs pack validate <slug>.pack.json --json
node bin/archify.mjs pack render <slug>.pack.json --quality showcase --browser-check --json
```

`render` checks every diagram with the same gates as `render` and `check`,
and `--browser-check` adds the real-browser gate for native diagrams
(explainers skip it). Repair diagnostics in the sources, not in the output.

Errors stop the render and mean something cannot be right at any size:
`pack/missing-artifact` (a section names a diagram the pack does not declare),
`pack/duplicate-artifact`, `pack/refines-cycle`, `pack/unknown-node`,
`pack/trace-id-mismatch`, `pack/render-failed`, `pack/check-failed`,
`pack/browser-check-failed`. Fix a failing diagram with
`archify finalize <type> <source>` into a scratch path for its detailed
receipt.

Warnings never block, because a pack holds only what was asked:
`pack/dangling-reference` (a link names a diagram that is not in the pack and
is left out), `pack/undeclared-element`, `pack/orphan-element` and the C4
warnings above. Act on a C4 warning; leave a dangling reference alone unless
that diagram was requested.

### What the reader gets

`artifacts/index.html` is a self-contained architecture center that works from
`file://`: a document navigator, facet filters (role, document, level,
concern, type), the viewpoint matrix, the refinement hierarchy, a
traceability table, and a per-diagram view that embeds the diagram beside its
documents, refines / refined-by links, drill-down links and traced elements.
Report that one link, not each diagram.
