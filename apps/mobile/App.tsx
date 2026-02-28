import { useMemo } from "react";
import { StatusBar } from "expo-status-bar";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import AppRoot from "./src/AppRoot";
import { MissingConfigScreen } from "./src/screens/MissingConfigScreen";

declare const process:
  | {
      env?: Record<string, string | undefined>;
    }
  | undefined;

const convexUrl = process?.env?.EXPO_PUBLIC_CONVEX_URL;

export default function App() {
  const convex = useMemo(() => {
    if (!convexUrl) {
      return null;
    }
    return new ConvexReactClient(convexUrl);
  }, []);

  if (!convex) {
    return (
      <SafeAreaProvider>
        <MissingConfigScreen />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <ConvexProvider client={convex}>
        <StatusBar style="dark" />
        <AppRoot />
      </ConvexProvider>
    </SafeAreaProvider>
  );
}
