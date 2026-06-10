/**
 * LTFRB Modernized Jeepney Fare Rules:
 * Base fare: ₱13.00 for the first 4 kilometers.
 * Additional fare: ₱1.80 per kilometer after the first 4km.
 */

export const calculateFare = (distanceKm: number): number => {
  const baseFare = 13.0;
  const baseDistance = 4.0;
  const ratePerKm = 1.8;

  if (distanceKm <= baseDistance) {
    return baseFare;
  }

  const excessDistance = distanceKm - baseDistance;
  const additionalFare = excessDistance * ratePerKm;
  
  return baseFare + additionalFare;
};

export const formatFare = (amount: number): string => {
  return `₱${amount.toFixed(2)}`;
};
