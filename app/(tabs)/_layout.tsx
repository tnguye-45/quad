import { Tabs } from 'expo-router';
import React from 'react';

import { AppTabBar } from '@/components/app-tab-bar';

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <AppTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}>
      <Tabs.Screen name="index" options={{ title: 'Gigs' }} />
      <Tabs.Screen name="voices" options={{ title: 'Voices' }} />
      <Tabs.Screen name="explore" options={{ title: 'Hangouts' }} />
      <Tabs.Screen name="messages" options={{ title: 'Messages' }} />
      <Tabs.Screen name="map" options={{ title: 'Map', href: null }} />
    </Tabs>
  );
}
