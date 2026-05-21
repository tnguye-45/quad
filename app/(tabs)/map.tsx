import { router } from 'expo-router';
import { useMemo } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { NamePlaque } from '@/components/logo';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePosts, type Gig, type Hangout } from '@/lib/posts-store';

type Pin = {
  lat: number;
  lon: number;
  title: string;
  meta: string;
  kind: 'gig' | 'hangout';
};

// Notre Dame campus center — used for map view + fallback jitter for unknown locations.
const CAMPUS_CENTER = { lat: 41.702, lon: -86.2375 };

// Lightweight gazetteer of campus landmarks. Keys are lowercased substrings of
// the post's `where` field; we match the first hit. New landmarks can be added
// here without touching the rendering code.
const LANDMARKS: { match: string; lat: number; lon: number }[] = [
  { match: 'dillon', lat: 41.6995, lon: -86.2382 },
  { match: 'sorin', lat: 41.7008, lon: -86.2386 },
  { match: 'hesburgh', lat: 41.7022, lon: -86.2358 },
  { match: 'main building', lat: 41.7029, lon: -86.2389 },
  { match: 'dome', lat: 41.7029, lon: -86.2389 },
  { match: 'lafortune', lat: 41.7012, lon: -86.2377 },
  { match: 'debartolo', lat: 41.7005, lon: -86.2353 },
  { match: 'rolfs', lat: 41.705, lon: -86.2355 },
  { match: 'south dining', lat: 41.6985, lon: -86.2371 },
  { match: 'sdh', lat: 41.6985, lon: -86.2371 },
  { match: 'north dining', lat: 41.7055, lon: -86.236 },
  { match: 'ndh', lat: 41.7055, lon: -86.236 },
  { match: 'hagerty', lat: 41.6975, lon: -86.231 },
  { match: 'dpac', lat: 41.6975, lon: -86.231 },
  { match: 'basilica', lat: 41.7034, lon: -86.2388 },
  { match: 'grotto', lat: 41.7026, lon: -86.2402 },
  { match: 'st. joseph', lat: 41.7055, lon: -86.2425 },
  { match: "st joseph", lat: 41.7055, lon: -86.2425 },
  { match: 'lake', lat: 41.7055, lon: -86.2425 },
  { match: 'sbn', lat: 41.7081, lon: -86.3173 },
  { match: 'airport', lat: 41.7081, lon: -86.3173 },
];

function geocode(where: string, seedKey: string): { lat: number; lon: number } {
  const haystack = where.toLowerCase();
  for (const lm of LANDMARKS) {
    if (haystack.includes(lm.match)) return { lat: lm.lat, lon: lm.lon };
  }
  // Deterministic jitter around campus center based on the post id so the pin
  // doesn't jump around between renders.
  let hash = 0;
  for (let i = 0; i < seedKey.length; i++) {
    hash = (hash * 31 + seedKey.charCodeAt(i)) | 0;
  }
  const dx = ((hash & 0xff) / 255 - 0.5) * 0.004;
  const dy = (((hash >> 8) & 0xff) / 255 - 0.5) * 0.004;
  return { lat: CAMPUS_CENTER.lat + dy, lon: CAMPUS_CENTER.lon + dx };
}

function gigToPin(gig: Gig): Pin {
  const { lat, lon } = geocode(gig.where, gig.id);
  return {
    lat,
    lon,
    title: gig.title,
    meta: `${gig.payout} · ${gig.where}`,
    kind: 'gig',
  };
}

function hangoutToPin(h: Hangout): Pin {
  const { lat, lon } = geocode(h.where, h.id);
  return {
    lat,
    lon,
    title: h.title,
    meta: `${h.going} going · ${h.when} · ${h.where}`,
    kind: 'hangout',
  };
}

function buildMapHtml(pins: Pin[]): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="initial-scale=1.0,width=device-width">
<link rel="stylesheet" href="/leaflet/leaflet.css"/>
<script src="/leaflet/leaflet.js"></script>
<style>
  html,body,#map{height:100%;margin:0;padding:0;background:#fafafa;font-family:SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace}
  .pin-chip{
    display:inline-flex;align-items:center;gap:6px;
    padding:4px 8px;background:#ffffff;border:1px solid #e5e7eb;
    border-radius:3px;font-size:11px;font-weight:500;color:#111827;
    line-height:1;white-space:nowrap;cursor:pointer;
    transition:transform .15s ease, box-shadow .15s ease;
  }
  .pin-chip:hover{transform:translateY(-1px);box-shadow:0 4px 12px rgba(0,0,0,.12)}
  .pin-chip .dot{
    width:6px;height:6px;border-radius:3px;flex-shrink:0;
  }
  .pin-chip .dot.gig{background:#111827}
  .pin-chip .dot.hangout{background:transparent;border:1px solid #111827}
  .leaflet-marker-icon.pin-wrap{background:transparent;border:none}
  .leaflet-popup-content-wrapper{border-radius:4px;box-shadow:0 4px 14px rgba(0,0,0,.12);padding:2px}
  .leaflet-popup-content{margin:10px 14px;font-size:12px;color:#111827;line-height:1.45}
  .leaflet-popup-content b{display:block;margin-bottom:3px;font-size:13px;font-weight:600}
  .leaflet-popup-content .meta{color:#6b7280;font-size:11px}
  .leaflet-popup-tip{box-shadow:none}
  .leaflet-control-attribution{font-size:10px;background:rgba(255,255,255,.7)}
</style>
</head>
<body>
<div id="map"></div>
<script>
  const PINS = ${JSON.stringify(pins)};
  const map = L.map('map', { zoomControl: true, attributionControl: true }).setView([${CAMPUS_CENTER.lat}, ${CAMPUS_CENTER.lon}], 16);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
  }).addTo(map);
  function escapeHtml(s){return String(s).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]})}
  PINS.forEach(function(p){
    var chipHtml = '<span class="pin-chip"><span class="dot ' + p.kind + '"></span>' + escapeHtml(p.title) + '</span>';
    L.marker([p.lat, p.lon], {
      icon: L.divIcon({
        className: 'pin-wrap',
        html: chipHtml,
        iconSize: null,
        iconAnchor: [0, 0],
        popupAnchor: [60, -4]
      })
    }).addTo(map).bindPopup('<b>' + escapeHtml(p.title) + '</b><span class="meta">' + escapeHtml(p.meta) + '</span>');
  });
</script>
</body>
</html>`;
}

export default function MapScreen() {
  const c = Colors[useColorScheme() ?? 'light'];
  const { gigs, hangouts } = usePosts();

  const pins = useMemo(
    () => [...gigs.map(gigToPin), ...hangouts.map(hangoutToPin)],
    [gigs, hangouts],
  );
  const html = useMemo(() => buildMapHtml(pins), [pins]);
  const gigCount = gigs.length;
  const hangoutCount = hangouts.length;

  return (
    <ThemedView style={[styles.screen, { backgroundColor: c.background }]}>
      {Platform.OS === 'web' ? (
        <iframe
          srcDoc={html}
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
          <NamePlaque size="sm" />
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
          onPress={() => router.push('/post-gig')}>
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
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 4,
    borderWidth: 1,
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
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 4,
    borderWidth: 1,
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
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  fabText: {
    fontWeight: '600',
    fontSize: 14,
  },
});
