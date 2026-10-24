// Shape of docs/packs/<id>/artifacts/pack.manifest.json (archify pack render).
export interface PackViewpoint { level?: string; concern?: string; c4_level?: string; roles?: string[]; status?: string }
export interface PackLink { node: string; target: string; focus?: string; label?: string }
export interface PackArtifact {
  id: string; type: string; title: string; subtitle?: string; source: string; output: string;
  viewpoint: PackViewpoint | null;
  documents: { document: string; section: string; title: string }[];
  refines: string[]; refinedBy: string[]; viewOf?: string[]; views?: string[]; drillsInto: PackLink[]; drilledFrom: string[];
  elements: Record<string, string>;
  sha256?: string; bytes?: number; check?: boolean;
}
export interface PackElement { id: string; label: string; owner?: string; status?: string; declared?: boolean; appearsIn: { artifact: string; node: string }[] }
export interface PackDocument { id: string; kind?: string; title: string; summary?: string; sections: { id: string; title: string; artifacts: string[] }[] }
export interface Pack { id: string; title: string; subtitle?: string; locale?: string; documents: PackDocument[]; artifacts: PackArtifact[]; elements: PackElement[] }
