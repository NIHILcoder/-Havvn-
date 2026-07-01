// Typed shim for imported .geojson map assets (bundled as JSON by webpack).
// Kept minimal on purpose — the swarm map only reads feature geometry and a few
// string properties (ISO_A2, NAME).
declare module '*.geojson' {
  export interface GeoFeature {
    type: 'Feature';
    properties: Record<string, string | number | null>;
    geometry: unknown;
    bbox?: number[];
  }
  const value: {
    type: 'FeatureCollection';
    features: GeoFeature[];
  };
  export default value;
}
