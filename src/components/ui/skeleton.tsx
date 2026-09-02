import { cn } from "@/lib/utils";

// The one shadcn/ui primitive this project didn't have yet — added for
// P5.5's "skeletons, not spinners" requirement. Every route's own
// loading.tsx composes this into a shape roughly matching that route's
// real content, rather than a single centred spinner: a skeleton is
// supposed to make the *shape* of the page appear immediately, so the
// layout doesn't visibly jump once real data arrives.
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("bg-raised animate-pulse rounded-md", className)}
      {...props}
    />
  );
}

export { Skeleton };
