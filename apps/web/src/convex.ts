import { anyApi } from "convex/server";

import type { api as ApiType } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export const api = anyApi as unknown as typeof ApiType;
export type { Id };
