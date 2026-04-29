import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { getAccessToken } from '../lib/auth';

export default function Index() {
  const [loading, setLoading] = useState(true);
  const [hasToken, setHasToken] = useState(false);

  useEffect(() => {
    getAccessToken().then((token) => {
      setHasToken(!!token);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0A0A0A' }}>
        <ActivityIndicator size="large" color="#E8500A" />
      </View>
    );
  }

  return <Redirect href={hasToken ? '/(app)/' : '/(auth)/login'} />;
}
