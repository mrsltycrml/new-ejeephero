import './fareCalculator.test.ts';
import './reportingPeriod.test.ts';
import './simplePdf.test.ts';
import './passengerSafety.test.ts';
import './passengerJourney.test.ts';
import './passengerPlaces.test.ts';
import './scriptJson.test.ts';
import './worker.test.ts';
import './operations.test.ts';
await import('./realData.test.ts');
import './adminUnitRows.test.ts';
import './locationQuality.test.ts';
import './routeMap.test.ts';
// Module-hook fixtures must finish importing before the next hook is installed.
await import('./mapHtmlSerialization.test.ts');
await import('./anomalyLocation.test.ts');
await import('./driverShiftStart.test.ts');
await import('./supervisorMapSelection.test.ts');
