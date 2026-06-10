import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Marker } from 'react-native-maps';
import { colors } from '../../theme/colors';

interface VehicleMarkerProps {
  id: string;
  latitude: number;
  longitude: number;
  heading: number;
}

export const VehicleMarker: React.FC<VehicleMarkerProps> = ({ id, latitude, longitude, heading }) => {
  return (
    <Marker
      key={`vehicle-${id}`}
      coordinate={{ latitude, longitude }}
      rotation={heading}
      anchor={{ x: 0.5, y: 0.5 }}
    >
      <View style={styles.markerContainer}>
        <View style={styles.jeepneyIcon}>
          {/* Simple representation of a jeepney pointing forward */}
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
    backgroundColor: colors.routes.circuit, // Default color, can be passed as prop
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
