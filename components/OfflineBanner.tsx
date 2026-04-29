import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

export default function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      setOffline(state.isConnected === false);
    });
    return unsub;
  }, []);

  if (!offline) return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>SIN CONEXIÓN — Solo lectura</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#7A1A00',
    paddingVertical: 6,
    alignItems: 'center',
  },
  text: {
    color: '#FFD0C0',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
