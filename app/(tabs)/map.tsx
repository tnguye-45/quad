import { router } from 'expo-router';
import { useMemo } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { NamePlaque } from '@/components/logo';
import { NativeMap, type MapPin } from '@/components/native-map';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePosts, type Gig, type Hangout } from '@/lib/posts-store';

type Pin = MapPin;

const CAMPUS_CENTER = { lat: 41.702, lon: -86.2375 };

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
    id: `g-${gig.id}`,
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
    id: `h-${h.id}`,
    lat,
    lon,
    title: h.title,
    meta: `${h.going} going · ${h.when} · ${h.where}`,
    kind: 'hangout',
  };
}

// When the site is served under a sub-path (e.g. /quad/ on GitHub Pages),
// the iframe's absolute paths still resolve against the parent origin —
// so /leaflet/leaflet.css would 404. Prefix with the build-time base URL.
const BASE_URL = (process.env.EXPO_PUBLIC_BASE_URL ?? '').replace(/\/$/, '');

function buildMapHtml(pins: Pin[]): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="initial-scale=1.0,width=device-width">
<link rel="stylesheet" href="${BASE_URL}/leaflet/leaflet.css"/>
<script src="${BASE_URL}/leaflet/leaflet.js"></script>
<style>
  html,body,#map{height:100%;margin:0;padding:0;background:#FBF8F1;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
  .pin-chip{
    display:inline-flex;align-items:center;gap:6px;
    padding:5px 10px;background:#FBF8F1;border:1px solid #E8DFC9;
    border-radius:14px;font-size:11px;font-weight:600;color:#0C2340;
    line-height:1;white-space:nowrap;cursor:pointer;letter-spacing:-0.1px;
    box-shadow:0 1px 2px rgba(12,35,64,.06);
    transition:transform .15s ease, box-shadow .15s ease;
  }
  .pin-chip:hover{transform:translateY(-1px);box-shadow:0 4px 12px rgba(12,35,64,.14)}
  .pin-chip .dot{width:6px;height:6px;border-radius:3px;flex-shrink:0}
  .pin-chip .dot.gig{background:#0C2340}
  .pin-chip .dot.hangout{background:#C99700}
  .leaflet-marker-icon.pin-wrap{background:transparent;border:none}
  .leaflet-popup-content-wrapper{border-radius:8px;box-shadow:0 4px 14px rgba(12,35,64,.12);padding:2px;background:#FBF8F1}
  .leaflet-popup-content{margin:10px 14px;font-size:13px;color:#0C2340;line-height:1.45}
  .leaflet-popup-content b{display:block;margin-bottom:3px;font-size:14px;font-weight:700;letter-spacing:-0.2px}
  .leaflet-popup-content .meta{color:#5D6B85;font-size:11px;font-family:SFMono-Regular,Menlo,Monaco,Consolas,monospace;letter-spacing:0.3px}
  .leaflet-popup-tip{box-shadow:none;background:#FBF8F1}
  .leaflet-control-attribution{font-size:10px;background:rgba(251,248,241,.8);color:#5D6B85}
  .leaflet-control-attribution a{color:#0C2340}
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
        <NativeMap pins={pins} />
      )}

      <View style={styles.topOverlay} pointerEvents="box-none">
        <View
          style={[
            styles.headerPill,
            { backgroundColor: c.background, borderColor: c.border },
          ]}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.5 : 1 }]}>
            <IconSymbol name="chevron.left" size={20} color={c.text} />
          </Pressable>
          <View style={styles.headerCenter}>
            <NamePlaque size="sm" />
            <ThemedText
              style={[styles.headerSubtitle, { color: c.textMuted }]}
              type="mono">
              campus map · notre dame
            </ThemedText>
          </View>
          <View style={styles.backBtn} />
        </View>
      </View>

      <View style={styles.bottomOverlay} pointerEvents="box-none">
        <View
          style={[
            styles.legend,
            { backgroundColor: c.background, borderColor: c.border },
          ]}>
          <View style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: c.tint }]} />
            <ThemedText style={[styles.legendNumber, { color: c.text }]}>
              {gigCount}
            </ThemedText>
            <ThemedText
              style={[styles.legendLabel, { color: c.textMuted }]}
              type="mono">
              gigs
            </ThemedText>
          </View>
          <View style={[styles.legendDivider, { backgroundColor: c.border }]} />
          <View style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: c.accent }]} />
            <ThemedText style={[styles.legendNumber, { color: c.text }]}>
              {hangoutCount}
            </ThemedText>
            <ThemedText
              style={[styles.legendLabel, { color: c.textMuted }]}
              type="mono">
              hangouts
            </ThemedText>
          </View>
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 52,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  headerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    boxShadow: '0px 2px 8px rgba(12, 35, 64, 0.08)',
    elevation: 3,
  },
  backBtn: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 4,
  },
  headerSubtitle: {
    fontSize: 9,
    letterSpacing: 0.6,
    textTransform: 'lowercase',
  },
  bottomOverlay: {
    position: 'absolute',
    bottom: 96,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    boxShadow: '0px 2px 8px rgba(12, 35, 64, 0.08)',
    elevation: 3,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendNumber: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  legendLabel: {
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  legendDivider: {
    width: StyleSheet.hairlineWidth,
    height: 16,
  },
});
