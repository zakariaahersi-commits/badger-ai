export const INSTAGRAM_ASSET_CATALOG = {
  founder_path: { path: "/brand/bo-founder-path-social.jpg", description: "Bo walking beside a founder toward the launch flag" },
  solo_path: { path: "/brand/bo-solo-path-social.jpg", description: "Bo walking toward the launch flag" },
  daily_stage: { path: "/brand/bo-daily-stage-social.jpg", description: "Bo writing the founder's next move" },
} as const;

export type InstagramAssetId = keyof typeof INSTAGRAM_ASSET_CATALOG;
