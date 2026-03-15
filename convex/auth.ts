import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { convexAuth, createAccount, retrieveAccount } from "@convex-dev/auth/server";
import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { Email } from "@convex-dev/auth/providers/Email";
import Apple from "@auth/core/providers/apple";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

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

function preferredAppleName(profile: Record<string, unknown>): string | undefined {
  return (
    stringOrUndefined(profile.given_name) ??
    stringOrUndefined(profile.firstName) ??
    stringOrUndefined(profile.name)
  );
}

function resolveAuthBaseUrl(): string | null {
  const candidate =
    process?.env?.SITE_URL?.trim() ||
    process?.env?.CUSTOM_AUTH_SITE_URL?.trim() ||
    process?.env?.CONVEX_SITE_URL?.trim() ||
    null;

  return candidate ? candidate.replace(/\/$/, "") : null;
}

function fallbackNameFromEmail(email: string): string {
  const [localPart] = email.trim().toLowerCase().split("@");
  if (!localPart) {
    return "Runner";
  }

  const normalized = localPart.replace(/[._-]+/g, " ").trim();
  return normalized.length > 0 ? firstToken(normalized) : "Runner";
}

async function upsertAppleUser(ctx: MutationCtx, args: {
  appleSubject: string;
  name?: string;
  email?: string;
  emailVerified?: boolean;
  existingUserId?: Id<"users"> | null;
}) {
  const now = Date.now();
  const normalizedName = args.name ? firstToken(args.name) : undefined;
  const existingBySubject = await ctx.db
    .query("users")
    .withIndex("by_apple_subject", (queryBuilder) =>
      queryBuilder.eq("appleSubject", args.appleSubject),
    )
    .unique();

  const targetUserId = args.existingUserId ?? existingBySubject?._id ?? null;
  if (targetUserId) {
    const user = await ctx.db.get(targetUserId);
    if (!user) {
      throw new Error("Linked Apple user no longer exists.");
    }

    const currentName = user.name?.trim() ?? "";
    const appleDefaultName = user.appleDefaultName?.trim() ?? "";
    await ctx.db.patch(targetUserId, {
      appleSubject: args.appleSubject,
      ...(normalizedName && (appleDefaultName.length === 0 || appleDefaultName.toLowerCase() === "runner")
        ? { appleDefaultName: normalizedName }
        : {}),
      ...(normalizedName && (currentName.length === 0 || currentName.toLowerCase() === "runner") ? { name: normalizedName } : {}),
      ...(args.email ? { email: args.email } : {}),
      ...(args.email && args.emailVerified ? { emailVerificationTime: now } : {}),
      updatedAt: now,
    });
    return targetUserId;
  }

  return await ctx.db.insert("users", {
    appleSubject: args.appleSubject,
    appleDefaultName: normalizedName ?? "Runner",
    name: normalizedName ?? "Runner",
    unitPreference: "system",
    volumePreference: "time",
    trackAccess: false,
    healthKitAuthorized: false,
    strengthTrainingEnabled: false,
    strengthEquipment: [],
    createdAt: now,
    updatedAt: now,
    ...(args.email ? { email: args.email } : {}),
    ...(args.email && args.emailVerified ? { emailVerificationTime: now } : {}),
  });
}

async function upsertEmailUser(ctx: MutationCtx, args: {
  email: string;
  existingUserId?: Id<"users"> | null;
}) {
  const now = Date.now();
  const normalizedEmail = args.email.trim().toLowerCase();
  const existingByEmail = await ctx.db
    .query("users")
    .withIndex("by_email", (queryBuilder) => queryBuilder.eq("email", normalizedEmail))
    .unique();

  const targetUserId = args.existingUserId ?? existingByEmail?._id ?? null;
  if (targetUserId) {
    const user = await ctx.db.get(targetUserId);
    if (!user) {
      throw new Error("Linked email user no longer exists.");
    }

    await ctx.db.patch(targetUserId, {
      email: normalizedEmail,
      ...(user.emailVerificationTime ? {} : { emailVerificationTime: now }),
      updatedAt: now,
    });
    return targetUserId;
  }

  const name = fallbackNameFromEmail(normalizedEmail);
  return await ctx.db.insert("users", {
    name,
    appleDefaultName: name,
    email: normalizedEmail,
    emailVerificationTime: now,
    unitPreference: "system",
    volumePreference: "time",
    trackAccess: false,
    healthKitAuthorized: false,
    strengthTrainingEnabled: false,
    strengthEquipment: [],
    createdAt: now,
    updatedAt: now,
  });
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
    Email({
      async sendVerificationRequest({ identifier, token }) {
        const apiKey = process?.env?.AUTH_RESEND_KEY?.trim();
        const from = process?.env?.AUTH_EMAIL_FROM?.trim() || "SlopMiles <onboarding@resend.dev>";

        if (!apiKey) {
          console.log(`[auth] OTP for ${identifier}: ${token}`);
          return;
        }

        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from,
            to: [identifier],
            subject: "Your SlopMiles sign-in code",
            text: `Your SlopMiles sign-in code is ${token}.`,
          }),
        });

        if (!response.ok) {
          throw new Error(`Resend OTP delivery failed with ${response.status}.`);
        }
      },
    }),
    Apple({
      clientId: process?.env?.AUTH_APPLE_ID ?? "",
      clientSecret: process?.env?.AUTH_APPLE_SECRET ?? "",
    }),
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
  callbacks: {
    async createOrUpdateUser(ctx, args) {
      if (args.provider.id === "email") {
        const email = stringOrUndefined(args.profile.email);
        if (!email) {
          throw new Error("Email OTP sign-in is missing an email address.");
        }

        return await upsertEmailUser(ctx, {
          email,
          existingUserId: args.existingUserId,
        });
      }

      if (args.provider.id !== "apple") {
        if (args.existingUserId) {
          return args.existingUserId;
        }
        throw new Error(`Unsupported automatic user creation for provider ${args.provider.id}.`);
      }

      const appleSubject = stringOrUndefined(args.profile.sub);
      if (!appleSubject) {
        throw new Error("Apple profile is missing a subject.");
      }

      return await upsertAppleUser(ctx, {
        appleSubject,
        name: preferredAppleName(args.profile),
        email: stringOrUndefined(args.profile.email),
        emailVerified: args.profile.emailVerified === true,
        existingUserId: args.existingUserId,
      });
    },
    async redirect({ redirectTo }) {
      if (!redirectTo) {
        const baseUrl = resolveAuthBaseUrl();
        return baseUrl ? `${baseUrl}/dashboard` : "/dashboard";
      }

      const normalized = redirectTo.trim();
      if (normalized.length === 0) {
        const baseUrl = resolveAuthBaseUrl();
        return baseUrl ? `${baseUrl}/dashboard` : "/dashboard";
      }

      if (normalized.startsWith("slopmiles://")) {
        return normalized;
      }

      if (normalized.startsWith("/")) {
        const baseUrl = resolveAuthBaseUrl();
        return baseUrl ? `${baseUrl}${normalized}` : normalized;
      }

      const allowedOrigins = (process?.env?.AUTH_REDIRECT_ALLOWLIST ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value.length > 0);

      const matchesAllowedOrigin = allowedOrigins.some((origin) => normalized.startsWith(origin));
      if (matchesAllowedOrigin) {
        return normalized;
      }

      const baseUrl = resolveAuthBaseUrl();
      return baseUrl ? `${baseUrl}/dashboard` : "/dashboard";
    },
  },
});
