import { Suspense } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { ResetPasswordForm } from "./reset-password-form";

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="font-display text-2xl">
            Choose a new password
          </CardTitle>
          <CardDescription>
            Make it something you haven&rsquo;t used here before.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* useSearchParams (inside ResetPasswordForm) forces a
              Suspense boundary here -- this page has no server-side
              data fetch of its own, so Next tries to statically
              prerender it by default, and that prerender fails outright
              without this wrapper (confirmed by a real build error, not
              assumed) since reading the URL's ?code= can only happen
              client-side, after hydration. */}
          <Suspense
            fallback={
              <p className="text-muted-foreground text-sm">Loading…</p>
            }
          >
            <ResetPasswordForm />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}
