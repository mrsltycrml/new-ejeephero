import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Marker } from 'react-native-maps';
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
    <Marker
      key={`vehicle-${vehicle.id}`}
      coordinate={{ latitude: vehicle.latitude, longitude: vehicle.longitude }}
      rotation={vehicle.heading}
      anchor={{ x: 0.5, y: 0.5 }}
      flat={true}
    >
      <View style={styles.markerContainer}>
        <View style={styles.jeepneyIcon}>
          <View style={styles.windshield} />
        </View>
      </View>
    </Marker>
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
