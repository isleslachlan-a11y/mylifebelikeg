import { permanentRedirect } from "next/navigation";

/**
 * P8.2: the someday list became the Dream Diary at /dreams -- "the
 * someday list is not a new object, it is someday_items growing up"
 * (CLAUDE.md's P8 framing) applies to the route too, not just the
 * table. `permanentRedirect` (308, not the default 307 `redirect`
 * gives) since this is a genuine permanent move, not a conditional
 * bounce -- every inbound link (nav history, bookmarks, the old
 * `/someday` reference this app itself used to emit in llama triggers
 * and revalidatePath calls, all updated to /dreams as part of this same
 * change) should update to the new URL, not keep re-resolving through
 * this redirect forever.
 */
export default function SomedayRedirect() {
  permanentRedirect("/dreams");
}
