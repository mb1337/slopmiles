export type PlatformCapability = "shared" | "mobile-only";

export const PLATFORM_CAPABILITIES = {
  healthKitImport: "mobile-only",
  healthKitStatus: "shared",
} as const satisfies Record<string, PlatformCapability>;

export const SETTINGS_COMPONENT_CAPABILITIES = {
  healthKitImport: PLATFORM_CAPABILITIES.healthKitImport,
  healthKitStatus: PLATFORM_CAPABILITIES.healthKitStatus,
} as const;
