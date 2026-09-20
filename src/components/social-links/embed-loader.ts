/**
 * "Load each platform script at most once per page, lazily, only after
 * a user activation" (brief, verbatim). A module-scope cache keyed by
 * script `src`, not per-component state -- two different cards for the
 * same platform (or the same card re-activated) share one promise, so
 * only the first ever call actually creates a `<script>` element; every
 * later call for the same src resolves off the cached one. This is the
 * whole mechanism that makes "a second card of the same platform does
 * not inject a second script tag" true.
 */
const scriptPromises = new Map<string, Promise<void>>();

export function loadEmbedScript(src: string): Promise<void> {
  const existing = scriptPromises.get(src);
  if (existing) return existing;

  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      // A failed load shouldn't permanently poison the cache -- a
      // retry (a different card activating, or the same one again)
      // gets a fresh attempt rather than an instantly-rejected promise
      // forever.
      scriptPromises.delete(src);
      reject(new Error(`Failed to load ${src}`));
    };
    document.body.appendChild(script);
  });

  scriptPromises.set(src, promise);
  return promise;
}

/** Test-only escape hatch -- component tests need a clean cache between cases so "does this inject a script" assertions aren't polluted by an earlier test's activation. Never called from application code. */
export function __resetEmbedScriptCacheForTests(): void {
  scriptPromises.clear();
}
