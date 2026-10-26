export const ESAKAY_OPERATIONS = {
  reportedFleetSize: 15,
  fullRoutesPerUnitTarget: 12,
  serviceHours: '4:00 AM–12:00 AM',
  operatorSpeedCapKph: 20,
  regularBaseFare: 15,
  discountedBaseFare: 12,
  includedDistanceKm: 4,
  additionalFarePerKm: 1,
} as const;

export const ROUTE_WAYPOINT_REVIEW = [
  {
    name: 'MRT Buendia / Zodiac',
    finding: 'Two mapped Buendia MRT boarding sides; the eSAKAY/Zodiac bay is not identified.',
    source: 'https://www.openstreetmap.org/node/13175872619',
    confidence: 'Boarding point unresolved',
  },
  {
    name: 'Jupiter Street at Makati Avenue',
    finding: 'Street names are mapped, but the exact loading point and travel direction need a road junction match.',
    source: null,
    confidence: 'Loading point unresolved',
  },
  {
    name: 'Lopez Drive / Estrella–Pantaleon Bridge',
    finding: 'Bridge is mapped; the intended bridge entrance and legal approach from Lopez Drive need confirmation.',
    source: 'https://www.openstreetmap.org/way/664779807',
    confidence: 'Entrance unresolved',
  },
  {
    name: 'City of Mandaluyong Science High School',
    finding: 'School is mapped on E. Pantaleon Street; a designated eSAKAY bay is not mapped.',
    source: 'https://www.openstreetmap.org/relation/17310343',
    confidence: 'Landmark matched',
  },
  {
    name: 'Tivoli Garden',
    finding: 'A named bus stop is mapped on Coronado Street beside Tivoli Garden.',
    source: 'https://www.openstreetmap.org/node/13175872638',
    confidence: 'Mapped bus stop',
  },
  {
    name: 'Maysilo Circle / Mandaluyong City Hall',
    finding: 'City Hall is mapped at Maysilo Circle; the operator boarding bay is not identified.',
    source: 'https://www.openstreetmap.org/way/112549085',
    confidence: 'Landmark matched',
  },
] as const;
