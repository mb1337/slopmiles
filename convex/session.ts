import { query } from "./_generated/server";
import { requireAuthenticatedUserId } from "./componentReadHelpers";

export { bootstrapSession } from "./users";

export const getSessionState = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const [user, runningSchedule, onboardingState, competitiveness, personality] = await Promise.all([
      ctx.db.get(userId),
      ctx.db.query("runningSchedules").withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId)).unique(),
      ctx.db.query("onboardingStates").withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId)).unique(),
      ctx.db.query("competitiveness").withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId)).unique(),
      ctx.db.query("personalities").withIndex("by_user_id", (queryBuilder) => queryBuilder.eq("userId", userId)).unique(),
    ]);

    return {
      user,
      runningSchedule,
      onboardingState,
      competitiveness,
      personality,
      strengthPreference: {
        enabled: user?.strengthTrainingEnabled ?? false,
        equipment: user?.strengthEquipment ?? [],
      },
    };
  },
});
