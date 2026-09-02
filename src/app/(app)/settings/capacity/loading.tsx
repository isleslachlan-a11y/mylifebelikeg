import {
  ListSkeleton,
  PageHeaderSkeleton,
} from "@/components/loading-skeletons";

export default function CapacityLoading() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <PageHeaderSkeleton />
      <ListSkeleton rows={2} />
    </div>
  );
}
