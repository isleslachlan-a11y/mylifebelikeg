import { notFound } from "next/navigation";

import { TimelineSpike } from "./timeline-spike";

// SPIKE — throwaway, per P0.8. Not linked from product nav, dev-only, and
// this whole src/app/spike directory gets deleted once SPIKE-NOTES.md is
// written. Do not build on top of this.
export default function TimelineSpikePage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <TimelineSpike />;
}
