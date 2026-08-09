// SPIKE — throwaway. Hard-coded fake items, not real data, never touches
// the database. Deleted along with the rest of src/app/spike.

export type SpikeItem = {
  id: string;
  title: string;
  lifeArea: string;
  start: string; // ISO date
  end: string; // ISO date — equal to start for milestones
  rag: "green" | "amber" | "red" | "grey";
  kind: "task" | "milestone";
};

export const LIFE_AREAS = [
  "Move & Home",
  "Money",
  "Career & Learning",
  "Travel",
  "Health",
  "Us",
] as const;

export const SPIKE_ITEMS: SpikeItem[] = [
  // ---- Move & Home ----
  { id: "1", title: "Signed lease", lifeArea: "Move & Home", start: "2025-03-15", end: "2025-03-15", rag: "green", kind: "milestone" },
  { id: "2", title: "Pack apartment", lifeArea: "Move & Home", start: "2025-06-01", end: "2025-06-21", rag: "amber", kind: "task" },
  { id: "3", title: "Moving day", lifeArea: "Move & Home", start: "2025-07-01", end: "2025-07-01", rag: "green", kind: "task" },
  { id: "4", title: "Unpack & settle", lifeArea: "Move & Home", start: "2025-07-02", end: "2025-07-20", rag: "green", kind: "task" },

  // ---- Money ----
  { id: "5", title: "Mortgage repayment", lifeArea: "Money", start: "2025-01-01", end: "2027-06-01", rag: "grey", kind: "task" },
  { id: "6", title: "House deposit saved", lifeArea: "Money", start: "2025-02-10", end: "2025-02-10", rag: "green", kind: "milestone" },
  { id: "7", title: "Tax return prep", lifeArea: "Money", start: "2026-06-01", end: "2026-06-14", rag: "amber", kind: "task" },
  { id: "8", title: "Emergency fund complete", lifeArea: "Money", start: "2026-09-01", end: "2026-09-01", rag: "green", kind: "milestone" },

  // ---- Career & Learning ----
  { id: "9", title: "Learn Japanese", lifeArea: "Career & Learning", start: "2025-04-01", end: "2027-04-01", rag: "amber", kind: "task" },
  { id: "10", title: "JLPT N5 exam", lifeArea: "Career & Learning", start: "2026-12-06", end: "2026-12-06", rag: "grey", kind: "task" },
  { id: "11", title: "Complete online course", lifeArea: "Career & Learning", start: "2026-02-01", end: "2026-02-28", rag: "green", kind: "task" },
  { id: "12", title: "Promotion", lifeArea: "Career & Learning", start: "2027-01-15", end: "2027-01-15", rag: "green", kind: "milestone" },

  // ---- Travel ----
  { id: "13", title: "Japan trip planning", lifeArea: "Travel", start: "2027-01-01", end: "2027-02-15", rag: "amber", kind: "task" },
  { id: "14", title: "Flights booked", lifeArea: "Travel", start: "2027-02-16", end: "2027-02-16", rag: "green", kind: "task" },
  { id: "15", title: "Japan trip", lifeArea: "Travel", start: "2027-04-01", end: "2027-04-21", rag: "green", kind: "task" },
  { id: "16", title: "Passport renewed", lifeArea: "Travel", start: "2025-11-01", end: "2025-11-01", rag: "grey", kind: "milestone" },

  // ---- Health ----
  { id: "17", title: "Marathon training block", lifeArea: "Health", start: "2026-03-01", end: "2026-06-01", rag: "amber", kind: "task" },
  { id: "18", title: "Run marathon", lifeArea: "Health", start: "2026-06-14", end: "2026-06-14", rag: "red", kind: "task" },
  { id: "19", title: "Physio recovery", lifeArea: "Health", start: "2026-06-15", end: "2026-08-01", rag: "amber", kind: "task" },

  // ---- Us ----
  { id: "20", title: "Anniversary", lifeArea: "Us", start: "2026-05-20", end: "2026-05-20", rag: "green", kind: "milestone" },
  { id: "21", title: "Plan wedding", lifeArea: "Us", start: "2027-06-01", end: "2027-09-01", rag: "red", kind: "task" },
];

export const TIMELINE_START = new Date("2025-01-01");
export const TIMELINE_END = new Date("2028-01-01");
