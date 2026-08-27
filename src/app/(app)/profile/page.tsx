import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) {
    redirect("/login");
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="font-display text-3xl">Profile</h1>

      <div className="flex flex-col gap-2">
        <Link
          href="/settings/life-areas"
          className="text-primary text-sm underline-offset-4 hover:underline"
        >
          Manage life areas
        </Link>
        <Link
          href="/settings/capacity"
          className="text-primary text-sm underline-offset-4 hover:underline"
        >
          Manage capacity
        </Link>
      </div>
    </div>
  );
}
