export type HistoryFeedStatus = "all" | "matched" | "needsReview" | "unplanned";

export type HistoryFeedView = {
  matched: number;
  needsReview: number;
  unplanned: number;
};
