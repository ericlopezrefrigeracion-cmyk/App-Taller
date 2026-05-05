import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import axios from 'axios';
import { API_URL } from '../../lib/config';
import { saveTokens, saveUser } from '../../lib/auth';

export default function LoginScreen() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleLogin() {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Ingresá tu email y contraseña');
      return;
    }

    setLoading(true);
    try {
      const { data } = await axios.post(`${API_URL}/auth/login`, {
        email: email.trim(),
        password,
        platform: 'app',
      });

      await saveTokens(data.accessToken, data.refreshToken);
      await saveUser(data.usuario);
      router.replace('/(app)/');
    } catch (error: any) {
      const message = error.response?.data?.message || 'Credenciales incorrectas';
      Alert.alert('Error al iniciar sesión', message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.logoContainer}>
          <View style={styles.logoMark}>
            <View style={styles.logoLine} />
            <Text style={styles.logoText}>ERIC LÓPEZ</Text>
            <Text style={styles.logoTextSub}>CLIMATIZACIÓN</Text>
          </View>
          <Text style={styles.appBadge}>TÉCNICOS</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Acceso técnicos</Text>

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="tecnico@empresa.com"
            placeholderTextColor="#555"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>Contraseña</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor="#555"
            secureTextEntry
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>INGRESAR</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 28,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logoMark: {
    alignItems: 'center',
    marginBottom: 16,
  },
  logoLine: {
    width: 40,
    height: 3,
    backgroundColor: '#E8500A',
    marginBottom: 12,
  },
  logoText: {
    fontWeight: 'bold',
    fontSize: 28,
    color: '#F5F5F5',
    letterSpacing: 2,
  },
  logoTextSub: {
    fontSize: 13,
    color: '#E8500A',
    letterSpacing: 4,
    fontWeight: '600',
    marginTop: 2,
  },
  appBadge: {
    fontSize: 11,
    color: '#888888',
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: '#141414',
    borderRadius: 8,
    padding: 24,
    borderWidth: 1,
    borderColor: '#1F1F1F',
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888888',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 20,
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
    color: '#888888',
    marginBottom: 6,
    marginTop: 14,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#1F1F1F',
    borderRadius: 4,
    padding: 13,
    fontSize: 15,
    color: '#F5F5F5',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  button: {
    backgroundColor: '#E8500A',
    borderRadius: 4,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
});
