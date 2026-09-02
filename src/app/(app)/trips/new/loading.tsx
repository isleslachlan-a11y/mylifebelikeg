import { PageHeaderSkeleton } from "@/components/loading-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function NewTripLoading() {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 p-6">
      <PageHeaderSkeleton />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}
