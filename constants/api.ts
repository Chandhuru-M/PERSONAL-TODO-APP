import Constants from 'expo-constants';
import { Platform } from 'react-native';

const DEFAULT_BASE_URL = Platform.select({
  android: 'http://10.0.2.2:4000',
  ios: 'http://localhost:4000',
  default: 'http://localhost:4000',
});

function deriveHostFromExpo(): string | undefined {
  const expoHost =
    Constants.expoGoConfig?.debuggerHost ??
    Constants.expoGoConfig?.hostUri ??
    Constants.expoConfig?.hostUri;

  if (!expoHost) return undefined;

  const host = expoHost.split(':')[0];
  if (!host || host === 'localhost' || host === '127.0.0.1') {
    return undefined;
  }

  return `http://${host}:4000`;
}

const expoDerivedBaseUrl = deriveHostFromExpo();

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? expoDerivedBaseUrl ?? DEFAULT_BASE_URL;

export const API_ROUTES = {
  tasks: `${API_BASE_URL}/api/tasks`,
  currentUser: `${API_BASE_URL}/api/users/me`,
};
