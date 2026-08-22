import { identitySessionSchema, type IdentitySession } from "@kit/api-contract";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const SESSION_KEY = "kit.session";

type StoredSession = IdentitySession;

async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    globalThis.localStorage.setItem(key, value);
    return;
  }

  await SecureStore.setItemAsync(key, value);
}

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    return globalThis.localStorage.getItem(key);
  }

  return SecureStore.getItemAsync(key);
}

async function deleteItem(key: string): Promise<void> {
  if (Platform.OS === "web") {
    globalThis.localStorage.removeItem(key);
    return;
  }

  await SecureStore.deleteItemAsync(key);
}

export async function saveSession(session: StoredSession): Promise<void> {
  await setItem(SESSION_KEY, JSON.stringify(session));
}

export async function loadSession(): Promise<StoredSession | null> {
  const raw = await getItem(SESSION_KEY);
  if (!raw) {
    return null;
  }

  try {
    return identitySessionSchema.parse(JSON.parse(raw));
  } catch {
    await deleteItem(SESSION_KEY);
    return null;
  }
}

export async function clearSession(): Promise<void> {
  await deleteItem(SESSION_KEY);
}
