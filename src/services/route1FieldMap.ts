import { buendiaOutbound, buendiaInbound, oneAyalaOutbound, oneAyalaInbound } from '../constants/route1ReferenceLines.ts';
import type { Point } from './locationQuality.ts';

export const ROUTE1_OUTBOUND_ID = '550e8400-e29b-41d4-a716-446655440000';
export const ROUTE1_INBOUND_ID = '550e8400-e29b-41d4-a716-446655440100';
export type Route1Direction = 'outbound' | 'inbound';
export type Route1VariantId = 'buendia_2022' | 'one_ayala_2026';

export interface Route1Variant {
  id: Route1VariantId;
  label: string;
  source: string;
  returnSource: string;
  outbound: Point[];
  inbound: Point[];
}
export interface Route1FieldPin {
  id: string;
  name: string;
  point: Point;
  kind: 'platform' | 'landmark' | 'curb';
  source: string;
  note: string;
  existingStopId?: string;
  direction?: Route1Direction;
  variantId?: Route1VariantId;
}

const osm = 'https://www.openstreetmap.org';
const points = (vertices: [number, number][]): Point[] =>
  vertices.map(([longitude, latitude]) => ({ latitude, longitude }));

export const route1Variants: Route1Variant[] = [
  {
    id: 'buendia_2022', label: 'Buendia MRT via Rockwell · October 2022',
    source: osm + '/relation/9236380/history/45', returnSource: osm + '/relation/11611024/history/12',
    outbound: points(buendiaOutbound), inbound: points(buendiaInbound),
  },
  {
    id: 'one_ayala_2026', label: 'One Ayala · August 2026',
    source: osm + '/relation/9236380/history/59', returnSource: osm + '/relation/11611024/history/29',
    outbound: points(oneAyalaOutbound), inbound: points(oneAyalaInbound),
  },
];

// Catalog matches are suggestions for the original outbound record only.
export const route1Pins: Route1FieldPin[] = [
  { id: 'buendia', name: 'MRT Buendia / Zodiac · Jupiter junction', kind: 'landmark', variantId: 'buendia_2022',
    point: { latitude: 14.5559253, longitude: 121.035011 }, source: osm + '/node/2225262309',
    existingStopId: '550e8400-e29b-41d4-a716-446655440001', note: 'Zodiac Street meets Jupiter here near MRT Buendia. Both archived lines reach this junction. The 2022 queue location is unknown.' },
  { id: 'jupiter', name: 'Jupiter Street / Makati Avenue', kind: 'landmark',
    point: { latitude: 14.5620699, longitude: 121.0281673 }, source: osm + '/node/6622257246',
    note: 'The pin marks the intersection. Identify the boarding corner before linking a stop.' },
  { id: 'bridge', name: 'Lopez Drive / Estrella–Pantaleon Bridge', kind: 'landmark', variantId: 'buendia_2022',
    point: { latitude: 14.566831, longitude: 121.0376601 }, source: osm + '/way/664779807',
    existingStopId: '550e8400-e29b-41d4-a716-446655440003', note: 'The pin represents the mapped bridge footprint. Both archived lines pass the Makati approach and cross the Pasig farther west on the Makati–Mandaluyong Bridge. The sheet gives no exact Lopez Drive stop.' },
  { id: 'school', name: 'City of Mandaluyong Science High School', kind: 'landmark', variantId: 'buendia_2022',
    point: { latitude: 14.5687816, longitude: 121.0354326 }, source: osm + '/relation/17310343',
    existingStopId: '550e8400-e29b-41d4-a716-446655440004', note: 'The pin represents the school grounds on E. Pantaleon Street in Hulo. The entrance and waiting area need field confirmation.' },
  { id: 'tivoli', name: 'Tivoli Garden Residences', kind: 'landmark', variantId: 'buendia_2022',
    point: { latitude: 14.57174, longitude: 121.03118 }, source: 'https://www.dmcihomes.com/tivoli-garden-residences',
    existingStopId: '550e8400-e29b-41d4-a716-446655440005', note: 'DMCI Homes places the property here on Coronado Street. Both archived lines turn away before the later Tivoli platforms. The 2022 boarding location is unknown.' },
  { id: 'maysilo-circle', name: 'Maysilo Circle / Mandaluyong City Hall', kind: 'landmark', variantId: 'buendia_2022',
    point: { latitude: 14.5781694, longitude: 121.0344662 }, source: osm + '/node/25584004',
    existingStopId: '550e8400-e29b-41d4-a716-446655440006', note: 'This road node on the circle appears in both archived lines. The sheet identifies the City Hall complex. The 2022 loading bay is unknown.' },
  { id: 'tivoli-city-hall', name: 'Tivoli Garden · toward City Hall', kind: 'platform', direction: 'outbound', variantId: 'one_ayala_2026',
    point: { latitude: 14.5718683, longitude: 121.0298189 }, source: osm + '/node/13175872639',
    existingStopId: '550e8400-e29b-41d4-a716-446655440005', note: 'This platform appears on the One Ayala route. Check whether the selected service uses it.' },
  { id: 'maysilo', name: 'Maysilo Circle / City Hall', kind: 'platform', variantId: 'one_ayala_2026',
    point: { latitude: 14.5774986, longitude: 121.0349555 }, source: osm + '/node/9662161875',
    existingStopId: '550e8400-e29b-41d4-a716-446655440006', note: 'Check where the vehicle unloads, turns and takes on passengers.' },
  { id: 'tivoli-return', name: 'Tivoli Garden · toward Makati', kind: 'platform', direction: 'inbound', variantId: 'one_ayala_2026',
    point: { latitude: 14.5717671, longitude: 121.029772 }, source: osm + '/node/13175872638',
    note: 'The return platform is on the opposite side. Check which vehicles serve this curb.' },
  { id: 'one-ayala', name: 'One Ayala terminal', kind: 'platform', variantId: 'one_ayala_2026',
    point: { latitude: 14.5509727, longitude: 121.0281821 }, source: osm + '/node/13260869023',
    note: 'The 2026 map lists pickup toward City Hall and drop-off on the return. Verify the bay and permitted use.' },
];
