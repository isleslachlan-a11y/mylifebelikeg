"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Debounces a free-text autosave (goal notes, the overall note) — rating
 * taps call their server action immediately (P4.1: discrete, infrequent),
 * but typed text would otherwise fire a save per keystroke.
 *
 * On unmount, a still-pending save is *flushed*, not dropped: a goal's
 * note lives inside GoalRatingCard, which mobile's stepper unmounts the
 * instant "Next" is tapped — losing whatever was typed in the last
 * `delayMs` there would quietly break "ratings save as you go" (P4.1
 * brief) for exactly the fast-tap case the stepper flow encourages. This
 * doesn't cover an abrupt tab close mid-debounce (React's cleanup effects
 * aren't guaranteed to run in time for that) — only SPA-internal
 * navigation, which is the case the stepper actually creates.
 */
export function useDebouncedCallback<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delayMs: number,
): (...args: Args) => void {
  const fnRef = useRef(fn);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingArgsRef = useRef<Args | null>(null);

  // Refs can't be written during render (react-hooks/refs) — this syncs
  // fnRef after every render instead, so both the debounced call and the
  // unmount flush below always see the latest closure.
  useEffect(() => {
    fnRef.current = fn;
  });

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        if (pendingArgsRef.current) {
          fnRef.current(...pendingArgsRef.current);
        }
      }
    };
  }, []);

  return useCallback(
    (...args: Args) => {
      pendingArgsRef.current = args;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        pendingArgsRef.current = null;
        fnRef.current(...args);
      }, delayMs);
    },
    [delayMs],
  );
}
