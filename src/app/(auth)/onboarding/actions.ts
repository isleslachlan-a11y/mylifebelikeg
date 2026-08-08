"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type OnboardingFormState = { error?: string };

const HANDLE_PATTERN = /^[a-z0-9_]{3,30}$/;

export async function completeOnboarding(
  _prevState: OnboardingFormState,
  formData: FormData,
): Promise<OnboardingFormState> {
  const displayName = String(formData.get("display_name") ?? "").trim();
  const handle = String(formData.get("handle") ?? "").trim();
  const baseCurrency = String(formData.get("base_currency") ?? "AUD");
  const timezone = String(formData.get("timezone") ?? "Australia/Brisbane");

  if (!displayName) {
    return { error: "Enter a display name." };
  }
  if (!HANDLE_PATTERN.test(handle)) {
    return {
      error:
        "Handles are 3–30 characters: lowercase letters, numbers, and underscores only.",
    };
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }

  // Inserting fires a database trigger that seeds seven default life areas —
  // don't create them here.
  const { error } = await supabase.from("profiles").insert({
    id: auth.claims.sub,
    display_name: displayName,
    handle,
    base_currency: baseCurrency,
    timezone,
    onboarded_at: new Date().toISOString(),
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "That handle is taken — try another." };
    }
    return {
      error: "Something went wrong creating your profile. Please try again.",
    };
  }

  redirect("/dashboard");
}
