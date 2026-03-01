import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { convexAuth, createAccount, retrieveAccount } from "@convex-dev/auth/server";
import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { internal } from "./_generated/api";

declare const process:
  | {
      env?: Record<string, string | undefined>;
    }
  | undefined;

const APPLE_ISSUER = "https://appleid.apple.com";
const DEFAULT_APPLE_AUDIENCE = "com.slopmiles.app";
const APPLE_JWKS = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));

type AppleIdentityTokenPayload = JWTPayload & {
  sub?: unknown;
  email?: unknown;
  email_verified?: unknown;
};

function stringOrUndefined(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function firstToken(value: string): string {
  const [token] = value.trim().split(/\s+/);
  return token ?? value;
}

function resolveAppleAudience(): string[] {
  const raw = process?.env?.AUTH_APPLE_NATIVE_AUDIENCE;
  if (!raw) {
    return [DEFAULT_APPLE_AUDIENCE];
  }

  const values = raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (values.length === 0) {
    return [DEFAULT_APPLE_AUDIENCE];
  }

  return values;
}

async function verifyAppleIdentityToken(identityToken: string): Promise<AppleIdentityTokenPayload> {
  const { payload } = await jwtVerify(identityToken, APPLE_JWKS, {
    issuer: APPLE_ISSUER,
    audience: resolveAppleAudience(),
  });
  return payload as AppleIdentityTokenPayload;
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    ConvexCredentials({
      id: "apple-native",
      authorize: async (credentials, ctx) => {
        const identityToken = stringOrUndefined(credentials.identityToken);
        if (!identityToken) {
          throw new Error("Missing Apple identity token.");
        }

        const payload = await verifyAppleIdentityToken(identityToken);
        const appleSubject = stringOrUndefined(payload.sub);
        if (!appleSubject) {
          throw new Error("Apple token is missing a subject.");
        }

        const appleUserId = stringOrUndefined(credentials.appleUserId);
        if (appleUserId && appleUserId !== appleSubject) {
          throw new Error("Apple account mismatch.");
        }

        let account: Awaited<ReturnType<typeof retrieveAccount>> | null = null;

        try {
          account = await retrieveAccount(ctx, {
            provider: "apple-native",
            account: {
              id: appleSubject,
            },
          });
        } catch (error) {
          if (!(error instanceof Error) || error.message !== "InvalidAccountId") {
            throw error;
          }
        }

        if (account) {
          const providedName = stringOrUndefined(credentials.name);
          if (providedName) {
            await ctx.runMutation(internal.users.setAppleDefaultNameForUser, {
              userId: account.user._id,
              appleDefaultName: firstToken(providedName),
            });
          }

          return {
            userId: account.user._id,
          };
        }

        const now = Date.now();
        const email = stringOrUndefined(payload.email) ?? stringOrUndefined(credentials.email);
        const emailVerified = payload.email_verified === true || payload.email_verified === "true";
        const providedName = stringOrUndefined(credentials.name);
        const name = providedName ? firstToken(providedName) : "Runner";
        const profile = {
          appleSubject,
          appleDefaultName: name,
          name,
          unitPreference: "system" as const,
          volumePreference: "time" as const,
          trackAccess: false,
          healthKitAuthorized: false,
          createdAt: now,
          updatedAt: now,
          ...(email ? { email } : {}),
          ...(email && emailVerified ? { emailVerificationTime: now } : {}),
        };

        const created = await createAccount(ctx, {
          provider: "apple-native",
          account: {
            id: appleSubject,
          },
          profile,
        });

        return {
          userId: created.user._id,
        };
      },
    }),
  ],
});
