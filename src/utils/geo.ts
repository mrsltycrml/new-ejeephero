export const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
};

export const findNearestTerminals = (userLat: number, userLon: number, terminals: any[], limit: number = 3) => {
  return terminals
    .map(terminal => ({
      ...terminal,
      distanceKm: haversineDistance(userLat, userLon, terminal.latitude, terminal.longitude)
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);
};

export const calculateETA = (distanceKm: number, speedKmh: number = 15): number => {
  // Average e-jeepney speed in Makati traffic is ~15 km/h
  // Returns ETA in minutes
  if (speedKmh <= 0) return distanceKm / 15 * 60;
  return (distanceKm / speedKmh) * 60;
};

export const isWithinRadius = (lat1: number, lon1: number, lat2: number, lon2: number, radiusMeters: number): boolean => {
  const distanceKm = haversineDistance(lat1, lon1, lat2, lon2);
  return (distanceKm * 1000) <= radiusMeters;
};
