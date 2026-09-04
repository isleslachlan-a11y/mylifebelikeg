"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  requestPasswordReset,
  type ForgotPasswordFormState,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: ForgotPasswordFormState = {};

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(
    requestPasswordReset,
    initialState,
  );

  if (state.message) {
    return (
      <p className="text-foreground text-sm" role="status">
        {state.message}
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </div>
      {state.error && (
        <p role="alert" className="text-rag-red text-sm">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? "Sending…" : "Send reset link"}
      </Button>
      <p className="text-muted-foreground text-center text-sm">
        <Link href="/login" className="text-primary hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
