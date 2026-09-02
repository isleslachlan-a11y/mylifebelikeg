/** One row of `app.presets_unlocked_by`'s return shape (0026) — what a
 * given achievement makes available in the avatar editor. */
export type UnlockedPreset = {
  code: string;
  category: string;
  name: string;
};

/**
 * The rich shape `evaluate.ts`'s `celebrate` builds around a single
 * `app.evaluate_achievements`/`app.grant_achievement` grant — enough for
 * `<AchievementCelebration>` to render "what it unlocked" without a
 * second round trip once this has already been assembled server-side.
 */
export type NewlyUnlockedAchievement = {
  code: string;
  name: string;
  presets: UnlockedPreset[];
};
