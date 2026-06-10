import { useState, useEffect } from 'react';
import { calculateETA } from '../utils/geo';

export const useETACalculator = (distanceKm: number, currentSpeedKmh: number) => {
  const [eta, setEta] = useState<number>(0);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [expectedSpeed, setExpectedSpeed] = useState(15); // Default expected 15km/h

  useEffect(() => {
    setIsRecalculating(true);
    
    // If speed drops >30% below expected, update the ETA calculation basis
    const effectiveSpeed = currentSpeedKmh < (expectedSpeed * 0.7) 
      ? Math.max(currentSpeedKmh, 5) // Don't estimate with less than 5km/h
      : expectedSpeed;
      
    const calculatedEta = calculateETA(distanceKm, effectiveSpeed);
    
    // Simulate slight calculation delay
    const timer = setTimeout(() => {
      setEta(calculatedEta);
      setIsRecalculating(false);
    }, 500);
    
    return () => clearTimeout(timer);
  }, [distanceKm, currentSpeedKmh, expectedSpeed]);

  return { eta, isRecalculating };
};
