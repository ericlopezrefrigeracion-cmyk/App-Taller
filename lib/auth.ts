import * as SecureStore from 'expo-secure-store';
import axios from 'axios';
import { API_URL } from './config';

const ACCESS_TOKEN_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';
const USER_KEY = 'user';

export async function saveTokens(accessToken: string, refreshToken: string) {
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
}

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

export async function saveUser(user: object) {
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
}

export async function getUser() {
  const raw = await SecureStore.getItemAsync(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export async function logout() {
  try {
    const [accessToken, refreshToken] = await Promise.all([
      getAccessToken(),
      getRefreshToken(),
    ]);
    if (accessToken && refreshToken) {
      await axios.post(
        `${API_URL}/auth/logout`,
        { refreshToken },
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
    }
  } catch {
    // Ignorar errores de red en logout — igual limpiamos localmente
  } finally {
    await clearAuth();
  }
}

export async function clearAuth() {
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  await SecureStore.deleteItemAsync(USER_KEY);
}
