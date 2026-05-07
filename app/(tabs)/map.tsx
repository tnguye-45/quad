import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type Pin = {
  emoji: string;
  lat: number;
  lon: number;
  title: string;
  meta: string;
  kind: 'gig' | 'hangout';
};

const PINS: Pin[] = [
  { emoji: '🛋️', lat: 41.6995, lon: -86.2382, title: 'Help moving a couch', meta: '$40 · Dillon Hall', kind: 'gig' },
  { emoji: '📚', lat: 41.7022, lon: -86.2358, title: 'MATH 10560 tutor', meta: '$30/hr · Hesburgh Library', kind: 'gig' },
  { emoji: '🐶', lat: 41.7008, lon: -86.2386, title: 'Walk my dog this weekend', meta: '$15 · Sorin College', kind: 'gig' },
  { emoji: '📸', lat: 41.7029, lon: -86.2389, title: 'Senior portraits at the Dome', meta: '$80 · Main Building', kind: 'gig' },
  { emoji: '📦', lat: 41.7012, lon: -86.2377, title: 'Pick up Amazon package', meta: '$8 · LaFortune', kind: 'gig' },
  { emoji: '🎓', lat: 41.7024, lon: -86.2362, title: 'CSE 20110 cram session', meta: '4 going · Tonight 8pm', kind: 'hangout' },
  { emoji: '🏀', lat: 41.7050, lon: -86.2355, title: 'Pickup basketball', meta: '8 going · Sat 3pm · Rolfs', kind: 'hangout' },
  { emoji: '🍽️', lat: 41.6985, lon: -86.2371, title: 'South Dining dinner', meta: '3 going · Tonight 6:30pm', kind: 'hangout' },
  { emoji: '☕', lat: 41.6975, lon: -86.2310, title: 'Coffee @ Hagerty', meta: '2 going · Tomorrow 4pm', kind: 'hangout' },
  { emoji: '🏃', lat: 41.7055, lon: -86.2425, title: 'Sunset run around the lakes', meta: "5 going · Sun 6:15pm", kind: 'hangout' },
];

const MAP_HTML = `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="initial-scale=1.0,width=device-width">
<link rel="stylesheet" href="/leaflet/leaflet.css"/>
<script src="/leaflet/leaflet.js"></script>
<style>
  html,body,#map{height:100%;margin:0;padding:0;background:#fafafa;font-family:system-ui,-apple-system,sans-serif}
  .emoji-pin{font-size:30px;text-align:center;line-height:1;filter:drop-shadow(0 3px 5px rgba(0,0,0,.3));cursor:pointer;transition:transform .15s ease}
  .emoji-pin:hover{transform:scale(1.18)}
  .leaflet-popup-content-wrapper{border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.18);padding:2px}
  .leaflet-popup-content{margin:10px 14px;font-size:13px;color:#111827;line-height:1.4}
  .leaflet-popup-content b{display:block;margin-bottom:3px;font-size:14px;font-weight:600}
  .leaflet-popup-content .meta{color:#6b7280;font-size:12px}
  .leaflet-popup-tip{box-shadow:none}
  .leaflet-control-attribution{font-size:10px;background:rgba(255,255,255,.7)}
</style>
</head>
<body>
<div id="map"></div>
<script>
  const PINS = ${JSON.stringify(PINS)};
  const map = L.map('map', { zoomControl: true, attributionControl: true }).setView([41.7020, -86.2375], 16);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
  }).addTo(map);
  PINS.forEach(function(p){
    L.marker([p.lat, p.lon], {
      icon: L.divIcon({
        className: 'emoji-pin',
        html: p.emoji,
        iconSize: [38, 38],
        iconAnchor: [19, 32],
        popupAnchor: [0, -28]
      })
    }).addTo(map).bindPopup('<b>' + p.title + '</b><span class="meta">' + p.meta + '</span>');
  });
</script>
</body>
</html>`;

export default function MapScreen() {
  const c = Colors[useColorScheme() ?? 'light'];
  const gigCount = PINS.filter((p) => p.kind === 'gig').length;
  const hangoutCount = PINS.filter((p) => p.kind === 'hangout').length;

  return (
    <ThemedView style={[styles.screen, { backgroundColor: c.background }]}>
      {Platform.OS === 'web' ? (
        // @ts-expect-error iframe is a web-only DOM element rendered by react-native-web
        <iframe
          srcDoc={MAP_HTML}
          title="Notre Dame activities map"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            border: 0,
          }}
        />
      ) : (
        <View style={[styles.placeholder, { backgroundColor: c.subtle }]}>
          <ThemedText type="title">Map</ThemedText>
          <ThemedText style={[styles.placeholderSubtle, { color: c.textSecondary }]}>
            Interactive map is web-only for now.{'\n'}Native map coming soon.
          </ThemedText>
        </View>
      )}

      <View style={styles.topOverlay} pointerEvents="box-none">
        <View
          style={[
            styles.brandPill,
            { backgroundColor: c.card, borderColor: c.border },
          ]}>
          <ThemedText type="defaultSemiBold" style={styles.brand}>
            quad
          </ThemedText>
          <View style={[styles.dot, { backgroundColor: c.border }]} />
          <ThemedText style={[styles.brandSubtle, { color: c.textSecondary }]}>
            Notre Dame
          </ThemedText>
        </View>
      </View>

      <View style={styles.bottomOverlay} pointerEvents="box-none">
        <View
          style={[
            styles.legend,
            { backgroundColor: c.card, borderColor: c.border },
          ]}>
          <View style={styles.legendRow}>
            <ThemedText style={styles.legendNumber}>{gigCount}</ThemedText>
            <ThemedText style={[styles.legendLabel, { color: c.textSecondary }]}>
              open gigs
            </ThemedText>
          </View>
          <View style={[styles.legendDivider, { backgroundColor: c.border }]} />
          <View style={styles.legendRow}>
            <ThemedText style={styles.legendNumber}>{hangoutCount}</ThemedText>
            <ThemedText style={[styles.legendLabel, { color: c.textSecondary }]}>
              hangouts
            </ThemedText>
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.fab,
            { backgroundColor: c.tint, opacity: pressed ? 0.85 : 1 },
          ]}
          onPress={() => {}}>
          <IconSymbol name="plus" size={18} color={c.background} />
          <ThemedText style={[styles.fabText, { color: c.background }]}>Post</ThemedText>
        </Pressable>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 32,
  },
  placeholderSubtle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 56,
    alignItems: 'center',
  },
  brandPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  brand: {
    fontSize: 16,
    letterSpacing: -0.3,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  brandSubtle: {
    fontSize: 13,
  },
  bottomOverlay: {
    position: 'absolute',
    bottom: 24,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 5,
  },
  legendNumber: {
    fontSize: 16,
    fontWeight: '700',
  },
  legendLabel: {
    fontSize: 12,
  },
  legendDivider: {
    width: 1,
    height: 18,
  },
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  fabText: {
    fontWeight: '600',
    fontSize: 14,
  },
});
