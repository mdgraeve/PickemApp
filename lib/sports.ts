export const SPORTS = ["NFL", "NBA", "MLB", "NHL", "NCAAF", "NCAAB"] as const;
export type Sport = (typeof SPORTS)[number];
