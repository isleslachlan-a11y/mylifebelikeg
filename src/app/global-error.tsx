"use client";

import { useEffect } from "react";

/**
 * P5.5: the last-resort boundary — catches a failure in the *root*
 * layout itself (fonts, design tokens, the html/body shell), which
 * neither `(app)/error.tsx` nor `(auth)/error.tsx` can reach, since
 * both of those render *inside* that same root layout. Next.js requires
 * this file to render its own `<html>`/`<body>` — it fully replaces the
 * root layout when it fires, so none of `globals.css`'s tokens are
 * guaranteed to be loaded; styled with plain inline styles rather than
 * Tailwind classes for that reason, not an oversight. Same "Derek
 * message, not a stack trace" rule as the two route-group boundaries —
 * the raw `error.message` is still never rendered, only logged.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("root error boundary:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0918",
          color: "#edebfa",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}
      >
        <div
          style={{ textAlign: "center", maxWidth: "24rem", padding: "1.5rem" }}
        >
          <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>
            Something broke
          </h1>
          <p style={{ color: "#9b96c7", marginBottom: "1.5rem" }}>
            Not going to pretend that didn&rsquo;t happen. Try again — if it
            keeps happening, it&rsquo;s not you.
          </p>
          <button
            onClick={() => reset()}
            style={{
              background: "#8b7bd8",
              color: "#0a0918",
              border: "none",
              borderRadius: "0.5rem",
              padding: "0.625rem 1.25rem",
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
