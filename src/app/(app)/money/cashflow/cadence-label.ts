import type { Database } from "@/types/database";

type Cadence = Database["public"]["Enums"]["cadence"];

const CADENCE_LABELS: Record<Cadence, string> = {
  one_off: "One-off",
  weekly: "Weekly",
  fortnightly: "Fortnightly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annually: "Annually",
};

export function cadenceLabel(frequency: Cadence): string {
  return CADENCE_LABELS[frequency];
}

/** Every option in display order, for the frequency Select. */
export const CADENCE_OPTIONS: Cadence[] = [
  "one_off",
  "weekly",
  "fortnightly",
  "monthly",
  "quarterly",
  "annually",
];
