import { PageHeaderSkeleton } from "@/components/loading-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function MapOverviewLoading() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <PageHeaderSkeleton />
      <Skeleton className="h-[32rem] w-full rounded-lg" />
    </div>
  );
}
