// @vitest-environment edge-runtime

import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import {
  asAuthenticatedUser,
  createConvexTest,
  createTestUser,
  getOnboardingStateForUser,
  getRunningScheduleForUser,
  getUser,
} from "./test.setup";

describe("onboarding integration", () => {
  it("saves profile basics and running schedule while advancing onboarding", async () => {
    const t = createConvexTest();
    const user = await createTestUser(t);
    const authed = asAuthenticatedUser(t, user._id);

    await authed.mutation(api.onboarding.saveProfileBasics, {
      unitPreference: "metric",
      volumePreference: "distance",
    });

    const userAfterProfile = await getUser(t, user._id);
    const onboardingAfterProfile = await getOnboardingStateForUser(t, user._id);

    expect(userAfterProfile?.unitPreference).toBe("metric");
    expect(userAfterProfile?.volumePreference).toBe("distance");
    expect(onboardingAfterProfile?.currentStep).toBe("runningSchedule");
    expect(onboardingAfterProfile?.isComplete).toBe(false);

    await authed.mutation(api.onboarding.saveRunningSchedule, {
      preferredRunningDays: ["monday", "wednesday", "friday"],
      runningDaysPerWeek: 3,
      preferredLongRunDay: "friday",
      preferredQualityDays: ["wednesday"],
    });

    const runningSchedule = await getRunningScheduleForUser(t, user._id);
    const onboardingAfterSchedule = await getOnboardingStateForUser(t, user._id);

    expect(runningSchedule).toMatchObject({
      userId: user._id,
      preferredRunningDays: ["monday", "wednesday", "friday"],
      runningDaysPerWeek: 3,
      preferredLongRunDay: "friday",
      preferredQualityDays: ["wednesday"],
    });
    expect(onboardingAfterSchedule?.currentStep).toBe("trackAccess");
    expect(onboardingAfterSchedule?.isComplete).toBe(false);
  });

  it("rejects invalid schedule updates without changing persisted state", async () => {
    const t = createConvexTest();
    const user = await createTestUser(t);
    const authed = asAuthenticatedUser(t, user._id);

    await authed.mutation(api.onboarding.saveProfileBasics, {
      unitPreference: "imperial",
      volumePreference: "time",
    });
    await authed.mutation(api.onboarding.saveRunningSchedule, {
      preferredRunningDays: ["tuesday", "thursday", "saturday"],
      runningDaysPerWeek: 3,
      preferredLongRunDay: "saturday",
      preferredQualityDays: ["thursday"],
    });

    const scheduleBefore = await getRunningScheduleForUser(t, user._id);
    const onboardingBefore = await getOnboardingStateForUser(t, user._id);

    await expect(
      authed.mutation(api.onboarding.saveRunningSchedule, {
        preferredRunningDays: [],
        runningDaysPerWeek: 1,
        preferredLongRunDay: undefined,
        preferredQualityDays: [],
      }),
    ).rejects.toThrow("At least one preferred running day is required.");

    const scheduleAfter = await getRunningScheduleForUser(t, user._id);
    const onboardingAfter = await getOnboardingStateForUser(t, user._id);

    expect(scheduleAfter).toEqual(scheduleBefore);
    expect(onboardingAfter).toEqual(onboardingBefore);
  });
});
