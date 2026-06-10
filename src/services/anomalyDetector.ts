export const detectCrashAnomaly = (
  x: number, 
  y: number, 
  z: number, 
  threshold: number = 3.5 // G-force threshold
): boolean => {
  // Calculate total acceleration magnitude
  // 1g is baseline gravity
  const magnitude = Math.sqrt(x*x + y*y + z*z);
  
  // If magnitude exceeds the threshold, we classify it as a crash/anomaly
  return magnitude >= threshold;
};
