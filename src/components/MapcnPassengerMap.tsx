import type React from 'react';
import type { Point } from '../services/locationQuality';
import type { WalkingRouteGeometry } from '../services/routeMap';
import type { LeafletMapRef } from './LeafletMap';

export type MapcnPassengerMapProps = {
  onPickCurb?: (point: Point) => void;
  controls: React.Ref<LeafletMapRef>;
  onFailure: () => void;
  onSelect: (data: { type: 'SELECT_TERMINAL' | 'SELECT_VEHICLE'; id: string }) => void;
  data: {
    routes: { coordinates: Point[]; isSelected: boolean; color_code: string; referenceDirection?: 'outbound' | 'inbound' }[];
    terminals: (Point & { id: string; name: string; role: string; isSelected: boolean })[];
    vehicles: (Point & { id: string; body_number: string; quality: string; isSelected: boolean })[];
    userLocation: Point | null;
    destinationPlace: (Point & { name: string }) | null;
    rideCoordinates: Point[];
    walkingRoutes: WalkingRouteGeometry[];
    fitPoints: Point[];
    cameraKey: string;
    selectedVehicleId: string | null;
    vehicleSelectionKey?: string | null;
    vehicleFocusRequestId?: string | number;
  };
};

// Metro selects the .web implementation for browsers.
export default function MapcnPassengerMap(_props: MapcnPassengerMapProps) {
  return null;
}
