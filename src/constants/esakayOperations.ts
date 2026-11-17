export const ESAKAY_OPERATIONS = { operatorSpeedCapKph: 20 } as const;

// Transcribed from the user's dated sheet; these are not surveyed stop points.
export const LANDMARK_REFERENCE = {
  date: '3 October 2022',
  stops: [
    { printedKm: 0, name: 'MRT Buendia / Zodiac' },
    { printedKm: 1, name: 'Jupiter St., corner Makati Avenue' },
    { printedKm: 2, name: 'Lopez Drive / Estrella Pantaleon Bridge' },
    { printedKm: 3, name: 'City of Mandaluyong Science High School' },
    { printedKm: 4, name: 'Tivoli Garden' },
    { printedKm: 5, name: 'Maysilo Circle / Mandaluyong City Hall' },
  ],
} as const;
