// Reference document packs published on the site. Each manifest is generated
// by `npm --prefix archify run build:packs`; add one import per new pack.
import careslot from '../../../docs/packs/careslot/artifacts/pack.manifest.json' with { type: 'json' };
import leaveApproval from '../../../docs/packs/leave-approval/artifacts/pack.manifest.json' with { type: 'json' };

/** @type {import('./pack-types').Pack[]} */
export const PACKS = [careslot, leaveApproval];

export const packPages = PACKS.flatMap((pack) => [
  `packs/${pack.id}`,
  ...pack.artifacts.map((artifact) => `packs/${pack.id}/${artifact.id}`),
]);
