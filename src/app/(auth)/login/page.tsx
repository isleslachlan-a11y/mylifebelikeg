import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { LoginForm } from "./login-form";

/**
 * `searchParams` drives a couple of one-line notices above the form —
 * `passwordReset=1` (this package) and `accountDeletionRequested=1`
 * (P9.1's `requestAccountDeletion`, which redirects here after signing
 * out; previously unread by this page, a loose end from that pass
 * fixed in passing since this file was already being touched). Both
 * are plain presence checks, not values trusted for anything — a
 * forged `?passwordReset=1` on someone else's visit shows an
 * unearned but harmless "password updated" line, nothing more.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    passwordReset?: string;
    accountDeletionRequested?: string;
  }>;
}) {
  const { passwordReset, accountDeletionRequested } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="font-display text-2xl">
            Sign in to Starmap
          </CardTitle>
          <CardDescription>
            Pick up your plan where you left it.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {passwordReset && (
            <p role="status" className="text-foreground text-sm">
              Password updated — sign in with your new one.
            </p>
          )}
          {accountDeletionRequested && (
            <p role="status" className="text-foreground text-sm">
              Account deletion requested. Sign back in any time during the
              7-day grace period to cancel it.
            </p>
          )}
          <LoginForm />
        </CardContent>
      </Card>
    </main>
  );
}
