"use client";

import { useActionState, useState, useSyncExternalStore } from "react";

import { completeOnboarding, type OnboardingFormState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const initialState: OnboardingFormState = {};

const FALLBACK_TIMEZONE = "Australia/Brisbane";

const CURRENCIES = [
  "AUD",
  "USD",
  "GBP",
  "EUR",
  "NZD",
  "JPY",
  "CAD",
  "SGD",
] as const;

const HANDLE_PATTERN = /^[a-z0-9_]{3,30}$/;

// The server has no idea what the browser's zone is, so this has to read
// it client-side. useSyncExternalStore (rather than useState + useEffect)
// is what lets that browser-only value replace the SSR fallback without
// a hydration-mismatch warning: it renders the fallback for the pass that
// has to match server HTML, then the real value once hydrated.
const noopSubscribe = () => () => {};
function getDetectedTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return FALLBACK_TIMEZONE;
  }
}

export function OnboardingForm() {
  const [state, formAction, pending] = useActionState(
    completeOnboarding,
    initialState,
  );
  const [handle, setHandle] = useState("");
  const detectedTimezone = useSyncExternalStore(
    noopSubscribe,
    getDetectedTimezone,
    () => FALLBACK_TIMEZONE,
  );
  const [timezone, setTimezone] = useState(detectedTimezone);

  const handleIsValid = handle.length === 0 || HANDLE_PATTERN.test(handle);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="display_name">Display name</Label>
        <Input id="display_name" name="display_name" required />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="handle">Handle</Label>
        <Input
          id="handle"
          name="handle"
          required
          value={handle}
          onChange={(e) => setHandle(e.target.value.toLowerCase())}
          aria-invalid={!handleIsValid}
        />
        <p
          className={
            handleIsValid
              ? "text-muted-foreground text-sm"
              : "text-rag-red text-sm"
          }
        >
          3–30 characters: lowercase letters, numbers, underscores only.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="base_currency">Base currency</Label>
        <Select name="base_currency" defaultValue="AUD">
          <SelectTrigger id="base_currency" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CURRENCIES.map((currency) => (
              <SelectItem key={currency} value={currency}>
                {currency}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="timezone">Timezone</Label>
        <Input
          id="timezone"
          name="timezone"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
        />
      </div>

      {state.error && (
        <p role="alert" className="text-rag-red text-sm">
          {state.error}
        </p>
      )}

      <Button
        type="submit"
        disabled={pending || !handleIsValid || handle.length === 0}
        className="mt-2"
      >
        {pending ? "Creating profile…" : "Continue"}
      </Button>
    </form>
  );
}
