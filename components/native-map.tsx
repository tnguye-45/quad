import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export type MapPin = {
  id: string;
  lat: number;
  lon: number;
  title: string;
  meta: string;
  kind: 'gig' | 'hangout';
};

const CAMPUS_CENTER = { lat: 41.702, lon: -86.2375 };

export function NativeMap({ pins }: { pins: MapPin[] }) {
  const c = Colors[useColorScheme() ?? 'light'];
  return (
    <MapView
      style={StyleSheet.absoluteFill}
      provider={PROVIDER_DEFAULT}
      initialRegion={{
        latitude: CAMPUS_CENTER.lat,
        longitude: CAMPUS_CENTER.lon,
        latitudeDelta: 0.012,
        longitudeDelta: 0.012,
      }}
      showsCompass={false}
      showsScale={false}>
      {pins.map((p) => (
        <Marker
          key={p.id}
          coordinate={{ latitude: p.lat, longitude: p.lon }}
          title={p.title}
          description={p.meta}
          anchor={{ x: 0.5, y: 0.5 }}>
          <View
            style={[
              styles.pin,
              { backgroundColor: c.background, borderColor: c.border },
            ]}>
            <View
              style={[
                styles.dot,
                { backgroundColor: p.kind === 'gig' ? c.tint : c.accent },
              ]}
            />
            <ThemedText
              style={[styles.pinText, { color: c.text }]}
              numberOfLines={1}>
              {p.title}
            </ThemedText>
          </View>
        </Marker>
      ))}
    </MapView>
  );
}

const styles = StyleSheet.create({
  pin: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 180,
    boxShadow: '0px 1px 4px rgba(12, 35, 64, 0.12)',
    elevation: 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  pinText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: -0.1,
    flexShrink: 1,
  },
});
