import { LogOut } from "lucide-react";

import { signOut } from "@/app/(app)/actions";
import { cn } from "@/lib/utils";

// A plain server action bound to a form — no client component needed.
export function SignOutButton({ className }: { className?: string }) {
  return (
    <form action={signOut}>
      <button
        type="submit"
        className={cn(
          "text-muted-foreground hover:bg-raised hover:text-foreground flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
          className,
        )}
      >
        <LogOut className="size-5 shrink-0" aria-hidden />
        Sign out
      </button>
    </form>
  );
}
