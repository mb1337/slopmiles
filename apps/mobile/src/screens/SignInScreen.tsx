import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Text, View } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { useAuthActions } from "@convex-dev/auth/react";
import { SafeAreaView } from "react-native-safe-area-context";

import { Panel } from "../components/common";
import { styles } from "../styles";

function wasAppleSignInCancelled(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  return "code" in error && (error as { code?: string }).code === "ERR_REQUEST_CANCELED";
}

function formatAppleSignInError(error: unknown): string {
  if (!error || typeof error !== "object") {
    return String(error);
  }

  const code = "code" in error ? (error as { code?: unknown }).code : undefined;
  const message = "message" in error ? (error as { message?: unknown }).message : undefined;
  const codeText = typeof code === "string" ? code : undefined;
  const messageText = typeof message === "string" ? message : String(error);

  if (codeText === "ERR_REQUEST_UNKNOWN") {
    return "Sign in with Apple is not fully configured for this build yet. Rebuild the iOS app after enabling usesAppleSignIn and verify the Apple Sign In capability for this bundle ID in Apple Developer.";
  }

  return codeText ? `${codeText}: ${messageText}` : messageText;
}

function firstNameFromCredential(credential: AppleAuthentication.AppleAuthenticationCredential): string | null {
  const givenName = credential.fullName?.givenName?.trim();
  if (givenName && givenName.length > 0) {
    return givenName;
  }

  const middleName = credential.fullName?.middleName?.trim();
  if (middleName && middleName.length > 0) {
    return middleName;
  }

  const familyName = credential.fullName?.familyName?.trim();
  if (familyName && familyName.length > 0) {
    return familyName;
  }

  return null;
}

export function SignInScreen() {
  const { signIn } = useAuthActions();
  const [appleAvailable, setAppleAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const checkAvailability = async () => {
      if (Platform.OS !== "ios") {
        if (mounted) {
          setAppleAvailable(false);
        }
        return;
      }

      try {
        const available = await AppleAuthentication.isAvailableAsync();
        if (mounted) {
          setAppleAvailable(available);
        }
      } catch {
        if (mounted) {
          setAppleAvailable(false);
        }
      }
    };

    void checkAvailability();

    return () => {
      mounted = false;
    };
  }, []);

  const handleAppleSignIn = async () => {
    setBusy(true);
    setError(null);

    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      const identityToken = credential.identityToken;
      if (!identityToken) {
        throw new Error("Apple did not return an identity token.");
      }

      const params: Record<string, string> = {
        identityToken,
        appleUserId: credential.user,
      };

      if (credential.email) {
        params.email = credential.email;
      }

      const firstName = firstNameFromCredential(credential);
      if (firstName) {
        params.name = firstName;
      }

      await signIn("apple-native", params);
    } catch (signInError) {
      if (!wasAppleSignInCancelled(signInError)) {
        setError(formatAppleSignInError(signInError));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.screenCenter}>
      <View style={{ width: "100%", maxWidth: 360, paddingHorizontal: 20 }}>
        <Text style={styles.kicker}>SlopMiles</Text>
        <Text style={styles.heading}>Sign in to continue</Text>
        <Panel title="Sign in with Apple">
          <Text style={styles.bodyText}>Use your Apple account to unlock your coaching data and sync across sessions.</Text>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {appleAvailable === null ? (
            <View style={{ alignItems: "center", paddingVertical: 8 }}>
              <ActivityIndicator color="#154e72" size="small" />
            </View>
          ) : null}
          {appleAvailable ? (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={10}
              style={{ width: "100%", height: 46, opacity: busy ? 0.6 : 1 }}
              onPress={() => {
                if (!busy) {
                  void handleAppleSignIn();
                }
              }}
            />
          ) : null}
          {appleAvailable === false ? (
            <Text style={styles.helperText}>
              Sign in with Apple is unavailable on this device. SlopMiles mobile auth currently supports iOS only.
            </Text>
          ) : null}
        </Panel>
      </View>
    </SafeAreaView>
  );
}
