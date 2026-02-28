import { anyApi } from "convex/server";
import type * as ApiModule from "../../../convex/_generated/api";

export const api = anyApi as unknown as typeof ApiModule.api;
export type { Id } from "../../../convex/_generated/dataModel";
