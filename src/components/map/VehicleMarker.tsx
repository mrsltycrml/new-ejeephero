import React from 'react';
import { View, StyleSheet } from 'react-native';
import Mapbox from '@rnmapbox/maps';
import { colors } from '../../theme/colors';

interface VehicleMarkerProps {
  vehicle: {
    id: string;
    latitude: number;
    longitude: number;
    heading: number;
  };
}

const VehicleMarker: React.FC<VehicleMarkerProps> = ({ vehicle }) => {
  return (
    <Mapbox.PointAnnotation
      key={`vehicle-${vehicle.id}`}
      id={`vehicle-${vehicle.id}`}
      coordinate={[vehicle.longitude, vehicle.latitude]}
    >
      <View style={[styles.markerContainer, { transform: [{ rotate: `${vehicle.heading}deg` }] }]}>
        <View style={styles.jeepneyIcon}>
          <View style={styles.windshield} />
        </View>
      </View>
    </Mapbox.PointAnnotation>
  );
};

const styles = StyleSheet.create({
  markerContainer: {
    width: 24,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  jeepneyIcon: {
    width: 20,
    height: 36,
    backgroundColor: colors.active,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: 'white',
    alignItems: 'center',
    paddingTop: 4,
  },
  windshield: {
    width: 12,
    height: 6,
    backgroundColor: 'white',
    borderRadius: 2,
  }
});

export default VehicleMarker;
