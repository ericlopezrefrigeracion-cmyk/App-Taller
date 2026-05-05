import { Tabs } from 'expo-router';
import { Text } from 'react-native';

function Icon({ label }: { label: string }) {
  return <Text style={{ fontSize: 18 }}>{label}</Text>;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarStyle: {
          backgroundColor: '#141414',
          borderTopColor: '#1F1F1F',
        },
        tabBarActiveTintColor: '#E8500A',
        tabBarInactiveTintColor: '#666666',
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5 },
        headerStyle: { backgroundColor: '#141414' },
        headerTintColor: '#F5F5F5',
        headerTitleStyle: { fontWeight: '700', letterSpacing: 0.5 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Mis Órdenes',
          tabBarIcon: ({ color }) => <Icon label="📋" />,
        }}
      />
      <Tabs.Screen
        name="equipo-nuevo"
        options={{
          title: 'Nuevo Equipo',
          tabBarIcon: ({ color }) => <Icon label="🔧" />,
        }}
      />
    </Tabs>
  );
}
