import { CardGridSkeleton } from "@/components/loading-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function ProfileLoading() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 p-6">
      <div className="flex items-start gap-4">
        <Skeleton className="h-24 w-24 shrink-0 rounded-2xl" />
        <div className="flex flex-col gap-2 pt-1">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
      <CardGridSkeleton cards={6} />
    </div>
  );
}
