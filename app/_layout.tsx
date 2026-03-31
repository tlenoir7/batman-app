import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Colors } from '../constants/colors';
import { connectSocket, disconnectSocket } from '../services/socket';

export default function RootLayout() {
  useEffect(() => {
    connectSocket();
    return () => disconnectSocket();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: Colors.primary },
          headerTintColor: Colors.textPrimary,
          headerTitleStyle: { color: Colors.textPrimary },
          contentStyle: { backgroundColor: Colors.background },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen
          name="caseboard"
          options={{
            title: 'Case Board',
            headerBackTitle: 'Briefing',
          }}
        />
        <Stack.Screen
          name="casedetail"
          options={{
            title: 'Case Detail',
            headerBackTitle: 'Case Board',
          }}
        />
        <Stack.Screen
          name="profiles"
          options={{
            title: 'Profiles',
            headerBackTitle: 'Briefing',
          }}
        />
        <Stack.Screen
          name="profiledetail"
          options={{
            title: 'Profile',
            headerBackTitle: 'Profiles',
          }}
        />
        <Stack.Screen
          name="forensic"
          options={{
            title: 'Forensic',
            headerBackTitle: 'Briefing',
          }}
        />
        <Stack.Screen
          name="arsenal"
          options={{
            title: 'Arsenal',
            headerBackTitle: 'Briefing',
          }}
        />
        <Stack.Screen
          name="voicenote"
          options={{
            title: 'Voice Note',
            headerBackTitle: 'Briefing',
          }}
        />
        <Stack.Screen
          name="suitdetail"
          options={{
            title: 'Suit',
            headerBackTitle: 'Arsenal',
          }}
        />
        <Stack.Screen
          name="gadgetdetail"
          options={{
            title: 'Gadget',
            headerBackTitle: 'Arsenal',
          }}
        />
      </Stack>
    </SafeAreaProvider>
  );
}
