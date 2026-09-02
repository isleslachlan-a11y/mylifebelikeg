import { ListSkeleton } from "@/components/loading-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function OtherProfileLoading() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 p-6">
      <div className="flex items-start gap-4">
        <Skeleton className="h-24 w-24 shrink-0 rounded-2xl" />
        <div className="flex flex-col gap-2 pt-1">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
      <ListSkeleton rows={3} />
    </div>
  );
}
