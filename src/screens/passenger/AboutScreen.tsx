import React from 'react';
import { Linking, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import ESakayLogo from '../../components/ESakayLogo';
import { passengerStyles as s } from '../../components/PassengerUI';
import { BOARDING_EDUCATION } from '../../services/passengerSafety';

export default function AboutScreen() {
  return <ScrollView style={s.screen} contentContainerStyle={s.content}>
    <View style={s.section}><ESakayLogo width={172} /><Text style={s.title}>About eSAKAY</Text><Text style={s.body}>eSAKAY is Meralco’s electric mobility business. Its electric jeepney service connects MRT Buendia and Mandaluyong City Hall.</Text><Text style={s.body}>This app helps you find a unit, plan your fare, check boarding information, and prepare an emergency message for your trusted contacts.</Text></View>
    <View style={s.section}><Text style={s.sectionTitle}>A safer way to travel</Text><Text style={s.body}>{BOARDING_EDUCATION}</Text><Text style={s.body}>Wait on the sidewalk at a designated loading bay. Let the vehicle stop fully before boarding, and confirm your destination with the driver.</Text></View>
    <View style={s.section}><Text style={s.sectionTitle}>Your journey, in one place</Text><Text style={s.body}>Dashboard: search for a place and see the units serving a nearby route stop.</Text><Text style={s.body}>Fares: compare regular, student, senior citizen, and PWD fares.</Text><Text style={s.body}>Safety: manage your emergency contacts and open Messages with your current location and ride details.</Text><Text style={s.body}>esakaybot: ask questions about using the service.</Text></View>
    <TouchableOpacity accessibilityRole="link" onPress={() => Linking.openURL('https://meralcomain.s3.ap-southeast-1.amazonaws.com/2020-04/mer_sustainabilityreport2019_final.pdf')}><Text style={s.link}>Meralco report · Learn about eSAKAY</Text></TouchableOpacity>
  </ScrollView>;
}
