export const BASE_FARE = 15.00;
export const BASE_DISTANCE_KM = 4.0;
export const FARE_PER_KM = 2.20;
export const DISCOUNT_RATE = 0.20; // 20% discount

export const calculateFare = (distanceKm: number, isDiscounted: boolean = false): number => {
  let fare = BASE_FARE;
  
  if (distanceKm > BASE_DISTANCE_KM) {
    const excessDistance = Math.ceil(distanceKm - BASE_DISTANCE_KM);
    fare += excessDistance * FARE_PER_KM;
  }
  
  if (isDiscounted) {
    fare = fare * (1 - DISCOUNT_RATE);
  }
  
  return Math.max(fare, BASE_FARE); // Minimum fare is always BASE_FARE, even with discount it shouldn't drop below discounted base, but for simplicity we return exact.
};

// If discounted base fare is allowed to be lower than BASE_FARE:
export const calculateDiscountedFare = (distanceKm: number): number => {
  return calculateFare(distanceKm, true);
};
