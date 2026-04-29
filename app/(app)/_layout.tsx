import { Stack } from 'expo-router';
import OfflineBanner from '../../components/OfflineBanner';
import { View } from 'react-native';

export default function AppLayout() {
  return (
    <View style={{ flex: 1, backgroundColor: '#0A0A0A' }}>
      <OfflineBanner />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#141414' },
          headerTintColor: '#F5F5F5',
          headerTitleStyle: { fontWeight: '700', letterSpacing: 0.5 },
          headerBackTitle: '',
          contentStyle: { backgroundColor: '#0A0A0A' },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Mis Órdenes' }} />
        <Stack.Screen name="ot/[id]" options={{ title: 'Detalle OT' }} />
      </Stack>
    </View>
  );
}
