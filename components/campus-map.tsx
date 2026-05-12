import { Platform, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';

const ND_LAT = 41.7030;
const ND_LON = -86.2390;
const BBOX = `${ND_LON - 0.012}%2C${ND_LAT - 0.008}%2C${ND_LON + 0.012}%2C${ND_LAT + 0.008}`;
const OSM_EMBED = `https://www.openstreetmap.org/export/embed.html?bbox=${BBOX}&layer=mapnik&marker=${ND_LAT}%2C${ND_LON}`;

export function CampusMap() {
  const isDark = (useColorScheme() ?? 'light') === 'dark';

  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: isDark ? '#171717' : '#ffffff',
          borderColor: isDark ? '#262626' : '#e5e7eb',
        },
      ]}>
      {Platform.OS === 'web' ? (
        <iframe
          src={OSM_EMBED}
          title="University of Notre Dame campus map"
          style={{
            width: '100%',
            height: '100%',
            border: 0,
            display: 'block',
            filter: isDark ? 'invert(0.9) hue-rotate(180deg)' : 'none',
          }}
        />
      ) : (
        <View style={styles.placeholder}>
          <ThemedText style={styles.placeholderText}>Notre Dame, IN</ThemedText>
          <ThemedText style={styles.placeholderSubtle}>map preview · web only</ThemedText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 180,
    borderRadius: 4,
    borderWidth: 1,
    overflow: 'hidden',
    marginHorizontal: 20,
    marginBottom: 16,
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  placeholderText: {
    fontSize: 16,
    fontWeight: '600',
  },
  placeholderSubtle: {
    fontSize: 12,
    opacity: 0.6,
  },
});
