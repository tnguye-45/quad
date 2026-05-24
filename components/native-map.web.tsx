// Web bundle never imports react-native-maps — the Map tab renders a
// leaflet iframe on web instead (see app/(tabs)/map.tsx).
export type MapPin = {
  id: string;
  lat: number;
  lon: number;
  title: string;
  meta: string;
  kind: 'gig' | 'hangout';
};

export function NativeMap(_props: { pins: MapPin[] }) {
  return null;
}
