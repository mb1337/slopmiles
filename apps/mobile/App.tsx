import { useMemo } from "react";
import Constants from "expo-constants";
import { StatusBar } from "expo-status-bar";
import { Authenticated, AuthLoading, ConvexReactClient, Unauthenticated } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import * as SecureStore from "expo-secure-store";
import { ActivityIndicator, Platform, Text } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import AppRoot from "./src/AppRoot";
import { MissingConfigScreen } from "./src/screens/MissingConfigScreen";
import { SignInScreen } from "./src/screens/SignInScreen";
import { styles } from "./src/styles";

declare const process:
  | {
      env?: Record<string, string | undefined>;
    }
  | undefined;

const convexUrl = (Constants.expoConfig?.extra?.convexUrl as string | undefined)?.trim() || undefined;

const secureStorage = {
  getItem: SecureStore.getItemAsync,
  setItem: SecureStore.setItemAsync,
  removeItem: SecureStore.deleteItemAsync,
};

export default function App() {
  const convex = useMemo(() => {
    if (!convexUrl) {
      return null;
    }
    return new ConvexReactClient(convexUrl);
  }, [convexUrl]);

  if (!convex) {
    return (
      <SafeAreaProvider>
        <MissingConfigScreen />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <ConvexAuthProvider
        client={convex}
        storage={Platform.OS === "ios" || Platform.OS === "android" ? secureStorage : undefined}
      >
        <StatusBar style="dark" />
        <AuthLoading>
          <SafeAreaView style={styles.screenCenter}>
            <ActivityIndicator color="#154e72" size="large" />
            <Text style={styles.helperText}>Restoring secure session...</Text>
          </SafeAreaView>
        </AuthLoading>
        <Unauthenticated>
          <SignInScreen />
        </Unauthenticated>
        <Authenticated>
          <AppRoot />
        </Authenticated>
      </ConvexAuthProvider>
    </SafeAreaProvider>
  );
}
