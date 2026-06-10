import { useState, useEffect } from 'react';
import { getDistance } from '../utils/geo';

export const useETACalculator = (
  userLat: number | null,
  userLon: number | null,
  vehicleLat: number | undefined,
  vehicleLon: number | undefined,
  currentSpeed: number | undefined
) => {
  const [eta, setEta] = useState<number | null>(null); // in minutes
  const [isDelayed, setIsDelayed] = useState(false);

  useEffect(() => {
    if (userLat && userLon && vehicleLat && vehicleLon) {
      const distance = getDistance(userLat, userLon, vehicleLat, vehicleLon);
      
      // Assume average e-jeep speed in Makati is 20 km/h (approx 0.33 km/min)
      const avgSpeed = 20;
      const speedToUse = (currentSpeed && currentSpeed > 5) ? currentSpeed : avgSpeed;

      const calculatedEta = (distance / speedToUse) * 60;
      setEta(calculatedEta);

      // Recalculate when speed drops >30% below expected (avgSpeed)
      if (currentSpeed && currentSpeed < avgSpeed * 0.7) {
        setIsDelayed(true);
      } else {
        setIsDelayed(false);
      }
    }
  }, [userLat, userLon, vehicleLat, vehicleLon, currentSpeed]);

  return { eta, isDelayed };
};
