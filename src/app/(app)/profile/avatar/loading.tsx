import {
  CardGridSkeleton,
  PageHeaderSkeleton,
} from "@/components/loading-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function AvatarEditorLoading() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-6">
      <PageHeaderSkeleton />
      <Skeleton className="mx-auto h-[120px] w-[120px] rounded-2xl" />
      <CardGridSkeleton cards={12} />
    </div>
  );
}
